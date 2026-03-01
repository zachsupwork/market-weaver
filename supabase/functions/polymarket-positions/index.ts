import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GAMMA_API = "https://gamma-api.polymarket.com";
const DATA_API = "https://data-api.polymarket.com";

async function fetchMarketByToken(tokenId: string): Promise<any | null> {
  try {
    const res = await fetch(`${GAMMA_API}/markets?clob_token_ids=${encodeURIComponent(tokenId)}&limit=5`);
    if (!res.ok) return null;
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0) return data[0];
    return null;
  } catch {
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const address = url.searchParams.get("address");

    if (!address) {
      return new Response(
        JSON.stringify({ ok: false, error: "Missing 'address' query parameter" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const res = await fetch(`${DATA_API}/positions?user=${address.toLowerCase()}`);

    if (!res.ok) {
      const body = await res.text();
      return new Response(
        JSON.stringify({ ok: false, error: `Data API ${res.status}: ${body.substring(0, 300)}` }),
        { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const rawPositions = await res.json();
    console.log(`[positions] address=${address} raw count=${Array.isArray(rawPositions) ? rawPositions.length : "?"}`);

    if (!Array.isArray(rawPositions) || rawPositions.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, positions: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Collect unique token IDs to batch-fetch market metadata
    const tokenIds = [...new Set(rawPositions.map((p: any) => p.asset).filter(Boolean))];

    // Fetch market metadata for each token (in parallel, max 10 concurrent)
    const marketCache = new Map<string, any>();
    const batches: string[][] = [];
    for (let i = 0; i < tokenIds.length; i += 10) {
      batches.push(tokenIds.slice(i, i + 10));
    }

    for (const batch of batches) {
      const results = await Promise.allSettled(batch.map((tid) => fetchMarketByToken(tid)));
      results.forEach((r, idx) => {
        if (r.status === "fulfilled" && r.value) {
          marketCache.set(batch[idx], r.value);
        }
      });
    }

    // Enrich positions with market metadata
    const enriched = rawPositions.map((pos: any) => {
      const market = marketCache.get(pos.asset) || null;
      const size = parseFloat(pos.size || "0");
      const avgPrice = parseFloat(pos.avgPrice || pos.avg_price || "0");
      
      // Determine outcome from token position in market
      let outcome = pos.outcome || "Unknown";
      let currentPrice = parseFloat(pos.currentPrice || pos.cur_price || "0");
      
      if (market) {
        // Try to match token to Yes/No outcome
        const tokens = market.clobTokenIds || market.clob_token_ids || "";
        const tokenList = typeof tokens === "string" ? tokens.split(",").map((t: string) => t.trim()) : Array.isArray(tokens) ? tokens : [];
        const tokenIndex = tokenList.findIndex((t: string) => t === pos.asset);
        
        const outcomes = market.outcomes ? (typeof market.outcomes === "string" ? JSON.parse(market.outcomes) : market.outcomes) : ["Yes", "No"];
        if (tokenIndex >= 0 && tokenIndex < outcomes.length) {
          outcome = outcomes[tokenIndex];
        }
        
        // Get current price from market data
        const prices = market.outcomePrices || market.outcome_prices;
        if (prices) {
          const priceList = typeof prices === "string" ? JSON.parse(prices) : prices;
          if (tokenIndex >= 0 && tokenIndex < priceList.length) {
            currentPrice = parseFloat(priceList[tokenIndex]) || currentPrice;
          }
        }
      }

      const pnl = size * (currentPrice - avgPrice);

      return {
        asset: pos.asset,
        condition_id: pos.conditionId || pos.condition_id || market?.condition_id || market?.conditionId || "",
        size: String(size),
        avgPrice: String(avgPrice),
        currentPrice: String(currentPrice),
        outcome,
        pnl: String(pnl),
        market: market?.question || market?.title || null,
        marketSlug: market?.slug || null,
        marketImage: market?.image || null,
        marketEndDate: market?.end_date_iso || market?.endDate || null,
        eventSlug: market?.event_slug || market?.eventSlug || null,
        category: market?.category || market?.tags?.[0] || null,
      };
    });

    console.log(`[positions] returning ${enriched.length} enriched positions (${marketCache.size} markets resolved)`);

    return new Response(
      JSON.stringify({ ok: true, positions: enriched }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error(`[positions] error:`, err);
    return new Response(
      JSON.stringify({ ok: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
