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

    // Fetch active markets from Gamma
    const marketsRes = await fetch(`${GAMMA_HOST}/markets?closed=false&limit=100&order=volume&ascending=false`);
    if (!marketsRes.ok) {
      const t = await marketsRes.text();
      return jsonResp({ error: `Gamma API error: ${marketsRes.status}` }, 502);
    }
    const markets = await marketsRes.json();

    // Get Supabase function URL for AI analysis
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const opportunities: any[] = [];
    const errors: string[] = [];

    // Analyze top markets (limit to avoid rate limits)
    const marketsToAnalyze = (Array.isArray(markets) ? markets : []).slice(0, 20);

    for (const market of marketsToAnalyze) {
      if (!market.outcomePrices || !market.condition_id) continue;

      const yesPrice = parseFloat(market.outcomePrices?.[0] || "0");
      if (yesPrice <= 0.02 || yesPrice >= 0.98) continue; // Skip near-certain markets

      try {
        const aiRes = await fetch(`${supabaseUrl}/functions/v1/ai-analyze-market`, {
          method: "POST",
          headers: {
            "apikey": supabaseAnonKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ market }),
        });

        if (!aiRes.ok) {
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
          };

          opportunities.push(opportunity);
        }

        // Small delay to avoid rate limiting
        await new Promise(r => setTimeout(r, 500));
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
      scanned: marketsToAnalyze.length,
      opportunities_found: opportunities.length,
      opportunities,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    console.error("[bot-scan-markets] error:", err);
    return jsonResp({ error: (err as any).message }, 500);
  }
});
