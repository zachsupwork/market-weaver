import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResp({ error: "POST required" }, 405);

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return jsonResp({ error: "LOVABLE_API_KEY not configured" }, 500);

    const { market, externalData } = await req.json();
    if (!market || !market.question) return jsonResp({ error: "market with question required" }, 400);

    const category = detectCategory(market);
    const systemPrompt = buildSystemPrompt(category);
    const userPrompt = buildUserPrompt(market, category, externalData);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "predict_outcome",
              description: "Return a probability prediction and trading strategy for a prediction market outcome",
              parameters: {
                type: "object",
                properties: {
                  probability: {
                    type: "number",
                    description: "Predicted probability of YES outcome (0.0 to 1.0)",
                  },
                  confidence: {
                    type: "string",
                    enum: ["low", "medium", "high"],
                    description: "Confidence level in the prediction",
                  },
                  reasoning: {
                    type: "string",
                    description: "Detailed reasoning for the prediction (3-5 sentences). Explain why there is an edge, what factors you considered, and any risks.",
                  },
                  key_factors: {
                    type: "array",
                    items: { type: "string" },
                    description: "Top 3-5 factors influencing the prediction",
                  },
                  suggested_action: {
                    type: "string",
                    enum: ["BUY_YES", "BUY_NO"],
                    description: "Whether the edge favors buying YES or NO tokens",
                  },
                  suggested_entry: {
                    type: "number",
                    description: "Suggested entry price (0.01-0.99). Use current market price for immediate execution, or a slightly better price for a limit order.",
                  },
                  take_profit: {
                    type: "number",
                    description: "Suggested take-profit price (0.01-0.99). The price at which to exit for profit.",
                  },
                  stop_loss: {
                    type: "number",
                    description: "Suggested stop-loss price (0.01-0.99). The price at which to exit to limit loss.",
                  },
                },
                required: ["probability", "confidence", "reasoning", "key_factors", "suggested_action", "suggested_entry", "take_profit", "stop_loss"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "predict_outcome" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) return jsonResp({ error: "Rate limited, try again later" }, 429);
      if (response.status === 402) return jsonResp({ error: "AI credits exhausted" }, 402);
      const text = await response.text();
      console.error("AI gateway error:", response.status, text);
      return jsonResp({ error: "AI analysis failed" }, 500);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      return jsonResp({ error: "No prediction returned from AI" }, 500);
    }

    const prediction = JSON.parse(toolCall.function.arguments);

    // Clamp probability
    prediction.probability = Math.max(0.01, Math.min(0.99, prediction.probability));
    // Clamp strategy fields
    if (prediction.suggested_entry != null) prediction.suggested_entry = Math.max(0.01, Math.min(0.99, prediction.suggested_entry));
    if (prediction.take_profit != null) prediction.take_profit = Math.max(0.01, Math.min(0.99, prediction.take_profit));
    if (prediction.stop_loss != null) prediction.stop_loss = Math.max(0.01, Math.min(0.99, prediction.stop_loss));

    return jsonResp({
      ok: true,
      prediction,
      market_id: market.condition_id || market.id,
      category,
      has_external_data: !!externalData,
    });
  } catch (err) {
    console.error("[ai-analyze-market] error:", err);
    return jsonResp({ error: (err as any).message }, 500);
  }
});

function detectCategory(market: any): string {
  const q = (market.question || market.title || "").toLowerCase();
  const tags = (market.tags || []).map((t: string) => t.toLowerCase());
  const allText = q + " " + tags.join(" ");

  if (/nba|nfl|mlb|nhl|soccer|football|tennis|ufc|mma|boxing|premier league|champions league|world cup|super bowl|playoff|game \d|series|match|tournament|championship|win.*season/i.test(allText)) return "Sports";
  if (/president|election|democrat|republican|senate|congress|governor|poll|vote|nominee|cabinet|party|legislation|impeach|primary/i.test(allText)) return "Politics";
  if (/bitcoin|btc|ethereum|eth|crypto|solana|sol|token|defi|nft|blockchain|price.*\$|above|below.*price/i.test(allText)) return "Crypto";
  if (/stock|s&p|nasdaq|fed|interest rate|gdp|inflation|earnings|ipo|market cap|dow|treasury/i.test(allText)) return "Finance";
  if (/oscar|grammy|emmy|box office|album|movie|tv show|celebrity|viral|tiktok|youtube|instagram|twitter/i.test(allText)) return "Pop Culture";
  return "General";
}

function buildSystemPrompt(category: string): string {
  const base = `You are an expert prediction market analyst and trader. Your job is to estimate the TRUE probability of an event occurring AND provide a concrete trading strategy. Be calibrated: if you think something has a 30% chance, say 0.30. Do not be biased toward 50%. Consider base rates, recent trends, and domain-specific factors.

CRITICAL: When external data is provided (recent results, stats, polling, prices), you MUST incorporate it into your analysis. Do not ignore it. Weight it heavily as it represents the most current information available.

TRADING STRATEGY: You must also provide:
- suggested_action: BUY_YES if the market underprices YES, BUY_NO if it underprices NO
- suggested_entry: the price to enter at (use current market price for market orders, or a slightly better price for limits)
- take_profit: the price target to exit with profit
- stop_loss: the price level to cut losses`;

  const categoryGuides: Record<string, string> = {
    Sports: `For sports markets: consider team/player form, injuries, head-to-head records, home/away advantage, motivation, and recent performance trends. Use historical base rates for similar events. If external data includes recent match results, weigh them heavily.`,
    Politics: `For political markets: consider polling data, historical patterns, incumbent advantage, fundraising, endorsements, demographic trends, and prediction market consensus. Be aware of polling biases. If external data includes polling or context, incorporate it directly.`,
    Crypto: `For crypto markets: consider current price trends, market sentiment, technical analysis patterns, regulatory news, macro conditions, and historical volatility. If external data includes current prices and trends, use them to calibrate your prediction.`,
    Finance: `For financial markets: consider economic indicators, Fed policy, earnings trends, historical patterns, and macro conditions. Be conservative with extreme predictions.`,
    "Pop Culture": `For pop culture markets: consider social media trends, recent news, public sentiment, and historical patterns for similar events. If external data includes sentiment analysis, weight it in your prediction.`,
    General: `Consider all available evidence and base rates. Be well-calibrated.`,
  };

  return base + "\n\n" + (categoryGuides[category] || categoryGuides.General);
}

function buildUserPrompt(market: any, category: string, externalData?: any): string {
  const parts = [`Market Question: "${market.question}"`];

  if (market.description) parts.push(`Description: ${market.description.substring(0, 500)}`);
  if (market.end_date_iso) parts.push(`Resolution date: ${market.end_date_iso}`);
  if (market.outcomePrices) {
    const yesPrice = parseFloat(market.outcomePrices[0]);
    if (!isNaN(yesPrice)) parts.push(`Current market YES price: ${(yesPrice * 100).toFixed(1)}% (${Math.round(yesPrice * 100)}¢)`);
  }
  if (market.volume) parts.push(`Total volume: $${Number(market.volume).toLocaleString()}`);

  parts.push(`\nCategory: ${category}`);

  if (externalData && Object.keys(externalData).length > 0) {
    parts.push(`\n--- EXTERNAL DATA (use this to improve your prediction) ---`);
    parts.push(JSON.stringify(externalData, null, 2).substring(0, 3000));
    parts.push(`--- END EXTERNAL DATA ---`);
  }

  parts.push(`\nAnalyze this market and predict the probability of the YES outcome. Then provide a complete trading strategy including entry price, take-profit, and stop-loss levels.`);

  return parts.join("\n");
}
