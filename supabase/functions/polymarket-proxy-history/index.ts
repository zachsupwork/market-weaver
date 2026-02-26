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
    const range = url.searchParams.get("range") || "1W"; // 1D, 1W, 1M, ALL
    const fidelity = url.searchParams.get("fidelity"); // optional override

    if (!tokenId) {
      return new Response(
        JSON.stringify({ error: "token_id required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Map range to startTs and fidelity
    const now = Math.floor(Date.now() / 1000);
    let startTs: number;
    let autoFidelity: number;

    switch (range) {
      case "1D":
        startTs = now - 86400;
        autoFidelity = 60; // 1-minute candles
        break;
      case "1W":
        startTs = now - 7 * 86400;
        autoFidelity = 600; // 10-minute candles
        break;
      case "1M":
        startTs = now - 30 * 86400;
        autoFidelity = 3600; // 1-hour candles
        break;
      case "ALL":
        startTs = now - 365 * 86400;
        autoFidelity = 86400; // 1-day candles
        break;
      default:
        startTs = now - 7 * 86400;
        autoFidelity = 600;
    }

    const useFidelity = fidelity ? parseInt(fidelity) : autoFidelity;

    // CLOB prices history endpoint (public)
    const clobUrl = `https://clob.polymarket.com/prices-history?market=${encodeURIComponent(tokenId)}&startTs=${startTs}&endTs=${now}&fidelity=${useFidelity}`;

    const res = await fetch(clobUrl, {
      headers: { "Accept": "application/json" },
    });

    if (!res.ok) {
      // Fallback: try the data API timeseries endpoint
      const dataApiUrl = `https://data-api.polymarket.com/timeseries?asset_id=${encodeURIComponent(tokenId)}&startTs=${startTs}&endTs=${now}&fidelity=${useFidelity}`;
      const res2 = await fetch(dataApiUrl, {
        headers: { "Accept": "application/json" },
      });

      if (!res2.ok) {
        return new Response(
          JSON.stringify({ error: `Price history not available (${res.status})` }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const data2 = await res2.json();
      const points = normalizeHistory(data2);
      return new Response(JSON.stringify(points), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await res.json();
    const points = normalizeHistory(data);

    return new Response(JSON.stringify(points), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function normalizeHistory(data: any): { t: number; p: number }[] {
  // CLOB returns { history: [{ t, p }] } or just an array
  let raw: any[] = [];
  if (Array.isArray(data)) {
    raw = data;
  } else if (data?.history && Array.isArray(data.history)) {
    raw = data.history;
  } else if (data?.prices && Array.isArray(data.prices)) {
    raw = data.prices;
  }

  return raw
    .map((point: any) => ({
      t: typeof point.t === "number" ? point.t : parseInt(point.t || point.timestamp || "0"),
      p: typeof point.p === "number" ? point.p : parseFloat(point.p || point.price || "0"),
    }))
    .filter((pt) => pt.t > 0 && pt.p >= 0 && pt.p <= 1)
    .sort((a, b) => a.t - b.t);
}
