import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { decrypt } from "../_shared/crypto.ts";
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
  return b64.replace(/\+/g, "-").replace(/\//g, "_");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return jsonResp({ valid: false, error: "No auth" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return jsonResp({ valid: false, error: "Not authenticated" }, 401);

    const masterKey = Deno.env.get("MASTER_KEY");
    if (!masterKey) return jsonResp({ valid: false, error: "Server config error" }, 500);

    const adminClient = getServiceClient();
    const { data: credRow } = await adminClient
      .from("polymarket_user_creds")
      .select("value_encrypted, iv, auth_tag, address")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!credRow) {
      return jsonResp({ valid: false, hasCreds: false });
    }

    let creds: { apiKey: string; secret: string; passphrase: string };
    try {
      const json = await decrypt(credRow.value_encrypted, credRow.iv, credRow.auth_tag, masterKey);
      creds = JSON.parse(json);
    } catch {
      return jsonResp({ valid: false, hasCreds: true, error: "Decrypt failed" });
    }

    // Test L2 auth against CLOB
    const clobHost = Deno.env.get("CLOB_HOST") || "https://clob.polymarket.com";
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const method = "GET";
    const requestPath = "/auth/api-keys";
    const signMessage = timestamp + method + requestPath;
    const signature = await buildL2Signature(creds.secret, signMessage);

    const res = await fetch(`${clobHost}${requestPath}`, {
      method,
      headers: {
        "POLY_ADDRESS": (credRow.address || "").toLowerCase(),
        "POLY_API_KEY": creds.apiKey,
        "POLY_PASSPHRASE": creds.passphrase,
        "POLY_TIMESTAMP": timestamp,
        "POLY_SIGNATURE": signature,
      },
    });

    const body = await res.text();

    if (res.ok) {
      return jsonResp({ valid: true, hasCreds: true, status: res.status });
    }

    // If invalid, delete stale creds
    if (res.status === 401) {
      await adminClient.from("polymarket_user_creds").delete().eq("user_id", user.id);
      return jsonResp({ valid: false, hasCreds: false, deleted: true, reason: body.substring(0, 200) });
    }

    return jsonResp({ valid: false, hasCreds: true, status: res.status, reason: body.substring(0, 200) });
  } catch (err) {
    console.error("[test-creds] error:", err);
    return jsonResp({ valid: false, error: err.message }, 500);
  }
});
