import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { decrypt } from "../_shared/crypto.ts";
import { getServiceClient } from "../_shared/supabase-admin.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function tryDecodeBase64(input: string): Uint8Array | null {
  try {
    const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

async function hmacSign(secret: string, message: string): Promise<string> {
  const trimmed = secret.trim();
  const secretBytes = tryDecodeBase64(trimmed) ?? new TextEncoder().encode(trimmed);

  const key = await crypto.subtle.importKey(
    "raw",
    secretBytes,
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

  if (req.method !== "POST" && req.method !== "DELETE") {
    return jsonResp({ ok: false, error: "POST or DELETE required" }, 405);
  }

  try {
    // ── Auth ─────────────────────────────────────────────────────
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

    // ── Load user creds ─────────────────────────────────────────
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

    const body = await req.json();
    const { orderId } = body;
    if (!orderId) {
      return jsonResp({ ok: false, error: "orderId required" }, 400);
    }

    // ── Cancel on CLOB ──────────────────────────────────────────
    const clobHost = Deno.env.get("CLOB_HOST") || "https://clob.polymarket.com";
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const requestPath = "/order";
    const cancelBody = JSON.stringify({ orderID: orderId });
    const signMessage = timestamp + "DELETE" + requestPath + cancelBody;
    const signature = await hmacSign(creds.secret, signMessage);

    const res = await fetch(`${clobHost}${requestPath}`, {
      method: "DELETE",
      headers: {
        "POLY_API_KEY": creds.apiKey,
        "POLY_PASSPHRASE": creds.passphrase,
        "POLY_TIMESTAMP": timestamp,
        "POLY_SIGNATURE": signature,
        "POLY_ADDRESS": credRow.address,
        "Content-Type": "application/json",
      },
      body: cancelBody,
    });

    const resBody = await res.text();
    console.log(`[cancel-order] user=${user.id} CLOB: ${res.status}`);

    if (res.ok) {
      let parsed;
      try { parsed = JSON.parse(resBody); } catch { parsed = resBody; }
      return jsonResp({ ok: true, result: parsed });
    } else {
      const upstreamSnippet = resBody.substring(0, 500);
      const invalidKey = res.status === 401 && /invalid api key|unauthorized/i.test(resBody);

      if (invalidKey) {
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
        code: "CANCEL_REJECTED",
        error: `Cancel failed (${res.status}): ${upstreamSnippet}`,
        upstreamStatus: res.status,
        upstreamBody: upstreamSnippet,
      });
    }
  } catch (err) {
    console.error("[cancel-order] error:", err);
    return jsonResp({ ok: false, error: err.message }, 500);
  }
});
