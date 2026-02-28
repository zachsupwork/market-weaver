import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { decrypt } from "../_shared/crypto.ts";
import { getServiceClient } from "../_shared/supabase-admin.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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
    const { signedOrder } = body;

    if (!signedOrder) {
      return jsonResp({ ok: false, error: "signedOrder is required" }, 400);
    }

    // ── Sign L2 HMAC and POST to CLOB ───────────────────────────
    const clobHost = Deno.env.get("CLOB_HOST") || "https://clob.polymarket.com";
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const method = "POST";
    const requestPath = "/order";
    const orderBody = JSON.stringify(signedOrder);

    const signMessage = timestamp + method + requestPath + orderBody;
    const signature = await hmacSign(creds.secret, signMessage);

    const apiKeyTail = creds.apiKey.slice(-6);
    console.log(`[post-order] user=${user.id}, apiKey:…${apiKeyTail}, bodyLen=${orderBody.length}`);

    const hdrs: Record<string, string> = {
      "POLY_API_KEY": creds.apiKey,
      "POLY_PASSPHRASE": creds.passphrase,
      "POLY_TIMESTAMP": timestamp,
      "POLY_SIGNATURE": signature,
      "POLY_ADDRESS": credRow.address,
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
      return jsonResp(
        {
          ok: false,
          error: `Order failed (${res.status}): ${resBody.substring(0, 500)}`,
          upstreamStatus: res.status,
          upstreamBody: resBody.substring(0, 1000),
          debug: {
            requestPath,
            method,
            address: credRow.address,
            apiKeyTail,
            timestamp,
          },
        },
        res.status >= 500 ? 502 : res.status
      );
    }
  } catch (err) {
    console.error("[post-order] error:", err);
    return jsonResp({ ok: false, error: err.message, stack: err.stack?.substring(0, 500) }, 500);
  }
});
