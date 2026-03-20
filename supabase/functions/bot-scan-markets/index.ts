import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getServiceClient } from "../_shared/supabase-admin.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GAMMA_HOST = "https://gamma-api.polymarket.com";

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
    const maxMarkets = config.max_markets_to_scan || 200;

    // Fetch active markets with pagination
    const allMarkets: any[] = [];
    const batchSize = 50;
    let offset = 0;

    while (allMarkets.length < maxMarkets) {
      const limit = Math.min(batchSize, maxMarkets - allMarkets.length);
      const marketsRes = await fetch(
        `${GAMMA_HOST}/markets?closed=false&limit=${limit}&offset=${offset}&order=volume&ascending=false`
      );
      if (!marketsRes.ok) {
        console.error(`[bot-scan] Gamma API error at offset ${offset}: ${marketsRes.status}`);
        break;
      }
      const batch = await marketsRes.json();
      if (!Array.isArray(batch) || batch.length === 0) break;

      allMarkets.push(...batch);
      offset += batch.length;

      // Rate limit between pagination calls
      if (batch.length === limit) {
        await new Promise(r => setTimeout(r, 300));
      } else {
        break; // No more markets
      }
    }

    console.log(`[bot-scan] Fetched ${allMarkets.length} markets for ${userAddress}`);

    // Get Supabase function URL for AI analysis and external data
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const opportunities: any[] = [];
    const errors: string[] = [];
    let scanned = 0;

    for (const market of allMarkets) {
      if (!market.outcomePrices || !market.condition_id) continue;

      const yesPrice = parseFloat(market.outcomePrices?.[0] || "0");
      if (yesPrice <= 0.02 || yesPrice >= 0.98) continue; // Skip near-certain markets

      scanned++;

      try {
        // Fetch external data first
        let externalData: any = null;
        try {
          const extRes = await fetch(`${supabaseUrl}/functions/v1/fetch-external-data`, {
            method: "POST",
            headers: { "apikey": supabaseAnonKey, "Content-Type": "application/json" },
            body: JSON.stringify({ market }),
          });
          if (extRes.ok) {
            const extBody = await extRes.json();
            if (extBody.ok) externalData = extBody.data;
          }
        } catch (e) {
          console.warn(`[bot-scan] External data fetch failed for ${market.condition_id}:`, (e as any).message);
        }

        // Call AI analysis with external data
        const aiRes = await fetch(`${supabaseUrl}/functions/v1/ai-analyze-market`, {
          method: "POST",
          headers: { "apikey": supabaseAnonKey, "Content-Type": "application/json" },
          body: JSON.stringify({ market, externalData }),
        });

        if (!aiRes.ok) {
          if (aiRes.status === 429) {
            console.warn("[bot-scan] Rate limited, pausing...");
            await new Promise(r => setTimeout(r, 5000));
            continue;
          }
          errors.push(`AI analysis failed for ${market.condition_id}: ${aiRes.status}`);
          continue;
        }

        const aiData = await aiRes.json();
        if (!aiData.ok || !aiData.prediction) continue;

        const aiProb = aiData.prediction.probability;
        const edge = aiProb - yesPrice;

        // Check if category matches
        if (categories.length > 0 && aiData.category && !categories.includes(aiData.category)) continue;

        if (Math.abs(edge) >= minEdge) {
          // Extract token IDs
          const tokenIds = market.clobTokenIds || [];
          const tokenId = edge > 0 ? tokenIds[0] : tokenIds[1]; // YES token if bullish, NO if bearish

          const opportunity = {
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
            external_data: externalData,
          };

          opportunities.push(opportunity);
        }

        // Delay between AI calls to avoid rate limiting
        await new Promise(r => setTimeout(r, 800));
      } catch (e) {
        errors.push(`Error analyzing ${market.condition_id}: ${(e as any).message}`);
      }
    }

    // Store opportunities
    if (opportunities.length > 0) {
      // Expire old pending opportunities for this user
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
      }
    }

    return jsonResp({
      ok: true,
      scanned,
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
