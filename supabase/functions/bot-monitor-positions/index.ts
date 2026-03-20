import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getServiceClient } from "../_shared/supabase-admin.ts";
import { decrypt } from "../_shared/crypto.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GAMMA_HOST = "https://gamma-api.polymarket.com";
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
    const adminClient = getServiceClient();
    const masterKey = Deno.env.get("MASTER_KEY");

    // Get all open (executed, not exited) trades
    const { data: openTrades, error: tradesErr } = await adminClient
      .from("bot_trades")
      .select("*")
      .eq("status", "executed")
      .eq("exited", false)
      .eq("simulation", false);

    if (tradesErr) {
      console.error("[bot-monitor] trades fetch error:", tradesErr);
      return jsonResp({ error: tradesErr.message }, 500);
    }

    if (!openTrades || openTrades.length === 0) {
      return jsonResp({ ok: true, message: "No open positions to monitor", processed: 0 });
    }

    // Group trades by user_address to load config once per user
    const byUser: Record<string, any[]> = {};
    for (const trade of openTrades) {
      const addr = trade.user_address;
      if (!byUser[addr]) byUser[addr] = [];
      byUser[addr].push(trade);
    }

    let totalProcessed = 0;
    let totalExited = 0;
    const errors: string[] = [];

    for (const [userAddress, userTrades] of Object.entries(byUser)) {
      // Get user's bot config for exit parameters
      const { data: config } = await adminClient
        .from("bot_config")
        .select("*")
        .eq("user_address", userAddress)
        .maybeSingle();

      if (!config) continue;

      const takeProfitPct = config.take_profit_percent || 20;
      const stopLossPct = config.stop_loss_percent || 10;
      const exitBeforeHours = config.exit_before_resolution_hours || 0;

      for (const trade of userTrades) {
        totalProcessed++;
        try {
          // Fetch current price from Gamma
          let currentPrice = trade.entry_price;
          try {
            const marketRes = await fetch(`${GAMMA_HOST}/markets?condition_id=${trade.condition_id}`);
            if (marketRes.ok) {
              const markets = await marketRes.json();
              const m = Array.isArray(markets) ? markets[0] : null;
              if (m?.outcomePrices) {
                const yesPrice = parseFloat(m.outcomePrices[0]);
                if (!isNaN(yesPrice)) currentPrice = yesPrice;
              }
            }
          } catch (e) {
            console.warn(`[bot-monitor] price fetch error for ${trade.condition_id}:`, (e as any).message);
          }

          // Update current price on trade
          await adminClient
            .from("bot_trades")
            .update({ current_price: currentPrice, updated_at: new Date().toISOString() })
            .eq("id", trade.id);

          // Check exit conditions
          let shouldExit = false;
          let exitReason = "";

          // Take profit
          const profitPct = ((currentPrice - trade.entry_price) / trade.entry_price) * 100;
          if (profitPct >= takeProfitPct) {
            shouldExit = true;
            exitReason = `take_profit (${profitPct.toFixed(1)}% >= ${takeProfitPct}%)`;
          }

          // Stop loss
          const lossPct = ((trade.entry_price - currentPrice) / trade.entry_price) * 100;
          if (lossPct >= stopLossPct) {
            shouldExit = true;
            exitReason = `stop_loss (${lossPct.toFixed(1)}% loss >= ${stopLossPct}%)`;
          }

          // Time-based exit (check if market ends soon)
          if (exitBeforeHours > 0) {
            try {
              const marketRes = await fetch(`${GAMMA_HOST}/markets?condition_id=${trade.condition_id}`);
              if (marketRes.ok) {
                const markets = await marketRes.json();
                const m = Array.isArray(markets) ? markets[0] : null;
                if (m?.end_date_iso) {
                  const endDate = new Date(m.end_date_iso);
                  const hoursUntilEnd = (endDate.getTime() - Date.now()) / (1000 * 60 * 60);
                  if (hoursUntilEnd <= exitBeforeHours && hoursUntilEnd > 0) {
                    shouldExit = true;
                    exitReason = `time_exit (${hoursUntilEnd.toFixed(1)}h until resolution)`;
                  }
                }
              }
            } catch (e) {
              // Skip time check on error
            }
          }

          if (shouldExit && masterKey) {
            // Try to place exit order
            const exitSuccess = await attemptExitOrder(adminClient, trade, currentPrice, userAddress, masterKey);
            
            const pnl = (currentPrice - trade.entry_price) * trade.size;
            await adminClient
              .from("bot_trades")
              .update({
                exited: true,
                exit_price: currentPrice,
                exit_reason: exitReason,
                pnl,
                status: exitSuccess ? "closed" : "exit_failed",
                updated_at: new Date().toISOString(),
              })
              .eq("id", trade.id);

            totalExited++;
            console.log(`[bot-monitor] Exited trade ${trade.id}: ${exitReason}, pnl=$${pnl.toFixed(2)}`);
          }
        } catch (e) {
          errors.push(`Trade ${trade.id}: ${(e as any).message}`);
        }

        // Rate limit
        await new Promise(r => setTimeout(r, 200));
      }
    }

    return jsonResp({
      ok: true,
      processed: totalProcessed,
      exited: totalExited,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    console.error("[bot-monitor-positions] error:", err);
    return jsonResp({ error: (err as any).message }, 500);
  }
});

async function attemptExitOrder(
  adminClient: any,
  trade: any,
  currentPrice: number,
  userAddress: string,
  masterKey: string
): Promise<boolean> {
  try {
    // Get user credentials
    const { data: credRow } = await adminClient
      .from("polymarket_user_creds")
      .select("value_encrypted, iv, auth_tag, address")
      .eq("address", userAddress)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!credRow) {
      console.warn(`[bot-monitor] No creds for ${userAddress}, marking exit without order`);
      return false;
    }

    const credsJson = await decrypt(credRow.value_encrypted, credRow.iv, credRow.auth_tag, masterKey);
    const creds = JSON.parse(credsJson);

    if (!creds.apiKey || !creds.secret || !creds.passphrase) return false;

    // For exit: if original was BUY, we SELL; if SELL, we BUY
    const exitSide = trade.side === "BUY" ? "SELL" : "BUY";
    const tokenId = trade.token_id;
    
    if (!tokenId) {
      console.warn(`[bot-monitor] No token_id for trade ${trade.id}, cannot place exit order`);
      return false;
    }

    // Build a market order to exit
    const orderPayload = {
      order: {
        tokenId,
        makerAmount: Math.round(trade.size * 1e6).toString(),
        takerAmount: Math.round(trade.size * currentPrice * 1e6).toString(),
        side: exitSide,
        feeRateBps: "0",
        nonce: "0",
        expiration: "0",
        signatureType: 0,
      },
      owner: creds.apiKey,
      orderType: "FOK", // Fill-or-kill for exit
    };

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const method = "POST";
    const requestPath = "/order";
    const orderBody = JSON.stringify(orderPayload);
    const signMessage = timestamp + method + requestPath + orderBody;
    const signature = await buildL2Signature(creds.secret, signMessage);

    const res = await fetch(`${CLOB_HOST}${requestPath}`, {
      method,
      headers: {
        "POLY_ADDRESS": userAddress,
        "POLY_API_KEY": creds.apiKey,
        "POLY_PASSPHRASE": creds.passphrase,
        "POLY_TIMESTAMP": timestamp,
        "POLY_SIGNATURE": signature,
        "Content-Type": "application/json",
      },
      body: orderBody,
    });

    if (res.ok) {
      console.log(`[bot-monitor] Exit order placed for trade ${trade.id}`);
      return true;
    } else {
      const body = await res.text();
      console.warn(`[bot-monitor] Exit order failed: ${res.status} ${body.substring(0, 200)}`);
      return false;
    }
  } catch (e) {
    console.warn(`[bot-monitor] Exit order error:`, (e as any).message);
    return false;
  }
}
