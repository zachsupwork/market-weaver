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
      return jsonResp({ ok: true, message: "Bot not enabled", trades: [] });
    }

    const isSimulation = config.simulation_mode;
    const maxBetPercent = config.max_bet_percent || 0.05;
    const minEdge = config.min_edge || 0.05;

    // Get pending opportunities
    const { data: opportunities } = await adminClient
      .from("bot_opportunities")
      .select("*")
      .eq("user_address", userAddress.toLowerCase())
      .eq("status", "pending")
      .eq("executed", false)
      .gt("expires_at", new Date().toISOString())
      .gte("edge", minEdge)
      .order("edge", { ascending: false })
      .limit(5);

    if (!opportunities || opportunities.length === 0) {
      return jsonResp({ ok: true, message: "No pending opportunities", trades: [] });
    }

    const trades: any[] = [];

    for (const opp of opportunities) {
      // Kelly criterion for bet sizing: f = edge / (odds - 1) simplified for binary
      // f = (aiProb - marketPrice) / (1 - marketPrice)
      const kellyFraction = (opp.ai_probability - opp.market_price) / (1 - opp.market_price);
      const cappedKelly = Math.min(Math.max(kellyFraction, 0), maxBetPercent);

      // For simulation, use a fixed notional bankroll of $1000
      const bankroll = 1000; // In real mode, this would come from wallet balance
      const betSize = Math.max(1, Math.round(bankroll * cappedKelly * 100) / 100);

      const trade = {
        user_address: userAddress.toLowerCase(),
        opportunity_id: opp.id,
        market_id: opp.market_id,
        condition_id: opp.condition_id,
        question: opp.question,
        outcome: opp.outcome,
        side: opp.outcome === "Yes" ? "BUY" : "SELL",
        size: betSize,
        entry_price: opp.market_price,
        current_price: opp.market_price,
        pnl: 0,
        status: isSimulation ? "simulated" : "pending",
        simulation: isSimulation,
      };

      if (!isSimulation) {
        // Real execution would go through polymarket-post-signed-order
        // For now, mark as pending - real execution requires client-side signing
        trade.status = "awaiting_signature";
      }

      trades.push(trade);

      // Mark opportunity as executed
      await adminClient
        .from("bot_opportunities")
        .update({ executed: true, status: "executed" })
        .eq("id", opp.id);
    }

    // Insert trades
    if (trades.length > 0) {
      const { error: insertError } = await adminClient
        .from("bot_trades")
        .insert(trades);

      if (insertError) {
        console.error("[bot-execute] insert error:", insertError);
      }
    }

    return jsonResp({
      ok: true,
      trades_created: trades.length,
      trades,
      simulation: isSimulation,
    });
  } catch (err) {
    console.error("[bot-execute-trades] error:", err);
    return jsonResp({ error: (err as any).message }, 500);
  }
});
