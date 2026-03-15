import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const jsonHeaders = {
  ...corsHeaders,
  "Content-Type": "application/json",
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  Pragma: "no-cache",
  Expires: "0",
};

function toTimestampValue(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isNaN(n)) return n < 1e12 ? n * 1000 : n;
  const d = new Date(String(raw));
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const tokenId = url.searchParams.get("token_id")?.trim() || "";
    const conditionIdRaw = url.searchParams.get("condition_id")?.trim() || "";
    const conditionId = conditionIdRaw.toLowerCase() === "all" ? "" : conditionIdRaw;
    const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") || "50")));

    const endpoints: string[] = [];

    if (tokenId) {
      endpoints.push(
        `https://data-api.polymarket.com/trades?asset_id=${encodeURIComponent(tokenId)}&limit=${limit}`
      );
      endpoints.push(
        `https://clob.polymarket.com/trades?asset_id=${encodeURIComponent(tokenId)}&limit=${limit}`
      );
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
    } else {
      // Global stream fallback used by front-page recent trades
      endpoints.push(`https://data-api.polymarket.com/trades?limit=${limit}`);
      endpoints.push(`https://gamma-api.polymarket.com/activity?limit=${limit}&type=TRADE`);
    }

    let lastError = "";

    for (const endpoint of endpoints) {
      try {
        const res = await fetch(endpoint, {
          headers: {
            Accept: "application/json",
            "Cache-Control": "no-cache",
            Pragma: "no-cache",
          },
          cache: "no-store",
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

        const trades = rawList
          .map((t: any, idx: number) => {
            const timestamp = t.timestamp || t.created_at || t.match_time || t.time || t.event_time || "";
            const price = Number(t.price || t.outcome_price || t.avg_price || 0);
            const size = Number(t.size || t.amount || t.quantity || t.shares || 0);
            const side = String(t.side || t.taker_side || t.maker_side || t.type || t.action || "BUY").toUpperCase();
            const assetId = String(t.asset_id || t.token_id || t.asset || tokenId || "");
            const outcome = String(t.outcome || "");
            const txHash = String(t.tx_hash || t.transaction_hash || t.txHash || "");
            const rawId = t.id || t.trade_id || t.match_id || txHash;

            const fallbackId = `${assetId}:${timestamp}:${price}:${size}:${side}:${outcome}:${idx}`;

            return {
              id: String(rawId || fallbackId),
              timestamp,
              price: Number.isFinite(price) ? price : 0,
              size: Number.isFinite(size) ? size : 0,
              side,
              asset_id: assetId,
              outcome,
              tx_hash: txHash,
            };
          })
          .filter((t: any) => t.price > 0 && t.size > 0)
          .sort((a: any, b: any) => toTimestampValue(b.timestamp) - toTimestampValue(a.timestamp))
          .slice(0, limit);

        return new Response(JSON.stringify(trades), { headers: jsonHeaders });
      } catch (e) {
        lastError = (e as any).message;
      }
    }

    return new Response(JSON.stringify([]), {
      headers: { ...jsonHeaders, "X-Trades-Warning": lastError },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as any).message }), {
      status: 500,
      headers: jsonHeaders,
    });
  }
});
