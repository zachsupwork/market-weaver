import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encrypt } from "../_shared/crypto.ts";
import { getServiceClient } from "../_shared/supabase-admin.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

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

    const body = await req.json();
    const { apiKey, secret, passphrase } = body;

    // Validate inputs
    if (!apiKey || typeof apiKey !== "string" || apiKey.trim().length === 0) {
      return new Response(
        JSON.stringify({ ok: false, error: "apiKey is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (!secret || typeof secret !== "string" || secret.trim().length === 0) {
      return new Response(
        JSON.stringify({ ok: false, error: "secret is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (!passphrase || typeof passphrase !== "string" || passphrase.trim().length === 0) {
      return new Response(
        JSON.stringify({ ok: false, error: "passphrase is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const timestamp = new Date().toISOString();
    const creds = {
      apiKey: apiKey.trim(),
      secret: secret.trim(),
      passphrase: passphrase.trim(),
      createdAt: timestamp,
      imported: true,
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
        JSON.stringify({ ok: false, error: "Failed to store credentials" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[POLYMARKET] Credentials imported at ${timestamp}`);

    return new Response(
      JSON.stringify({ ok: true, imported: true, createdAt: timestamp }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Import error:", err);
    return new Response(
      JSON.stringify({ ok: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
