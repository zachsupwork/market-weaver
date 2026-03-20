import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getServiceClient } from "../_shared/supabase-admin.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GAMMA_HOST = "https://gamma-api.polymarket.com";
const MAX_AI_CALLS = 12; // Stay well within 60s timeout

function jsonResp(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const userAddress = url.searchParams.get("address") || (req.method === "POST" ? (await req.json().catch(() => ({}))).address : null);

    if (!userAddress) return jsonResp({ error: "address required" }, 400);

    const adminClient = getServiceClient();

    // Get user's bot config
    const { data: config } = await adminClient
      .from("bot_config")
      .select("*")
      .eq("user_address", userAddress.toLowerCase())
      .maybeSingle();

    if (!config || !config.enabled) {
      return jsonResp({ ok: true, message: "Bot not enabled", opportunities: [] });
    }

    const minEdge = config.min_edge || 0.05;
    const categories = config.enabled_categories || [];

    // Fetch top markets by volume (single batch, fast)
    const marketsRes = await fetch(
      `${GAMMA_HOST}/markets?closed=false&limit=100&offset=0&order=volume&ascending=false`
    );
    if (!marketsRes.ok) {
      const t = await marketsRes.text();
      console.error(`[bot-scan] Gamma API error: ${marketsRes.status}`, t);
      return jsonResp({ error: "Failed to fetch markets from Gamma" }, 502);
    }
    const allMarkets = await marketsRes.json();
    if (!Array.isArray(allMarkets)) {
      return jsonResp({ error: "Invalid Gamma response" }, 502);
    }

    console.log(`[bot-scan] Fetched ${allMarkets.length} markets for ${userAddress}`);

    // Filter to tradeable markets with interesting prices
    const candidates = allMarkets.filter((m: any) => {
      if (!m.outcomePrices || !m.condition_id) return false;
      const yesPrice = parseFloat(m.outcomePrices?.[0] || "0");
      return yesPrice > 0.03 && yesPrice < 0.97;
    }).slice(0, MAX_AI_CALLS);

    console.log(`[bot-scan] Analyzing ${candidates.length} candidate markets`);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const opportunities: any[] = [];
    const errors: string[] = [];

    for (const market of candidates) {
      const yesPrice = parseFloat(market.outcomePrices[0]);
      
      try {
        // Call AI analysis directly (skip external data to save time)
        const aiRes = await fetch(`${supabaseUrl}/functions/v1/ai-analyze-market`, {
          method: "POST",
          headers: { "apikey": supabaseAnonKey, "Content-Type": "application/json" },
          body: JSON.stringify({ market }),
        });

        if (!aiRes.ok) {
          const body = await aiRes.text();
          if (aiRes.status === 429) {
            console.warn("[bot-scan] Rate limited by AI gateway, stopping early");
            break; // Stop, don't continue burning time
          }
          errors.push(`AI ${aiRes.status} for ${market.condition_id}: ${body.substring(0, 100)}`);
          continue;
        }

        const aiData = await aiRes.json();
        if (!aiData.ok || !aiData.prediction) {
          errors.push(`No prediction for ${market.condition_id}`);
          continue;
        }

        const aiProb = aiData.prediction.probability;
        const edge = aiProb - yesPrice;

        // Category filter
        if (categories.length > 0 && aiData.category && !categories.includes(aiData.category)) continue;

        if (Math.abs(edge) >= minEdge) {
          const tokenIds = market.clobTokenIds || [];
          const tokenId = edge > 0 ? tokenIds[0] : tokenIds[1];

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
          });
        }

        // Small delay between AI calls
        await new Promise(r => setTimeout(r, 300));
      } catch (e) {
        errors.push(`Error: ${market.condition_id}: ${(e as any).message}`);
      }
    }

    console.log(`[bot-scan] Found ${opportunities.length} opportunities, ${errors.length} errors`);

    // Store opportunities
    if (opportunities.length > 0) {
      // Expire old pending
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
        console.error("[bot-scan] insert error:", insertError);
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
