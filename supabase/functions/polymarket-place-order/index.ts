import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { decrypt } from "../_shared/crypto.ts";
import { getServiceClient } from "../_shared/supabase-admin.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-admin-token",
};

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function hmacSign(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    base64ToBytes(secret),
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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResp({ ok: false, error: "POST required" }, 405);
  }

  try {
    const body = await req.json();
    const { tokenId, side, price, size, orderType } = body;

    if (!tokenId || !side || !price || !size) {
      return jsonResp({ ok: false, error: "Missing required fields: tokenId, side, price, size" }, 400);
    }

    // ── Load and decrypt creds ──────────────────────────────────────
    const masterKey = Deno.env.get("MASTER_KEY");
    if (!masterKey) {
      return jsonResp({ ok: false, error: "MASTER_KEY not configured on server" }, 500);
    }

    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from("polymarket_secrets")
      .select("value_encrypted, iv, auth_tag")
      .eq("name", "polymarket_api_creds")
      .maybeSingle();

    if (error || !data) {
      return jsonResp({ ok: false, error: "No trading credentials stored. Go to Settings → Polymarket to import or derive credentials." }, 500);
    }

    let creds: { apiKey: string; secret: string; passphrase: string; address?: string; note?: string };
    try {
      const credsJson = await decrypt(data.value_encrypted, data.iv, data.auth_tag, masterKey);
      creds = JSON.parse(credsJson);
    } catch (e) {
      return jsonResp({ ok: false, error: `Failed to decrypt credentials: ${e.message}` }, 500);
    }

    // Validate required fields exist
    if (!creds.apiKey || !creds.secret || !creds.passphrase) {
      const missing = [
        !creds.apiKey && "apiKey",
        !creds.secret && "secret",
        !creds.passphrase && "passphrase",
      ].filter(Boolean);
      return jsonResp({ ok: false, error: `Incomplete credentials (missing: ${missing.join(", ")}). Re-import or re-derive.` }, 500);
    }

    // Reject placeholder credentials
    if (creds.apiKey.startsWith("pm_placeholder") || creds.note === "placeholder") {
      return jsonResp({ ok: false, error: "Cannot place orders with placeholder credentials. Import real CLOB credentials first." }, 400);
    }

    // ── Debug logging (server-side only, no secrets leaked) ─────────
    const apiKeyTail = creds.apiKey.slice(-6);
    const addrShort = creds.address ? `${creds.address.slice(0, 6)}…${creds.address.slice(-4)}` : "none";
    console.log(`[place-order] creds loaded — apiKey:…${apiKeyTail}, passphrase len:${creds.passphrase.length}, address:${addrShort}`);

    // ── Pre-flight auth check ───────────────────────────────────────
    const clobHost = Deno.env.get("CLOB_HOST") || "https://clob.polymarket.com";

    const preTs = Math.floor(Date.now() / 1000).toString();
    const prePath = "/auth/api-keys";
    const preSig = await hmacSign(creds.secret, preTs + "GET" + prePath);
    const preHeaders: Record<string, string> = {
      "POLY_API_KEY": creds.apiKey,
      "POLY_PASSPHRASE": creds.passphrase,
      "POLY_TIMESTAMP": preTs,
      "POLY_SIGNATURE": preSig,
    };
    if (creds.address) preHeaders["POLY_ADDRESS"] = creds.address;

    const preCheck = await fetch(`${clobHost}${prePath}`, { method: "GET", headers: preHeaders });
    if (!preCheck.ok) {
      const preBody = await preCheck.text();
      console.error(`[place-order] PRE-FLIGHT AUTH FAILED ${preCheck.status}: ${preBody.substring(0, 200)}`);
      return jsonResp({
        ok: false,
        error: `Credentials rejected by Polymarket (${preCheck.status}). Your API key may be expired or invalid. Re-derive or re-import credentials.`,
        debug: {
          status: preCheck.status,
          apiKeyTail,
          address: addrShort,
          response: preBody.substring(0, 200),
        },
      }, 401);
    } else {
      await preCheck.text(); // consume body
      console.log("[place-order] pre-flight auth OK");
    }

    // ── Build and sign the order request ────────────────────────────
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const method = "POST";
    const requestPath = "/order";

    const orderPayload = {
      tokenID: tokenId,
      side: side.toUpperCase(),
      price: parseFloat(price).toFixed(2),
      size: parseFloat(size).toFixed(2),
      type: orderType || "GTC",
    };
    const orderBody = JSON.stringify(orderPayload);

    // Signature = HMAC-SHA256(base64decode(secret), timestamp + method + path + body) → base64
    const signMessage = timestamp + method + requestPath + orderBody;
    const signature = await hmacSign(creds.secret, signMessage);

    console.log(`[place-order] signing: method=${method}, path=${requestPath}, bodyLen=${orderBody.length}`);

    const hdrs: Record<string, string> = {
      "POLY_API_KEY": creds.apiKey,
      "POLY_PASSPHRASE": creds.passphrase,
      "POLY_TIMESTAMP": timestamp,
      "POLY_SIGNATURE": signature,
      "Content-Type": "application/json",
    };
    if (creds.address) hdrs["POLY_ADDRESS"] = creds.address;

    // ── Send to CLOB ────────────────────────────────────────────────
    const url = `${clobHost}${requestPath}`;
    console.log(`[place-order] POST ${url}`);

    const res = await fetch(url, { method, headers: hdrs, body: orderBody });
    const resBody = await res.text();

    console.log(`[place-order] response: ${res.status} ${resBody.substring(0, 300)}`);

    if (res.ok) {
      let parsed;
      try { parsed = JSON.parse(resBody); } catch { parsed = resBody; }
      return jsonResp({ ok: true, order: parsed });
    } else {
      return jsonResp(
        { ok: false, error: `Order failed (${res.status}): ${resBody.substring(0, 300)}` },
        res.status
      );
    }
  } catch (err) {
    console.error("[place-order] unexpected error:", err);
    return jsonResp({ ok: false, error: err.message }, 500);
  }
});
