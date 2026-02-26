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

    // Try multiple public endpoints in order of preference
    const endpoints: string[] = [];

    if (tokenId) {
      // Gamma API activity endpoint (public, no auth)
      endpoints.push(
        `https://gamma-api.polymarket.com/activity?asset_id=${encodeURIComponent(tokenId)}&limit=${limit}&type=TRADE`
      );
      // CLOB trades endpoint (public GET)
      endpoints.push(
        `https://clob.polymarket.com/trades?asset_id=${encodeURIComponent(tokenId)}&limit=${limit}`
      );
    } else {
      endpoints.push(
        `https://gamma-api.polymarket.com/activity?market=${encodeURIComponent(conditionId!)}&limit=${limit}&type=TRADE`
      );
    }

    let lastError = "";
    for (const endpoint of endpoints) {
      try {
        const res = await fetch(endpoint, {
          headers: { "Accept": "application/json" },
        });

        if (!res.ok) {
          lastError = `${endpoint} returned ${res.status}`;
          continue;
        }

        const data = await res.json();
        const rawList = Array.isArray(data) ? data : [];

        // Normalize trades to a consistent shape
        const trades = rawList.map((t: any) => ({
          id: t.id || t.trade_id || "",
          timestamp: t.timestamp || t.created_at || t.match_time || t.time || "",
          price: parseFloat(t.price || t.outcome_price || "0"),
          size: parseFloat(t.size || t.amount || t.quantity || "0"),
          side: (t.side || t.maker_side || t.type || "BUY").toUpperCase(),
          asset_id: t.asset_id || t.token_id || tokenId || "",
        }));

        return new Response(JSON.stringify(trades), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (e) {
        lastError = e.message;
        continue;
      }
    }

    // All endpoints failed - return empty array with warning
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
