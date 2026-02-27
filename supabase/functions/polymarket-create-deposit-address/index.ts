import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function jsonResp(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const EVM_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

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
    if (!address || !EVM_ADDRESS_RE.test(address)) {
      return jsonResp({ ok: false, error: "Valid EVM address required (0x + 40 hex chars)" }, 400);
    }

    // ── Upstream URL from env ────────────────────────────────────
    const DEPOSIT_URL = Deno.env.get("POLY_BRIDGE_DEPOSIT_URL");
    if (!DEPOSIT_URL) {
      console.error("[deposit-addr] POLY_BRIDGE_DEPOSIT_URL not configured");
      return jsonResp({ ok: false, error: "Server missing POLY_BRIDGE_DEPOSIT_URL" }, 500);
    }

    console.log(`[deposit-addr] Creating deposit address for user=${user.id}, address=${address}, url=${DEPOSIT_URL}`);

    const res = await fetch(DEPOSIT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({ address }),
    });

    const resBody = await res.text();
    console.log(`[deposit-addr] Upstream response: status=${res.status} body=${resBody.substring(0, 500)}`);

    if (!res.ok) {
      console.error(`[deposit-addr] Upstream error: status=${res.status} body=${resBody}`);
      return jsonResp({
        ok: false,
        error: "Upstream error",
        upstreamStatus: res.status,
        upstreamBody: resBody.substring(0, 500),
      }, res.status);
    }

    let parsed;
    try {
      parsed = JSON.parse(resBody);
    } catch {
      parsed = { raw: resBody };
    }

    return jsonResp({ ok: true, deposit: parsed });
  } catch (err) {
    console.error("[deposit-addr] error:", err);
    return jsonResp({ ok: false, error: err.message }, 500);
  }
});
