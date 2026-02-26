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

    // Try endpoints in order of reliability for trade data
    const endpoints: string[] = [];

    if (tokenId) {
      // 1) Data API - most reliable for public trade history
      endpoints.push(
        `https://data-api.polymarket.com/trades?asset_id=${encodeURIComponent(tokenId)}&limit=${limit}`
      );
      // 2) CLOB trades endpoint (public GET, may need market param)
      endpoints.push(
        `https://clob.polymarket.com/trades?asset_id=${encodeURIComponent(tokenId)}&limit=${limit}`
      );
      // 3) Gamma activity endpoint as last resort
      endpoints.push(
        `https://gamma-api.polymarket.com/activity?asset_id=${encodeURIComponent(tokenId)}&limit=${limit}&type=TRADE`
      );
    } else if (conditionId) {
      endpoints.push(
        `https://data-api.polymarket.com/trades?market=${encodeURIComponent(conditionId)}&limit=${limit}`
      );
      endpoints.push(
        `https://gamma-api.polymarket.com/activity?market=${encodeURIComponent(conditionId)}&limit=${limit}&type=TRADE`
      );
    }

    let lastError = "";
    for (const endpoint of endpoints) {
      try {
        const res = await fetch(endpoint, {
          headers: { "Accept": "application/json" },
        });

        if (!res.ok) {
          lastError = `${endpoint.split("?")[0]} returned ${res.status}`;
          continue;
        }

        const data = await res.json();
        const rawList = Array.isArray(data) ? data : [];

        if (rawList.length === 0) {
          lastError = `${endpoint.split("?")[0]} returned empty`;
          continue;
        }

        // Normalize trades to a consistent shape
        const trades = rawList.map((t: any) => ({
          id: t.id || t.trade_id || t.transaction_hash || "",
          timestamp: t.timestamp || t.created_at || t.match_time || t.time || t.event_time || "",
          price: parseFloat(t.price || t.outcome_price || t.avg_price || "0"),
          size: parseFloat(t.size || t.amount || t.quantity || t.shares || "0"),
          side: (t.side || t.maker_side || t.type || t.action || "BUY").toUpperCase(),
          asset_id: t.asset_id || t.token_id || tokenId || "",
          outcome: t.outcome || "",
        }));

        // Filter out trades with 0 price or 0 size
        const validTrades = trades.filter((t: any) => t.price > 0 && t.size > 0);

        return new Response(JSON.stringify(validTrades), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (e) {
        lastError = e.message;
        continue;
      }
    }

    // All endpoints failed - return empty array
    return new Response(JSON.stringify([]), {
      headers: { ...corsHeaders, "Content-Type": "application/json", "X-Trades-Warning": lastError },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});