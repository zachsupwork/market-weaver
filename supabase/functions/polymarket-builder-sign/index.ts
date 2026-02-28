import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Remote signing endpoint for Polymarket Builder Relayer authentication.
 * Receives { method, path, body } and returns HMAC-SHA256 signed builder headers.
 * Protected by Supabase JWT — only authenticated users can request signatures.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify user auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse request
    const { method, path, body } = await req.json();
    if (!method || !path) {
      return new Response(JSON.stringify({ error: "method and path required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load builder credentials
    const builderKey = Deno.env.get("POLY_BUILDER_API_KEY");
    const builderSecret = Deno.env.get("POLY_BUILDER_SECRET");
    const builderPassphrase = Deno.env.get("POLY_BUILDER_PASSPHRASE");

    if (!builderKey || !builderSecret || !builderPassphrase) {
      return new Response(JSON.stringify({ error: "Builder credentials not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Generate HMAC-SHA256 signature
    const sigTimestamp = Date.now().toString();
    const message = `${sigTimestamp}${method}${path}${body || ""}`;

    // Decode base64 secret (handle both standard and URL-safe base64)
    const normalizedSecret = builderSecret.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalizedSecret + '='.repeat((4 - normalizedSecret.length % 4) % 4);
    let secretBytes: Uint8Array;
    try {
      secretBytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
    } catch {
      // If still fails, use raw string bytes as the secret
      secretBytes = new TextEncoder().encode(builderSecret);
    }
    const key = await crypto.subtle.importKey(
      "raw",
      secretBytes,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
    const signature = btoa(String.fromCharCode(...new Uint8Array(sig)));

    return new Response(
      JSON.stringify({
        POLY_BUILDER_SIGNATURE: signature,
        POLY_BUILDER_TIMESTAMP: sigTimestamp,
        POLY_BUILDER_API_KEY: builderKey,
        POLY_BUILDER_PASSPHRASE: builderPassphrase,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("Builder sign error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
