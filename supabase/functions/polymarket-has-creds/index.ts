import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { decrypt } from "../_shared/crypto.ts";
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
    const supabase = getServiceClient();
    const masterKey = Deno.env.get("MASTER_KEY");

    const { data, error } = await supabase
      .from("polymarket_secrets")
      .select("value_encrypted, iv, auth_tag, updated_at")
      .eq("name", "polymarket_api_creds")
      .maybeSingle();

    if (error) {
      return new Response(
        JSON.stringify({ hasCreds: false, updatedAt: null, credType: null, error: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!data) {
      return new Response(
        JSON.stringify({ hasCreds: false, updatedAt: null, credType: null }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Determine if placeholder or real
    let credType: "placeholder" | "real" | "unknown" = "unknown";
    if (masterKey) {
      try {
        const credsJson = await decrypt(data.value_encrypted, data.iv, data.auth_tag, masterKey);
        const creds = JSON.parse(credsJson);
        const isPlaceholder =
          creds.apiKey?.startsWith("pm_placeholder") ||
          creds.note === "placeholder" ||
          creds.note?.includes("edge function") ||
          creds.note?.includes("Generated via edge function");
        credType = isPlaceholder ? "placeholder" : "real";
      } catch {
        credType = "unknown";
      }
    }

    return new Response(
      JSON.stringify({
        hasCreds: true,
        updatedAt: data.updated_at || null,
        credType,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ hasCreds: false, updatedAt: null, credType: null, error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
