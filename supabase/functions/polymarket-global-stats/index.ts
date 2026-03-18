import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GAMMA_API = "https://gamma-api.polymarket.com";

let cache: { data: any; ts: number } | null = null;
const CACHE_TTL = 30_000; // 30s

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (cache && Date.now() - cache.ts < CACHE_TTL) {
      return new Response(JSON.stringify(cache.data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let marketCount = 0;
    let totalVolume24h = 0;
    let totalLiquidity = 0;
    let offset = 0;
    const limit = 500;
    let hasMore = true;

    while (hasMore) {
      const qs = new URLSearchParams({
        active: "true",
        closed: "false",
        archived: "false",
        limit: String(limit),
        offset: String(offset),
        order: "volume24hr",
        ascending: "false",
      });

      const res = await fetch(`${GAMMA_API}/markets?${qs}`, {
        headers: { Accept: "application/json" },
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Gamma ${res.status}: ${errText.substring(0, 200)}`);
      }

      const markets: any[] = await res.json();

      for (const m of markets) {
        marketCount++;
        totalVolume24h += parseFloat(m.volume24hr || m.volume24h || "0") || 0;
        totalLiquidity += parseFloat(m.liquidity || "0") || 0;
      }

      hasMore = markets.length >= limit;
      offset += limit;

      // Safety cap to prevent infinite loops
      if (offset > 10000) break;
    }

    const result = { marketCount, totalVolume24h, totalLiquidity };
    cache = { data: result, ts: Date.now() };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as any).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
