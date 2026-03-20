import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getServiceClient } from "../_shared/supabase-admin.ts";
import { decrypt } from "../_shared/crypto.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CLOB_HOST = "https://clob.polymarket.com";

function jsonResp(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function buildL2Signature(secret: string, message: string): Promise<string> {
  const trimmed = secret.trim();
  const normalized = trimmed.replace(/-/g, "+").replace(/_/g, "/").replace(/\s+/g, "");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const secretBytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) secretBytes[i] = binary.charCodeAt(i);

  const key = await crypto.subtle.importKey(
    "raw",
    secretBytes.buffer as ArrayBuffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message).buffer as ArrayBuffer);
  const b64 = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return b64.replace(/\+/g, "-").replace(/\//g, "_");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const userAddress = url.searchParams.get("address") || (req.method === "POST" ? (await req.json().catch(() => ({}))).address : null);

    if (!userAddress) return jsonResp({ error: "address required" }, 400);

    const adminClient = getServiceClient();
    const masterKey = Deno.env.get("MASTER_KEY");

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
      .limit(10);

    if (!opportunities || opportunities.length === 0) {
      return jsonResp({ ok: true, message: "No pending opportunities", trades: [] });
    }

    // Get user credentials for real execution
    let creds: { apiKey: string; secret: string; passphrase: string } | null = null;
    let polyAddress = "";
    if (!isSimulation && masterKey) {
      const { data: credRow } = await adminClient
        .from("polymarket_user_creds")
        .select("value_encrypted, iv, auth_tag, address")
        .eq("address", userAddress.toLowerCase())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (credRow) {
        try {
          const credsJson = await decrypt(credRow.value_encrypted, credRow.iv, credRow.auth_tag, masterKey);
          creds = JSON.parse(credsJson);
          polyAddress = credRow.address;
        } catch (e) {
          console.error("[bot-execute] Failed to decrypt creds:", (e as any).message);
        }
      }

      if (!creds) {
        console.warn("[bot-execute] No valid credentials for real execution, falling back to simulation");
      }
    }

    const trades: any[] = [];
    const bankroll = 1000; // Default notional bankroll for simulation

    for (const opp of opportunities) {
      // Kelly criterion for bet sizing
      const kellyFraction = (opp.ai_probability - opp.market_price) / (1 - opp.market_price);
      const cappedKelly = Math.min(Math.max(kellyFraction, 0), maxBetPercent);
      const betSize = Math.max(1, Math.round(bankroll * cappedKelly * 100) / 100);

      const trade: any = {
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
        simulation: isSimulation,
        token_id: opp.token_id || null,
        exited: false,
      };

      if (isSimulation) {
        trade.status = "simulated";
      } else if (creds && opp.token_id) {
        // Real execution
        try {
          const result = await placeRealOrder(creds, polyAddress, opp, betSize);
          trade.status = result.success ? "executed" : "failed";
          trade.order_id = result.orderId || null;
          trade.error_message = result.error || null;
          if (result.success) {
            console.log(`[bot-execute] Real order placed: ${result.orderId}`);
          }
        } catch (e) {
          trade.status = "failed";
          trade.error_message = (e as any).message;
          console.error("[bot-execute] Order placement error:", (e as any).message);
        }
      } else {
        trade.status = "awaiting_signature";
        if (!creds) trade.error_message = "No trading credentials. Enable trading first.";
        if (!opp.token_id) trade.error_message = "No token ID for this market.";
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

async function placeRealOrder(
  creds: { apiKey: string; secret: string; passphrase: string },
  polyAddress: string,
  opportunity: any,
  betSize: number
): Promise<{ success: boolean; orderId?: string; error?: string }> {
  const side = opportunity.outcome === "Yes" ? "BUY" : "SELL";
  const tokenId = opportunity.token_id;
  const price = opportunity.market_price;

  // Calculate amounts in USDC (6 decimals)
  const makerAmount = Math.round(betSize * 1e6);
  const takerAmount = Math.round((betSize / price) * 1e6);

  const orderPayload = {
    order: {
      salt: Date.now(),
      maker: polyAddress,
      signer: polyAddress,
      taker: "0x0000000000000000000000000000000000000000",
      tokenId,
      makerAmount: makerAmount.toString(),
      takerAmount: takerAmount.toString(),
      side,
      expiration: "0",
      nonce: "0",
      feeRateBps: "0",
      signatureType: 0,
      signature: "0x",
    },
    owner: creds.apiKey,
    orderType: "GTC",
  };

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const method = "POST";
  const requestPath = "/order";
  const orderBody = JSON.stringify(orderPayload);
  const signMessage = timestamp + method + requestPath + orderBody;
  const signature = await buildL2Signature(creds.secret, signMessage);

  // Add builder headers
  const builderHeaders: Record<string, string> = {};
  const builderKey = Deno.env.get("POLY_BUILDER_API_KEY");
  const builderSecret = Deno.env.get("POLY_BUILDER_SECRET");
  const builderPassphrase = Deno.env.get("POLY_BUILDER_PASSPHRASE");

  if (builderKey && builderSecret && builderPassphrase) {
    const builderTimestamp = Math.floor(Date.now() / 1000).toString();
    const builderMessage = builderTimestamp + method + requestPath + orderBody;
    const builderSig = await buildL2Signature(builderSecret, builderMessage);
    builderHeaders["POLY_BUILDER_API_KEY"] = builderKey;
    builderHeaders["POLY_BUILDER_PASSPHRASE"] = builderPassphrase;
    builderHeaders["POLY_BUILDER_TIMESTAMP"] = builderTimestamp;
    builderHeaders["POLY_BUILDER_SIGNATURE"] = builderSig;
  }

  const res = await fetch(`${CLOB_HOST}${requestPath}`, {
    method,
    headers: {
      "POLY_ADDRESS": polyAddress,
      "POLY_API_KEY": creds.apiKey,
      "POLY_PASSPHRASE": creds.passphrase,
      "POLY_TIMESTAMP": timestamp,
      "POLY_SIGNATURE": signature,
      ...builderHeaders,
      "Content-Type": "application/json",
    },
    body: orderBody,
  });

  const resBody = await res.text();
  console.log(`[bot-execute] CLOB response: ${res.status} ${resBody.substring(0, 300)}`);

  if (res.ok) {
    let parsed;
    try { parsed = JSON.parse(resBody); } catch { parsed = {}; }
    return { success: true, orderId: parsed.orderID || parsed.order_id || parsed.id };
  }

  return { success: false, error: `CLOB ${res.status}: ${resBody.substring(0, 200)}` };
}
