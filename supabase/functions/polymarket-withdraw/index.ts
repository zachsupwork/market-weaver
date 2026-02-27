import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { decrypt } from "../_shared/crypto.ts";
import { getServiceClient } from "../_shared/supabase-admin.ts";
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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResp({ ok: false, error: "POST required" }, 405);
  }

  try {
    // ── Auth ──
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

    // ── Bridge base URL ──
    const bridgeBase = Deno.env.get("POLY_BRIDGE_BASE_URL");
    if (!bridgeBase) {
      return jsonResp({ ok: false, error: "Server missing POLY_BRIDGE_BASE_URL" }, 500);
    }

    const body = await req.json();
    const { amount, destinationAddress, chain } = body;

    if (!amount || !destinationAddress) {
      return jsonResp({ ok: false, error: "amount and destinationAddress are required" }, 400);
    }

    // Validate EVM address format
    if (!/^0x[0-9a-fA-F]{40}$/.test(destinationAddress)) {
      return jsonResp({ ok: false, error: "Invalid destination address format" }, 400);
    }

    // ── Load user creds for address verification ──
    const masterKey = Deno.env.get("MASTER_KEY");
    if (!masterKey) return jsonResp({ ok: false, error: "MASTER_KEY not configured" }, 500);

    const adminClient = getServiceClient();
    const { data: credRow } = await adminClient
      .from("polymarket_user_creds")
      .select("value_encrypted, iv, auth_tag, address")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!credRow) {
      return jsonResp({ ok: false, error: "No trading credentials. Enable trading first." }, 400);
    }

    // ── Call Bridge withdraw ──
    const withdrawUrl = `${bridgeBase.replace(/\/$/, "")}/withdraw`;
    console.log(`[withdraw] user=${user.id} amount=${amount} dest=${destinationAddress} chain=${chain || "polygon"}`);

    const payload = {
      amount: String(amount),
      destination_address: destinationAddress,
      chain: chain || "polygon",
      source_address: credRow.address,
    };

    const res = await fetch(withdrawUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const resBody = await res.text();
    console.log(`[withdraw] Upstream: status=${res.status} body=${resBody.substring(0, 500)}`);

    if (!res.ok) {
      return jsonResp({
        ok: false,
        error: "Upstream withdraw error",
        upstreamStatus: res.status,
        upstreamBody: resBody.substring(0, 500),
      }, res.status >= 500 ? 502 : res.status);
    }

    let parsed;
    try { parsed = JSON.parse(resBody); } catch { parsed = resBody; }

    return jsonResp({ ok: true, withdrawal: parsed });
  } catch (err) {
    console.error("[withdraw] Error:", err);
    return jsonResp({ ok: false, error: err.message }, 500);
  }
});
