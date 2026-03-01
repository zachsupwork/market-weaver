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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ── Auth ──
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

    // ── Load user creds ──
    const masterKey = Deno.env.get("MASTER_KEY");
    if (!masterKey) return jsonResp({ ok: false, error: "MASTER_KEY not configured" }, 500);

    const adminClient = getServiceClient();
    const { data: credRow } = await adminClient
      .from("polymarket_user_creds")
      .select("value_encrypted, iv, auth_tag, address")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!credRow) {
      return jsonResp({ ok: false, error: "No trading credentials. Enable trading first." }, 400);
    }

    const credsJson = await decrypt(credRow.value_encrypted, credRow.iv, credRow.auth_tag, masterKey);
    const creds = JSON.parse(credsJson);

    // ── Fetch open orders from CLOB ──
    const clobHost = Deno.env.get("CLOB_HOST") || "https://clob.polymarket.com";
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const requestPath = "/data/orders";
    const signMessage = timestamp + "GET" + requestPath;
    const signature = toUrlSafeBase64(await hmacSign(creds.secret, signMessage));

    console.log(`[orders] user=${user.id} path=${requestPath} ts=${timestamp} addr=${credRow.address}`);

    const res = await fetch(`${clobHost}${requestPath}`, {
      method: "GET",
      headers: {
        "POLY_API_KEY": creds.apiKey,
        "POLY_PASSPHRASE": creds.passphrase,
        "POLY_TIMESTAMP": timestamp,
        "POLY_SIGNATURE": signature,
        "POLY_ADDRESS": credRow.address,
        "Accept": "application/json",
      },
    });

    const resBody = await res.text();
    console.log(`[orders] user=${user.id} CLOB: ${res.status}`);

    if (!res.ok) {
      return jsonResp({
        ok: false,
        error: `CLOB error (${res.status}): ${resBody.substring(0, 300)}`,
      }, res.status);
    }

    let parsed;
    try { parsed = JSON.parse(resBody); } catch { parsed = []; }

    return jsonResp({ ok: true, orders: Array.isArray(parsed) ? parsed : [] });
  } catch (err) {
    console.error("[orders] Error:", err);
    return jsonResp({ ok: false, error: err.message }, 500);
  }
});
