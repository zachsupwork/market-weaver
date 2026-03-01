import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { decrypt } from "../_shared/crypto.ts";
import { getServiceClient } from "../_shared/supabase-admin.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Canonical L2 HMAC signature — matches official Polymarket Python client exactly:
 *   1. urlsafe_b64decode(secret) → key bytes
 *   2. HMAC-SHA256(key, message)
 *   3. urlsafe_b64encode(digest) → signature (with padding)
 */
async function buildL2Signature(secret: string, message: string): Promise<string> {
  const trimmed = secret.trim();
  const normalized = trimmed.replace(/-/g, "+").replace(/_/g, "/").replace(/\s+/g, "");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const secretBytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) secretBytes[i] = binary.charCodeAt(i);

  const key = await crypto.subtle.importKey(
    "raw",
    secretBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  const b64 = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return b64.replace(/\+/g, "-").replace(/\//g, "_"); // URL-safe with padding
}

function jsonResp(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isGeoblocked(req: Request): boolean {
  const country = req.headers.get("cf-ipcountry") || "";
  const blocked = ["US", "CU", "IR", "KP", "SY", "RU"];
  return blocked.includes(country.toUpperCase());
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResp({ ok: false, error: "POST required" }, 405);
  }

  try {
    if (isGeoblocked(req)) {
      return jsonResp({ ok: false, error: "Trading is not available in your jurisdiction.", code: "GEOBLOCKED" }, 403);
    }

    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return jsonResp({ ok: false, error: "Authorization required" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return jsonResp({ ok: false, error: "Invalid auth token" }, 401);
    }

    const masterKey = Deno.env.get("MASTER_KEY");
    if (!masterKey) {
      return jsonResp({ ok: false, error: "MASTER_KEY not configured" }, 500);
    }

    const adminClient = getServiceClient();
    const { data: credRow, error: credError } = await adminClient
      .from("polymarket_user_creds")
      .select("value_encrypted, iv, auth_tag, address")
      .eq("user_id", user.id)
      .maybeSingle();

    if (credError || !credRow) {
      return jsonResp({ ok: false, error: "No trading credentials found. Enable trading first.", code: "NO_CREDS" }, 400);
    }

    let creds: { apiKey: string; secret: string; passphrase: string };
    try {
      const credsJson = await decrypt(credRow.value_encrypted, credRow.iv, credRow.auth_tag, masterKey);
      creds = JSON.parse(credsJson);
    } catch (e) {
      return jsonResp({ ok: false, error: `Failed to decrypt credentials: ${e.message}` }, 500);
    }

    if (!creds.apiKey || !creds.secret || !creds.passphrase) {
      return jsonResp({ ok: false, error: "Incomplete credentials. Re-derive in Settings." }, 500);
    }

    const body = await req.json();
    const { signedOrder, orderType: rawOrderType } = body;

    if (!signedOrder) {
      return jsonResp({ ok: false, error: "signedOrder is required" }, 400);
    }

    const orderType = ["GTC", "FOK", "GTD", "FAK"].includes(String(rawOrderType))
      ? String(rawOrderType)
      : "GTC";

    function buildOrderPayload(signed: any, apiKey: string, ot: string) {
      if (signed?.order?.maker) {
        return { ...signed, owner: apiKey, orderType: ot };
      }
      let side = "BUY";
      if (signed.side === 1 || signed.side === "SELL" || signed.side === "1") {
        side = "SELL";
      }
      return {
        order: {
          salt: typeof signed.salt === "string" ? parseInt(signed.salt, 10) : signed.salt,
          maker: signed.maker,
          signer: signed.signer,
          taker: signed.taker,
          tokenId: signed.tokenId,
          makerAmount: signed.makerAmount,
          takerAmount: signed.takerAmount,
          side,
          expiration: signed.expiration,
          nonce: signed.nonce,
          feeRateBps: signed.feeRateBps,
          signatureType: signed.signatureType,
          signature: signed.signature,
        },
        owner: apiKey,
        orderType: ot,
      };
    }

    const sendOrderPayload = buildOrderPayload(signedOrder, creds.apiKey, orderType);

    // ── Early signer validation ────────────────────────────────
    const incomingSigner = (signedOrder?.order?.signer ?? signedOrder?.signer ?? "").toLowerCase();
    const storedAddr = (credRow.address || "").toLowerCase();
    if (incomingSigner && storedAddr && incomingSigner !== storedAddr) {
      console.error(`[post-order] SIGNER_MISMATCH: order.signer=${incomingSigner} stored=${storedAddr}`);
      return jsonResp({
        ok: false,
        code: "SIGNER_MISMATCH",
        error: "Order signer wallet does not match the wallet that created your Polymarket API key. Re-enable trading using the same wallet you are placing orders with.",
      }, 400);
    }

    // ── Build L2 HMAC signature (single canonical method) ───────
    const clobHost = Deno.env.get("CLOB_HOST") || "https://clob.polymarket.com";
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const method = "POST";
    const requestPath = "/order";
    const orderBody = JSON.stringify(sendOrderPayload);
    const signMessage = timestamp + method + requestPath + orderBody;
    const signature = await buildL2Signature(creds.secret, signMessage);

    const polyAddress = (credRow.address || "").toLowerCase();

    const orderParsed = JSON.parse(orderBody);
    console.log(`[post-order] user=${user.id}, apiKey=…${creds.apiKey.slice(-6)}, addr=${polyAddress}, bodyLen=${orderBody.length}`);
    console.log(`[post-order] order.maker=${orderParsed?.order?.maker}, order.signer=${orderParsed?.order?.signer}, signatureType=${orderParsed?.order?.signatureType}`);

    const res = await fetch(`${clobHost}${requestPath}`, {
      method,
      headers: {
        "POLY_ADDRESS": polyAddress,
        "POLY_API_KEY": creds.apiKey,
        "POLY_PASSPHRASE": creds.passphrase,
        "POLY_TIMESTAMP": timestamp,
        "POLY_SIGNATURE": signature,
        "Content-Type": "application/json",
      },
      body: orderBody,
    });

    const resBody = await res.text();
    console.log(`[post-order] CLOB status=${res.status} body=${resBody.substring(0, 500)}`);

    if (res.ok) {
      let parsed;
      try { parsed = JSON.parse(resBody); } catch { parsed = resBody; }
      return jsonResp({ ok: true, order: parsed });
    }

    // Handle invalid API key: delete stale creds so user can re-derive
    const invalidKey = res.status === 401 && /invalid api key|unauthorized|invalid authorization/i.test(resBody);
    if (invalidKey) {
      await adminClient.from("polymarket_user_creds").delete().eq("user_id", user.id);
      return jsonResp({
        ok: false,
        code: "INVALID_API_KEY",
        error: "Trading credentials expired. Please re-enable trading.",
        upstreamStatus: res.status,
        upstreamBody: resBody.substring(0, 500),
      });
    }

    return jsonResp({
      ok: false,
      code: "ORDER_REJECTED",
      error: `Order failed (${res.status}): ${resBody.substring(0, 500)}`,
      upstreamStatus: res.status,
      upstreamBody: resBody.substring(0, 500),
    });
  } catch (err) {
    console.error("[post-order] error:", err);
    return jsonResp({ ok: false, error: err.message }, 500);
  }
});
