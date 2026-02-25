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

    const timestamp = new Date().toISOString();
    const creds = {
      apiKey: `pm_placeholder_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`,
      secret: bytesToHex(crypto.getRandomValues(new Uint8Array(32))),
      passphrase: bytesToHex(crypto.getRandomValues(new Uint8Array(16))),
      createdAt: timestamp,
      note: "placeholder",
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
        JSON.stringify({ ok: false, error: "Failed to store placeholder credentials" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[POLYMARKET] Placeholder credentials stored at ${timestamp}`);

    return new Response(
      JSON.stringify({ ok: true, placeholder: true, createdAt: timestamp }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Derive placeholder error:", err);
    return new Response(
      JSON.stringify({ ok: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}
