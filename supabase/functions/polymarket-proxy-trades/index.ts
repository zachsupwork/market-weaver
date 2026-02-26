import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const tokenId = url.searchParams.get("token_id");
    const conditionId = url.searchParams.get("condition_id");
    const limit = url.searchParams.get("limit") || "50";

    if (!tokenId && !conditionId) {
      return new Response(
        JSON.stringify({ error: "token_id or condition_id required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use CLOB API for trades by token_id
    const clobHost = Deno.env.get("CLOB_HOST") || "https://clob.polymarket.com";
    
    let endpoint: string;
    if (tokenId) {
      endpoint = `${clobHost}/trades?asset_id=${encodeURIComponent(tokenId)}&limit=${limit}`;
    } else {
      // Fallback: use data API for condition-level trades
      endpoint = `https://data-api.polymarket.com/trades?market=${encodeURIComponent(conditionId!)}&limit=${limit}`;
    }

    const res = await fetch(endpoint, {
      headers: { "Accept": "application/json" },
    });

    if (!res.ok) {
      const text = await res.text();
      return new Response(
        JSON.stringify({ error: `Trades API error: ${res.status}`, detail: text.substring(0, 200) }),
        { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await res.json();
    
    // Normalize trades to a consistent shape
    const trades = (Array.isArray(data) ? data : []).map((t: any) => ({
      id: t.id || t.trade_id || "",
      timestamp: t.timestamp || t.created_at || t.match_time || "",
      price: parseFloat(t.price || "0"),
      size: parseFloat(t.size || t.amount || "0"),
      side: (t.side || t.maker_side || "BUY").toUpperCase(),
      asset_id: t.asset_id || t.token_id || tokenId || "",
    }));

    return new Response(JSON.stringify(trades), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
