import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getServiceClient } from "../_shared/supabase-admin.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GAMMA_HOST = "https://gamma-api.polymarket.com";
const MAX_AI_CALLS = 12;

function jsonResp(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Gamma returns outcomePrices as a JSON string like '["0.5","0.5"]' — parse it */
function parseOutcomePrices(raw: any): number[] | null {
  if (!raw) return null;
  try {
    const arr = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!Array.isArray(arr) || arr.length < 2) return null;
    return arr.map((v: any) => parseFloat(v));
  } catch {
    return null;
  }
}

function parseClobTokenIds(raw: any): string[] {
  if (!raw) return [];
  try {
    return typeof raw === "string" ? JSON.parse(raw) : Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    let userAddress = url.searchParams.get("address");
    if (!userAddress && req.method === "POST") {
      try { userAddress = (await req.json()).address; } catch { /* ignore */ }
    }

    if (!userAddress) return jsonResp({ error: "address required" }, 400);

    const adminClient = getServiceClient();

    const { data: config } = await adminClient
      .from("bot_config")
      .select("*")
      .eq("user_address", userAddress.toLowerCase())
      .maybeSingle();

    if (!config || !config.enabled) {
      return jsonResp({ ok: true, message: "Bot not enabled", scanned: 0, opportunities_found: 0, opportunities: [] });
    }

    const minEdge = config.min_edge || 0.05;
    const categories: string[] = config.enabled_categories || [];

    // Fetch top markets by volume
    const marketsRes = await fetch(
      `${GAMMA_HOST}/markets?closed=false&limit=100&offset=0&order=volume&ascending=false`
    );
    if (!marketsRes.ok) {
      const t = await marketsRes.text();
      console.error(`[bot-scan] Gamma API error: ${marketsRes.status}`, t.substring(0, 200));
      return jsonResp({ error: "Failed to fetch markets from Gamma", detail: t.substring(0, 200) }, 502);
    }
    const allMarkets = await marketsRes.json();
    if (!Array.isArray(allMarkets)) {
      return jsonResp({ error: "Invalid Gamma response" }, 502);
    }

    console.log(`[bot-scan] Fetched ${allMarkets.length} markets for ${userAddress}`);

    // Filter to tradeable markets — handle both camelCase and snake_case, and string outcomePrices
    const candidates: any[] = [];
    for (const m of allMarkets) {
      const conditionId = m.conditionId || m.condition_id;
      if (!conditionId) continue;

      const prices = parseOutcomePrices(m.outcomePrices);
      if (!prices) continue;

      const yesPrice = prices[0];
      if (isNaN(yesPrice) || yesPrice <= 0.03 || yesPrice >= 0.97) continue;

      // Extract event slug if available
      let eventSlug: string | null = null;
      if (Array.isArray(m.events) && m.events.length > 0 && m.events[0].slug) {
        eventSlug = m.events[0].slug;
      } else if (m.eventSlug) {
        eventSlug = m.eventSlug;
      }

      // Normalize the market object for downstream use
      candidates.push({
        ...m,
        condition_id: conditionId,
        _yesPrice: yesPrice,
        _parsedPrices: prices,
        _tokenIds: parseClobTokenIds(m.clobTokenIds),
        _eventSlug: eventSlug,
      });

      if (candidates.length >= MAX_AI_CALLS) break;
    }

    console.log(`[bot-scan] ${candidates.length} candidate markets after filtering`);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const opportunities: any[] = [];
    const errors: string[] = [];

    for (const market of candidates) {
      try {
        const aiRes = await fetch(`${supabaseUrl}/functions/v1/ai-analyze-market`, {
          method: "POST",
          headers: { "apikey": supabaseAnonKey, "Content-Type": "application/json" },
          body: JSON.stringify({
            market: {
              question: market.question || market.title,
              description: market.description,
              outcomePrices: market._parsedPrices,
              volume: market.volume,
              condition_id: market.condition_id,
              end_date_iso: market.endDate,
              tags: market.tags,
            },
          }),
        });

        if (!aiRes.ok) {
          const body = await aiRes.text();
          if (aiRes.status === 429) {
            console.warn("[bot-scan] Rate limited by AI gateway, stopping early");
            break;
          }
          errors.push(`AI ${aiRes.status} for ${market.condition_id}: ${body.substring(0, 80)}`);
          continue;
        }

        const aiData = await aiRes.json();
        if (!aiData.ok || !aiData.prediction) {
          errors.push(`No prediction for ${market.condition_id}`);
          continue;
        }

        const aiProb = aiData.prediction.probability;
        const yesPrice = market._yesPrice;
        const edge = aiProb - yesPrice;

        // Category filter
        if (categories.length > 0 && aiData.category && !categories.includes(aiData.category)) continue;

        if (Math.abs(edge) >= minEdge) {
          const tokenId = edge > 0 ? market._tokenIds[0] : market._tokenIds[1];

          opportunities.push({
            user_address: userAddress.toLowerCase(),
            market_id: market.id || market.condition_id,
            condition_id: market.condition_id,
            question: market.question || market.title || "Unknown",
            outcome: edge > 0 ? "Yes" : "No",
            ai_probability: aiProb,
            market_price: yesPrice,
            edge: Math.abs(edge),
            ai_reasoning: aiData.prediction.reasoning,
            category: aiData.category,
            status: "pending",
            executed: false,
            token_id: tokenId || null,
            event_slug: market._eventSlug || null,
          });

          console.log(`[bot-scan] ✓ Opportunity: ${market.question?.substring(0, 50)} edge=${Math.abs(edge).toFixed(3)}`);
        }

        // Small delay between AI calls
        await new Promise(r => setTimeout(r, 400));
      } catch (e) {
        errors.push(`Error: ${market.condition_id}: ${(e as any).message}`);
      }
    }

    console.log(`[bot-scan] Done: ${candidates.length} scanned, ${opportunities.length} opportunities, ${errors.length} errors`);
    if (errors.length > 0) console.warn(`[bot-scan] Errors:`, errors.slice(0, 5));

    // Store opportunities
    if (opportunities.length > 0) {
      await adminClient
        .from("bot_opportunities")
        .update({ status: "expired" })
        .eq("user_address", userAddress.toLowerCase())
        .eq("status", "pending")
        .lt("expires_at", new Date().toISOString());

      const { error: insertError } = await adminClient
        .from("bot_opportunities")
        .insert(opportunities);

      if (insertError) {
        console.error("[bot-scan] DB insert error:", insertError);
        errors.push(`DB insert: ${insertError.message}`);
      }
    }

    return jsonResp({
      ok: true,
      scanned: candidates.length,
      total_fetched: allMarkets.length,
      opportunities_found: opportunities.length,
      opportunities,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    console.error("[bot-scan-markets] error:", err);
    return jsonResp({ error: (err as any).message }, 500);
  }
});
