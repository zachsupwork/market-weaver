import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const address = url.searchParams.get("address");

    if (!address) {
      return jsonResp({ ok: false, error: "address query param required" }, 400);
    }

    const BRIDGE_BASE = Deno.env.get("POLY_BRIDGE_DEPOSIT_URL") ?? "https://bridge.polymarket.com/deposit-addresses";
    // Derive base from the deposit URL (strip path)
    const bridgeOrigin = new URL(BRIDGE_BASE).origin;

    const statusUrl = `${bridgeOrigin}/status/${encodeURIComponent(address)}`;
    console.log(`[deposit-status] Fetching ${statusUrl}`);

    const res = await fetch(statusUrl, {
      headers: { "Accept": "application/json" },
    });

    const resBody = await res.text();
    console.log(`[deposit-status] Upstream: status=${res.status} body=${resBody.substring(0, 500)}`);

    if (!res.ok) {
      return jsonResp({
        ok: false,
        error: "Upstream error",
        upstreamStatus: res.status,
        upstreamBody: resBody.substring(0, 500),
      }, res.status >= 500 ? 502 : res.status);
    }

    let parsed;
    try {
      parsed = JSON.parse(resBody);
    } catch {
      parsed = resBody;
    }

    return jsonResp({ ok: true, status: parsed });
  } catch (err) {
    console.error("[deposit-status] Error:", err);
    return jsonResp({ ok: false, error: String(err) }, 500);
  }
});
