import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { decrypt } from "../_shared/crypto.ts";
import { validateAdminToken } from "../_shared/admin-auth.ts";
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
    if (!validateAdminToken(req)) {
      return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    // Decrypt credentials
    const credsJson = await decrypt(
      data.value_encrypted,
      data.iv,
      data.auth_tag,
      masterKey
    );
    const creds = JSON.parse(credsJson);

    // Test auth against Polymarket CLOB API
    const clobHost = Deno.env.get("CLOB_HOST") || "https://clob.polymarket.com";
    
    try {
      const testResponse = await fetch(`${clobHost}/auth/api-key`, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${creds.apiKey}`,
          "Content-Type": "application/json",
        },
      });

      if (testResponse.ok) {
        return new Response(
          JSON.stringify({ ok: true, message: "Authentication successful" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } else {
        return new Response(
          JSON.stringify({ ok: false, error: `CLOB API returned ${testResponse.status}` }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } catch (fetchErr) {
      return new Response(
        JSON.stringify({ ok: false, error: `CLOB API unreachable: ${fetchErr.message}` }),
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
