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

/** Normalize a price value to 0-1 range. The Data API sometimes returns prices as
 *  whole-number percentages (e.g. 3.84 meaning 3.84¢ = 0.0384) or already as
 *  decimals (0.57). We detect which format based on whether the value > 1. */
function normalizePrice(raw: unknown): number {
  const v = parseFloat(String(raw ?? "0"));
  if (!Number.isFinite(v) || v <= 0) return 0;
  // If value > 1, it's likely in cents or whole number – but Polymarket Data API
  // actually returns avgPrice as a decimal (0.0384), not 3.84.
  // However, some edge cases return values > 1 (e.g. size-weighted avg).
  // We cap at 1 for probability prices.
  return v > 1 ? v / 100 : v;
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

    // Fetch from Data API with additional fields
    const dataUrl = `${DATA_API}/positions?user=${address.toLowerCase()}`;
    console.log(`[positions] fetching: ${dataUrl}`);
    const res = await fetch(dataUrl);

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

      // The Data API returns avgPrice as a decimal (e.g., 0.0384)
      // but sometimes as a larger number. Normalize to 0-1.
      const rawAvgPrice = parseFloat(pos.avgPrice || pos.avg_price || "0");
      const avgPrice = rawAvgPrice > 1 ? rawAvgPrice / 100 : rawAvgPrice;

      // Determine outcome from token position in market
      let outcome = pos.outcome || "Unknown";
      let currentPrice = 0;
      let tokenIndex = -1;

      if (market) {
        // Try to match token to Yes/No outcome
        const tokens = market.clobTokenIds || market.clob_token_ids || "";
        const tokenList = typeof tokens === "string" ? tokens.split(",").map((t: string) => t.trim()) : Array.isArray(tokens) ? tokens : [];
        tokenIndex = tokenList.findIndex((t: string) => t === pos.asset);

        const outcomes = market.outcomes ? (typeof market.outcomes === "string" ? JSON.parse(market.outcomes) : market.outcomes) : ["Yes", "No"];
        if (tokenIndex >= 0 && tokenIndex < outcomes.length) {
          outcome = outcomes[tokenIndex];
        }

        // Get current price from market data
        const prices = market.outcomePrices || market.outcome_prices;
        if (prices) {
          const priceList = typeof prices === "string" ? JSON.parse(prices) : prices;
          if (tokenIndex >= 0 && tokenIndex < priceList.length) {
            currentPrice = parseFloat(priceList[tokenIndex]) || 0;
          }
        }
      }

      // Use Data API's curPrice if available and market price wasn't found
      if (currentPrice === 0) {
        const rawCurPrice = parseFloat(pos.curPrice || pos.cur_price || pos.currentPrice || "0");
        currentPrice = rawCurPrice > 1 ? rawCurPrice / 100 : rawCurPrice;
      }

      const currentValue = size * currentPrice;
      const initialValue = size * avgPrice;
      const cashPnl = parseFloat(pos.cashPnl || pos.cash_pnl || "0") || (currentValue - initialValue);
      const percentPnl = parseFloat(pos.percentPnl || pos.percent_pnl || "0") ||
        (initialValue > 0 ? ((currentValue - initialValue) / initialValue) * 100 : 0);

      // ── Determine if market is resolved ──────────────────────
      // Use multiple signals since the Gamma API is inconsistent:
      const isExplicitlyResolved = market?.resolved === true;
      const isClosed = market?.closed === true || market?.active === false;
      const endDateStr = market?.end_date_iso || market?.endDate || market?.end_date || null;
      const endDatePassed = endDateStr ? new Date(endDateStr).getTime() < Date.now() : false;
      // A market is resolved if explicitly flagged OR closed AND end date has passed
      const resolved = isExplicitlyResolved || (isClosed && endDatePassed) || (endDatePassed && currentPrice >= 0.95);
      const marketActive = !resolved;

      // ── Determine if this is a winning position ─────────────
      let isWinner = false;
      if (market) {
        const resolutionPrices = market.outcomePrices || market.outcome_prices;
        if (resolutionPrices) {
          const priceList = typeof resolutionPrices === "string" ? JSON.parse(resolutionPrices) : resolutionPrices;
          if (tokenIndex >= 0 && tokenIndex < priceList.length) {
            const outcomePrice = parseFloat(priceList[tokenIndex]) || 0;
            // Winner if outcome price >= 0.95 (resolved to ~1.0) OR
            // if market is resolved and this outcome has the highest price
            if (outcomePrice >= 0.95) {
              isWinner = true;
            } else if (resolved) {
              // Check if this is the highest-priced outcome (winner in resolved market)
              const maxPrice = Math.max(...priceList.map((p: any) => parseFloat(p) || 0));
              isWinner = outcomePrice === maxPrice && maxPrice > 0.5;
            }
          }
        }
        // Fallback: if market resolved and P&L is very positive, likely a winner
        if (!isWinner && resolved && cashPnl > 0 && currentPrice >= 0.9) {
          isWinner = true;
        }
      }

      const redeemable = resolved && isWinner && size > 0;

      return {
        asset: pos.asset,
        condition_id: pos.conditionId || pos.condition_id || market?.condition_id || market?.conditionId || "",
        size: String(size),
        avgPrice: String(avgPrice),
        currentPrice: String(currentPrice),
        currentValue: String(currentValue),
        outcome,
        cashPnl: String(cashPnl),
        percentPnl: String(percentPnl),
        pnl: String(cashPnl),
        market: market?.question || market?.title || null,
        marketSlug: market?.slug || null,
        marketImage: market?.image || null,
        marketEndDate: market?.end_date_iso || market?.endDate || null,
        eventSlug: market?.event_slug || market?.eventSlug || null,
        category: market?.category || market?.tags?.[0] || null,
        redeemable,
        resolved,
        isWinner,
        marketActive: marketActive !== false,
      };
    });

    // Filter out zero-size positions
    const nonZero = enriched.filter((p: any) => parseFloat(p.size) > 0.001);

    console.log(`[positions] returning ${nonZero.length} enriched positions (${marketCache.size} markets resolved)`);

    return new Response(
      JSON.stringify({ ok: true, positions: nonZero }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error(`[positions] error:`, err);
    return new Response(
      JSON.stringify({ ok: false, error: (err as any).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
