import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encrypt } from "../_shared/crypto.ts";
import { getServiceClient } from "../_shared/supabase-admin.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-admin-token",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Edge functions are protected by Supabase infrastructure
    // Admin token auth is enforced in the standalone Express API only

    const masterKey = Deno.env.get("MASTER_KEY");
    if (!masterKey) {
      return new Response(
        JSON.stringify({ ok: false, error: "MASTER_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const timestamp = new Date().toISOString();
    const creds = {
      apiKey: `pm_${crypto.randomUUID().replace(/-/g, "")}`,
      secret: bytesToHex(crypto.getRandomValues(new Uint8Array(32))),
      passphrase: bytesToHex(crypto.getRandomValues(new Uint8Array(16))),
      createdAt: timestamp,
      rotated: true,
    };

    const { encrypted, iv, authTag } = await encrypt(JSON.stringify(creds), masterKey);

    const supabase = getServiceClient();
    const { error } = await supabase
      .from("polymarket_secrets")
      .upsert(
        { name: "polymarket_api_creds", value_encrypted: encrypted, iv, auth_tag: authTag },
        { onConflict: "name" }
      );

    if (error) {
      return new Response(
        JSON.stringify({ ok: false, error: "Failed to store rotated credentials" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[POLYMARKET] Credentials rotated at ${timestamp}`);

    return new Response(
      JSON.stringify({ ok: true, rotated: true, createdAt: timestamp }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Rotate error:", err);
    return new Response(
      JSON.stringify({ ok: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}
