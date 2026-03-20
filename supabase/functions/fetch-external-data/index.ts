import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getServiceClient } from "../_shared/supabase-admin.ts";

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

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { market, category } = await req.json();
    if (!market) return jsonResp({ error: "market required" }, 400);

    const marketId = market.condition_id || market.id || "";
    const adminClient = getServiceClient();

    // Check cache
    const { data: cached } = await adminClient
      .from("bot_external_data_cache")
      .select("data, fetched_at")
      .eq("market_id", marketId)
      .maybeSingle();

    if (cached && new Date(cached.fetched_at).getTime() > Date.now() - CACHE_TTL_MS) {
      return jsonResp({ ok: true, data: cached.data, cached: true });
    }

    const question = market.question || market.title || "";
    const cat = category || detectCategory(question);
    let externalData: Record<string, unknown> = {};

    try {
      switch (cat) {
        case "Sports":
          externalData = await fetchSportsData(question, market);
          break;
        case "Politics":
          externalData = await fetchPoliticsData(question, market);
          break;
        case "Pop Culture":
          externalData = await fetchPopCultureData(question, market);
          break;
        case "Crypto":
          externalData = await fetchCryptoData(question, market);
          break;
        default:
          externalData = await fetchGeneralData(question, market);
      }
    } catch (e) {
      console.error(`[fetch-external-data] ${cat} fetch error:`, (e as any).message);
      externalData = { error: (e as any).message, category: cat };
    }

    externalData.category = cat;
    externalData.fetched_at = new Date().toISOString();

    // Upsert cache
    await adminClient
      .from("bot_external_data_cache")
      .upsert({ market_id: marketId, data: externalData, fetched_at: new Date().toISOString() }, { onConflict: "market_id" });

    return jsonResp({ ok: true, data: externalData, cached: false });
  } catch (err) {
    console.error("[fetch-external-data] error:", err);
    return jsonResp({ error: (err as any).message }, 500);
  }
});

function detectCategory(question: string): string {
  const q = question.toLowerCase();
  if (/nba|nfl|mlb|nhl|soccer|football|tennis|ufc|mma|boxing|premier league|champions league|world cup|super bowl|playoff|game \d|match|tournament|championship/i.test(q)) return "Sports";
  if (/president|election|democrat|republican|senate|congress|governor|poll|vote|nominee|primary/i.test(q)) return "Politics";
  if (/bitcoin|btc|ethereum|eth|crypto|solana|token|defi|blockchain|price.*\$/i.test(q)) return "Crypto";
  if (/oscar|grammy|emmy|box office|album|movie|tv show|celebrity|viral|tiktok|youtube|instagram|twitter/i.test(q)) return "Pop Culture";
  return "General";
}

async function fetchSportsData(question: string, market: any): Promise<Record<string, unknown>> {
  const data: Record<string, unknown> = { source: "sports_analysis" };

  // Extract team/player names from question
  const teams = extractTeamNames(question);
  data.parsed_teams = teams;

  // Try TheSportsDB (free, no key required)
  if (teams.length > 0) {
    for (const team of teams.slice(0, 2)) {
      try {
        const searchRes = await fetch(`https://www.thesportsdb.com/api/v1/json/3/searchteams.php?t=${encodeURIComponent(team)}`);
        if (searchRes.ok) {
          const searchData = await searchRes.json();
          if (searchData.teams && searchData.teams.length > 0) {
            const t = searchData.teams[0];
            // Get last 5 events
            const eventsRes = await fetch(`https://www.thesportsdb.com/api/v1/json/3/eventslast.php?id=${t.idTeam}`);
            const eventsData = eventsRes.ok ? await eventsRes.json() : {};
            
            data[`team_${team.replace(/\s/g, '_')}`] = {
              name: t.strTeam,
              sport: t.strSport,
              league: t.strLeague,
              country: t.strCountry,
              description: (t.strDescriptionEN || "").substring(0, 300),
              recent_results: (eventsData.results || []).slice(0, 5).map((e: any) => ({
                event: e.strEvent,
                date: e.dateEvent,
                home_score: e.intHomeScore,
                away_score: e.intAwayScore,
                result: e.strResult,
              })),
            };
          }
        }
      } catch (e) {
        console.warn(`[sports] Failed to fetch data for ${team}:`, (e as any).message);
      }
    }
  }

  // Try sports API key if available
  const sportsApiKey = Deno.env.get("SPORTS_API_KEY");
  if (sportsApiKey && teams.length > 0) {
    try {
      const res = await fetch(`https://v3.football.api-sports.io/teams?search=${encodeURIComponent(teams[0])}`, {
        headers: { "x-apisports-key": sportsApiKey },
      });
      if (res.ok) {
        const apiData = await res.json();
        data.api_football = apiData.response?.slice(0, 3);
      }
    } catch (e) {
      console.warn("[sports] API-Football error:", (e as any).message);
    }
  }

  return data;
}

async function fetchPoliticsData(question: string, market: any): Promise<Record<string, unknown>> {
  const data: Record<string, unknown> = { source: "politics_analysis" };
  
  // Extract candidate names
  const candidates = extractCandidateNames(question);
  data.parsed_candidates = candidates;

  // Use Lovable AI to summarize current political landscape
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (LOVABLE_API_KEY) {
    try {
      const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-lite",
          messages: [{
            role: "user",
            content: `Provide a brief factual summary (3-5 bullet points) of the current state of affairs relevant to this prediction market question: "${question}". Include any recent polling data, endorsements, or key events you know about. Be factual and concise. Format as JSON with keys: summary, key_facts (array of strings), confidence_note.`,
          }],
          response_format: { type: "json_object" },
        }),
      });
      if (aiRes.ok) {
        const aiData = await aiRes.json();
        const content = aiData.choices?.[0]?.message?.content;
        if (content) {
          try { data.ai_context = JSON.parse(content); } catch { data.ai_context = content; }
        }
      }
    } catch (e) {
      console.warn("[politics] AI context fetch error:", (e as any).message);
    }
  }

  return data;
}

async function fetchPopCultureData(question: string, market: any): Promise<Record<string, unknown>> {
  const data: Record<string, unknown> = { source: "pop_culture_analysis" };

  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (LOVABLE_API_KEY) {
    try {
      const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-lite",
          messages: [{
            role: "user",
            content: `Provide a brief factual context (3-5 bullet points) for this prediction market question: "${question}". Include any relevant trends, sentiment, or recent events. Format as JSON with keys: summary, key_facts (array), sentiment (positive/neutral/negative).`,
          }],
          response_format: { type: "json_object" },
        }),
      });
      if (aiRes.ok) {
        const aiData = await aiRes.json();
        const content = aiData.choices?.[0]?.message?.content;
        if (content) {
          try { data.ai_context = JSON.parse(content); } catch { data.ai_context = content; }
        }
      }
    } catch (e) {
      console.warn("[pop_culture] AI context error:", (e as any).message);
    }
  }

  return data;
}

async function fetchCryptoData(question: string, market: any): Promise<Record<string, unknown>> {
  const data: Record<string, unknown> = { source: "crypto_analysis" };

  // Extract crypto symbol
  const symbolMatch = question.match(/\b(BTC|ETH|SOL|DOGE|XRP|ADA|DOT|MATIC|AVAX|LINK|bitcoin|ethereum|solana)\b/i);
  const symbol = symbolMatch ? symbolMatch[1].toUpperCase() : null;
  
  if (symbol) {
    const coinId = {
      BTC: "bitcoin", BITCOIN: "bitcoin",
      ETH: "ethereum", ETHEREUM: "ethereum",
      SOL: "solana", SOLANA: "solana",
      DOGE: "dogecoin", XRP: "ripple",
      ADA: "cardano", DOT: "polkadot",
      MATIC: "matic-network", AVAX: "avalanche-2",
      LINK: "chainlink",
    }[symbol] || symbol.toLowerCase();

    try {
      const res = await fetch(`https://api.coingecko.com/api/v3/coins/${coinId}?localization=false&tickers=false&community_data=false&developer_data=false`);
      if (res.ok) {
        const coin = await res.json();
        data.crypto = {
          name: coin.name,
          symbol: coin.symbol?.toUpperCase(),
          current_price_usd: coin.market_data?.current_price?.usd,
          price_change_24h_pct: coin.market_data?.price_change_percentage_24h,
          price_change_7d_pct: coin.market_data?.price_change_percentage_7d,
          price_change_30d_pct: coin.market_data?.price_change_percentage_30d,
          market_cap_usd: coin.market_data?.market_cap?.usd,
          ath_usd: coin.market_data?.ath?.usd,
          ath_change_pct: coin.market_data?.ath_change_percentage?.usd,
          sentiment_up_pct: coin.sentiment_votes_up_percentage,
          sentiment_down_pct: coin.sentiment_votes_down_percentage,
        };
      }
    } catch (e) {
      console.warn("[crypto] CoinGecko error:", (e as any).message);
    }
  }

  return data;
}

async function fetchGeneralData(question: string, market: any): Promise<Record<string, unknown>> {
  return { source: "general", note: "No category-specific external data available" };
}

function extractTeamNames(question: string): string[] {
  const teams: string[] = [];
  // Match "Will X win" or "X vs Y" patterns
  const vsMatch = question.match(/(.+?)\s+vs\.?\s+(.+?)(?:\s+[-–]|\s+on\s|\?|$)/i);
  if (vsMatch) {
    teams.push(vsMatch[1].replace(/^will\s+/i, "").trim());
    teams.push(vsMatch[2].trim());
    return teams;
  }
  const winMatch = question.match(/will\s+(.+?)\s+win/i);
  if (winMatch) {
    teams.push(winMatch[1].trim());
  }
  return teams;
}

function extractCandidateNames(question: string): string[] {
  const candidates: string[] = [];
  const winMatch = question.match(/will\s+(.+?)\s+(?:win|be|become)/i);
  if (winMatch) candidates.push(winMatch[1].trim());
  return candidates;
}
