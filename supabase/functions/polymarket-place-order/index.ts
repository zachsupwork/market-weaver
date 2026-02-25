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

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "POST required" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const body = await req.json();
    const { tokenId, side, price, size, orderType } = body;

    if (!tokenId || !side || !price || !size) {
      return new Response(
        JSON.stringify({ ok: false, error: "Missing required fields: tokenId, side, price, size" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Load and decrypt creds
    const masterKey = Deno.env.get("MASTER_KEY");
    if (!masterKey) throw new Error("MASTER_KEY not configured");

    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from("polymarket_secrets")
      .select("value_encrypted, iv, auth_tag")
      .eq("name", "polymarket_api_creds")
      .maybeSingle();

    if (error || !data) throw new Error("No stored credentials");

    const credsJson = await decrypt(data.value_encrypted, data.iv, data.auth_tag, masterKey);
    const creds = JSON.parse(credsJson);

    if (creds.apiKey?.startsWith("pm_placeholder") || creds.note === "placeholder") {
      return new Response(
        JSON.stringify({ ok: false, error: "Cannot place orders with placeholder credentials" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // NOTE: Real order placement requires EIP-712 wallet signatures via @polymarket/clob-client.
    // This edge function provides the API layer. For production trading, use apps/api which has
    // ethers + clob-client for order signing.
    // For now, this validates the request and returns a dry-run response.

    const clobHost = Deno.env.get("CLOB_HOST") || "https://clob.polymarket.com";
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const method = "POST";
    const path = "/order";
    const orderBody = JSON.stringify({
      tokenID: tokenId,
      side: side.toUpperCase(),
      price: parseFloat(price).toFixed(2),
      size: parseFloat(size).toFixed(2),
      type: orderType || "GTC",
    });

    const signature = await hmacSign(creds.secret, timestamp + method + path + orderBody);

    const hdrs: Record<string, string> = {
      "POLY_API_KEY": creds.apiKey,
      "POLY_PASSPHRASE": creds.passphrase,
      "POLY_TIMESTAMP": timestamp,
      "POLY_SIGNATURE": signature,
      "Content-Type": "application/json",
    };
    if (creds.address) hdrs["POLY_ADDRESS"] = creds.address;

    const res = await fetch(`${clobHost}${path}`, {
      method,
      headers: hdrs,
      body: orderBody,
    });

    const resBody = await res.text();

    if (res.ok) {
      let parsed;
      try { parsed = JSON.parse(resBody); } catch { parsed = resBody; }
      return new Response(
        JSON.stringify({ ok: true, order: parsed }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      return new Response(
        JSON.stringify({ ok: false, error: `Order failed (${res.status}): ${resBody.substring(0, 300)}` }),
        { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
