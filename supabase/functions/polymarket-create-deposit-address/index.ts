import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function jsonResp(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResp({ ok: false, error: "POST required" }, 405);
  }

  try {
    // ── Auth ─────────────────────────────────────────────────────
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return jsonResp({ ok: false, error: "Authorization required" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return jsonResp({ ok: false, error: "Invalid auth token" }, 401);
    }

    const body = await req.json();
    const { address } = body;
    if (!address) {
      return jsonResp({ ok: false, error: "address required" }, 400);
    }

    // Polymarket uses Polygon bridge for deposits
    // GET deposit address from their funding endpoint
    const clobHost = Deno.env.get("CLOB_HOST") || "https://clob.polymarket.com";

    const res = await fetch(`${clobHost}/auth/deposit-address?address=${encodeURIComponent(address)}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    const resBody = await res.text();
    console.log(`[deposit-addr] CLOB response: ${res.status}`);

    if (!res.ok) {
      return jsonResp({
        ok: false,
        error: `Failed to get deposit address (${res.status}): ${resBody.substring(0, 200)}`,
      }, res.status);
    }

    let parsed;
    try { parsed = JSON.parse(resBody); } catch { parsed = { raw: resBody }; }

    return jsonResp({ ok: true, deposit: parsed });
  } catch (err) {
    console.error("[deposit-addr] error:", err);
    return jsonResp({ ok: false, error: err.message }, 500);
  }
});
