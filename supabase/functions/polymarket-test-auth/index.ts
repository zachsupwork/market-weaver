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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const masterKey = Deno.env.get("MASTER_KEY");
    if (!masterKey) {
      return new Response(
        JSON.stringify({ ok: false, error: "MASTER_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from("polymarket_secrets")
      .select("value_encrypted, iv, auth_tag")
      .eq("name", "polymarket_api_creds")
      .maybeSingle();

    if (error || !data) {
      return new Response(
        JSON.stringify({ ok: false, error: "No stored credentials found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const credsJson = await decrypt(data.value_encrypted, data.iv, data.auth_tag, masterKey);
    const creds = JSON.parse(credsJson);

    // Detect placeholder credentials
    const isPlaceholder =
      creds.apiKey?.startsWith("pm_placeholder") ||
      creds.note === "placeholder" ||
      creds.note?.includes("edge function") ||
      creds.note?.includes("Generated via edge function");

    if (isPlaceholder) {
      return new Response(
        JSON.stringify({
          ok: false,
          placeholder: true,
          error: "Stored credentials are placeholders (storage test only). To authenticate with Polymarket, either run the GitHub Action 'Derive Polymarket API Credentials' or import real credentials manually.",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Test against real Polymarket CLOB API
    const clobHost = Deno.env.get("CLOB_HOST") || "https://clob.polymarket.com";

    // 1. Check reachability
    try {
      const timeRes = await fetch(`${clobHost}/time`);
      if (!timeRes.ok) {
        return new Response(
          JSON.stringify({ ok: false, error: `CLOB API unreachable (${timeRes.status})` }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } catch (e) {
      return new Response(
        JSON.stringify({ ok: false, error: `CLOB API unreachable: ${e.message}` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Authenticated request with HMAC signing
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const method = "GET";
    const path = "/auth/api-keys";
    const signMessage = timestamp + method + path;

    let signature: string;
    try {
      signature = await hmacSign(creds.secret, signMessage);
    } catch (e) {
      return new Response(
        JSON.stringify({ ok: false, error: `Failed to compute HMAC signature. Credentials may be malformed: ${e.message}` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const headers: Record<string, string> = {
      "POLY_API_KEY": creds.apiKey,
      "POLY_PASSPHRASE": creds.passphrase,
      "POLY_TIMESTAMP": timestamp,
      "POLY_SIGNATURE": signature,
    };
    if (creds.address) {
      headers["POLY_ADDRESS"] = creds.address;
    }

    const testRes = await fetch(`${clobHost}${path}`, { method, headers });

    if (testRes.ok) {
      return new Response(
        JSON.stringify({ ok: true, message: "Authentication successful — real credentials verified against CLOB API" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      const body = await testRes.text();
      return new Response(
        JSON.stringify({ ok: false, error: `CLOB API returned ${testRes.status}: ${body.substring(0, 200)}` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
