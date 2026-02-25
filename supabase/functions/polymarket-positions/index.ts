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

async function loadCreds() {
  const masterKey = Deno.env.get("MASTER_KEY");
  if (!masterKey) throw new Error("MASTER_KEY not configured");

  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("polymarket_secrets")
    .select("value_encrypted, iv, auth_tag")
    .eq("name", "polymarket_api_creds")
    .maybeSingle();

  if (error || !data) throw new Error("No stored credentials found");

  const json = await decrypt(data.value_encrypted, data.iv, data.auth_tag, masterKey);
  return JSON.parse(json);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const creds = await loadCreds();

    if (creds.apiKey?.startsWith("pm_placeholder") || creds.note === "placeholder") {
      return new Response(
        JSON.stringify({ ok: false, error: "Placeholder credentials — derive real creds first" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const clobHost = Deno.env.get("CLOB_HOST") || "https://clob.polymarket.com";
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const method = "GET";
    const path = "/data/positions";
    const signature = await hmacSign(creds.secret, timestamp + method + path);

    const hdrs: Record<string, string> = {
      "POLY_API_KEY": creds.apiKey,
      "POLY_PASSPHRASE": creds.passphrase,
      "POLY_TIMESTAMP": timestamp,
      "POLY_SIGNATURE": signature,
      "Accept": "application/json",
    };
    if (creds.address) hdrs["POLY_ADDRESS"] = creds.address;

    const res = await fetch(`${clobHost}${path}`, { method, headers: hdrs });

    if (!res.ok) {
      const body = await res.text();
      return new Response(
        JSON.stringify({ ok: false, error: `CLOB ${res.status}: ${body.substring(0, 300)}` }),
        { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const positions = await res.json();
    return new Response(JSON.stringify({ ok: true, positions }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
