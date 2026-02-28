import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { decrypt } from "../_shared/crypto.ts";
import { getServiceClient } from "../_shared/supabase-admin.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function base64ToBytes(base64: string): Uint8Array {
  const sanitized = base64
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .replace(/[^A-Za-z0-9+/=]/g, "");

  const binary = atob(sanitized);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function toUrlSafeBase64(base64: string): string {
  return base64.replace(/\+/g, "-").replace(/\//g, "_");
}

async function hmacSign(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    base64ToBytes(secret.trim()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

function jsonResp(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Simple geoblock check via Cloudflare headers
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
    // ── Geoblock check ──────────────────────────────────────────
    if (isGeoblocked(req)) {
      return jsonResp({
        ok: false,
        error: "Trading is not available in your jurisdiction.",
        code: "GEOBLOCKED",
      }, 403);
    }

    // ── Authenticate user ───────────────────────────────────────
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

    // ── Load user's encrypted creds ─────────────────────────────
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
      return jsonResp({
        ok: false,
        error: "No trading credentials found. Enable trading in Settings first.",
        code: "NO_CREDS",
      }, 400);
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

    // ── Parse signed order from client ──────────────────────────
    const body = await req.json();
    const { signedOrder, orderType: rawOrderType } = body;

    if (!signedOrder) {
      return jsonResp({ ok: false, error: "signedOrder is required" }, 400);
    }

    const orderType = ["GTC", "FOK", "GTD", "FAK"].includes(String(rawOrderType))
      ? String(rawOrderType)
      : "GTC";

    // Transform SignedOrder into the CLOB-expected payload format.
    // The client sends a raw SignedOrder object from @polymarket/clob-client's createOrder().
    // We must apply the same transformation as orderToJson():
    //   - salt parsed as integer
    //   - side mapped to "BUY"/"SELL" string
    //   - owner set to the API key (NOT the wallet address)
    function buildOrderPayload(signed: any, apiKey: string, ot: string) {
      // If already wrapped (has .order sub-object), use as-is but fix owner
      if (signed?.order?.maker) {
        return { ...signed, owner: apiKey, orderType: ot };
      }
      // Map side: 0 = BUY, 1 = SELL (from @polymarket/order-utils Side enum)
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

    console.log(`[post-order] Payload owner=${creds.apiKey.slice(-6)}, maker=${sendOrderPayload.order?.maker}, signer=${sendOrderPayload.order?.signer}`);

    // ── Sign L2 HMAC and POST to CLOB ───────────────────────────
    const clobHost = Deno.env.get("CLOB_HOST") || "https://clob.polymarket.com";
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const method = "POST";
    const requestPath = "/order";
    const orderBody = JSON.stringify(sendOrderPayload);

    const signMessage = timestamp + method + requestPath + orderBody;
    const signature = await hmacSign(creds.secret, signMessage);

    const apiKeyTail = creds.apiKey.slice(-6);
    console.log(`[post-order] user=${user.id}, apiKey:…${apiKeyTail}, bodyLen=${orderBody.length}`);

    const headerAddress = sendOrderPayload.order?.signer || credRow.address;
    const hdrs: Record<string, string> = {
      "POLY_API_KEY": creds.apiKey,
      "POLY_PASSPHRASE": creds.passphrase,
      "POLY_TIMESTAMP": timestamp,
      "POLY_SIGNATURE": signature,
      "POLY_ADDRESS": headerAddress,
      "Content-Type": "application/json",
    };

    const res = await fetch(`${clobHost}${requestPath}`, {
      method,
      headers: hdrs,
      body: orderBody,
    });

    const resBody = await res.text();
    console.log(`[post-order] CLOB ${res.status} headers:`, JSON.stringify(Object.fromEntries(res.headers)));
    console.log(`[post-order] CLOB body: ${resBody.substring(0, 1000)}`);
    console.log(`[post-order] Request sent: path=${requestPath}, bodyLen=${orderBody.length}, addr=${credRow.address}`);

    if (res.ok) {
      let parsed;
      try { parsed = JSON.parse(resBody); } catch { parsed = resBody; }
      return jsonResp({ ok: true, order: parsed });
    } else {
      const upstreamSnippet = resBody.substring(0, 1000);
      const invalidKey = res.status === 401 && /invalid api key|unauthorized/i.test(resBody);

      if (invalidKey) {
        // Stored user creds are stale/invalid; clear them so client can re-derive cleanly.
        await adminClient.from("polymarket_user_creds").delete().eq("user_id", user.id);

        return jsonResp({
          ok: false,
          code: "INVALID_API_KEY",
          error: "Trading credentials expired or invalid. Please re-enable trading in Setup.",
          upstreamStatus: res.status,
          upstreamBody: upstreamSnippet,
        });
      }

      return jsonResp({
        ok: false,
        code: "ORDER_REJECTED",
        error: `Order failed (${res.status}): ${resBody.substring(0, 500)}`,
        upstreamStatus: res.status,
        upstreamBody: upstreamSnippet,
        debug: {
          requestPath,
          method,
          address: credRow.address,
          apiKeyTail,
          timestamp,
        },
      });
    }
  } catch (err) {
    console.error("[post-order] error:", err);
    return jsonResp({ ok: false, error: err.message, stack: err.stack?.substring(0, 500) }, 500);
  }
});
