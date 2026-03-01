import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encrypt } from "../_shared/crypto.ts";
import { getServiceClient } from "../_shared/supabase-admin.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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
    // ── Authenticate user via JWT ────────────────────────────────
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return jsonResp({ ok: false, error: "Authorization header required" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return jsonResp({ ok: false, error: "Invalid or expired auth token" }, 401);
    }

    // ── Parse input ──────────────────────────────────────────────
    const body = await req.json();
    const { address, signature, timestamp, nonce: rawNonce } = body;

    if (!address || !signature) {
      return jsonResp({ ok: false, error: "address and signature required" }, 400);
    }

    if (!timestamp) {
      return jsonResp({ ok: false, error: "Missing timestamp" }, 400);
    }

    // Use exactly the nonce the client signed (default "0")
    const nonce = String(rawNonce ?? "0");

    const clobHost = "https://clob.polymarket.com";

    // L1 auth headers — must match exactly what the user signed in EIP-712
    const l1Headers: Record<string, string> = {
      "POLY_ADDRESS": address,
      "POLY_SIGNATURE": signature,
      "POLY_TIMESTAMP": timestamp,
      "POLY_NONCE": nonce,
    };

    console.log(`[l1-derive] user=${user.id}, address=${address.slice(0, 10)}..., ts=${timestamp}, nonce=${nonce}`);

    // ── Step 1: Try GET /auth/derive-api-key first (re-derive existing key) ──
    let creds: { apiKey: string; secret: string; passphrase: string } | null = null;

    const deriveRes = await fetch(`${clobHost}/auth/derive-api-key`, {
      method: "GET",
      headers: l1Headers,
    });
    const deriveBody = await deriveRes.text();
    console.log(`[l1-derive] derive status=${deriveRes.status} body=${deriveBody.substring(0, 500)}`);

    if (deriveRes.ok) {
      try {
        creds = JSON.parse(deriveBody);
      } catch {
        console.error("[l1-derive] Failed to parse derive response");
      }
    }

    // ── Step 2: Fallback to POST /auth/api-key (create new key) ──
    if (!creds || !creds.apiKey) {
      console.log(`[l1-derive] derive failed (${deriveRes.status}), trying POST /auth/api-key`);
      const createRes = await fetch(`${clobHost}/auth/api-key`, {
        method: "POST",
        headers: l1Headers,
      });
      const createBody = await createRes.text();
      console.log(`[l1-derive] create status=${createRes.status} body=${createBody.substring(0, 500)}`);

      if (!createRes.ok) {
        return jsonResp({
          ok: false,
          error: `Polymarket rejected (derive=${deriveRes.status}, create=${createRes.status}): ${createBody.substring(0, 300)}`,
        }, 502);
      }

      try {
        creds = JSON.parse(createBody);
      } catch {
        return jsonResp({ ok: false, error: `Invalid JSON from Polymarket: ${createBody.substring(0, 200)}` }, 502);
      }
    }

    if (!creds?.apiKey || !creds?.secret || !creds?.passphrase) {
      return jsonResp({ ok: false, error: "Incomplete credentials from Polymarket" }, 502);
    }

    console.log(`[l1-derive] Got creds apiKey=…${creds.apiKey.slice(-6)}, secretLen=${creds.secret.length}`);

    // ── Encrypt and store per-user (skip hard validation to avoid propagation-delay 502s) ──
    const masterKey = Deno.env.get("MASTER_KEY");
    if (!masterKey) {
      return jsonResp({ ok: false, error: "MASTER_KEY not configured" }, 500);
    }

    const credsPayload = JSON.stringify({
      apiKey: creds.apiKey,
      secret: creds.secret,
      passphrase: creds.passphrase,
    });

    const { encrypted, iv, authTag } = await encrypt(credsPayload, masterKey);

    const adminClient = getServiceClient();
    const { error: upsertError } = await adminClient
      .from("polymarket_user_creds")
      .upsert(
        {
          user_id: user.id,
          address: address.toLowerCase(),
          value_encrypted: encrypted,
          iv,
          auth_tag: authTag,
        },
        { onConflict: "user_id" }
      );

    if (upsertError) {
      console.error("[l1-derive] DB upsert error:", upsertError.message);
      return jsonResp({ ok: false, error: "Failed to store credentials" }, 500);
    }

    console.log(`[l1-derive] Credentials stored for user=${user.id}`);
    return jsonResp({ ok: true });
  } catch (err) {
    console.error("[l1-derive] error:", err);
    return jsonResp({ ok: false, error: err.message }, 500);
  }
});
