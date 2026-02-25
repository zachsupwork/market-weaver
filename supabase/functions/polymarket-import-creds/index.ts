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
    const masterKey = Deno.env.get("MASTER_KEY");
    if (!masterKey) {
      return new Response(
        JSON.stringify({ ok: false, error: "MASTER_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { apiKey, secret, passphrase, address } = body;

    if (!apiKey || !secret || !passphrase) {
      return new Response(
        JSON.stringify({ ok: false, error: "apiKey, secret, and passphrase are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const creds = {
      apiKey,
      secret,
      passphrase,
      address: address || "",
      importedAt: new Date().toISOString(),
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

    return new Response(
      JSON.stringify({ ok: true, importedAt: creds.importedAt }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
