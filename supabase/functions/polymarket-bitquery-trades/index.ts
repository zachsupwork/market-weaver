import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BITQUERY_URL = "https://streaming.bitquery.io/graphql";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const token = Deno.env.get("BITQUERY_API_TOKEN");
  if (!token) {
    return new Response(
      JSON.stringify({ error: "BITQUERY_API_TOKEN not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const url = new URL(req.url);
    const limit = parseInt(url.searchParams.get("limit") || "50", 10);
    const conditionId = url.searchParams.get("condition_id");

    // Build the where clause - filter for Polymarket trades on Polygon
    let whereClause = `
      TransactionStatus: { Success: true }
      Trade: {
        Side: {
          Currency: {
            SmartContract: { is: "0x2791bca1f2de4661ed88a30c99a7a9449aa84174" }
          }
        }
        Dex: { ProtocolName: { is: "polymarket" } }
      }
    `;

    // If conditionId provided, filter by market
    if (conditionId && conditionId !== "all") {
      whereClause = `
        TransactionStatus: { Success: true }
        Trade: {
          Side: {
            Currency: {
              SmartContract: { is: "0x2791bca1f2de4661ed88a30c99a7a9449aa84174" }
            }
          }
          Dex: { ProtocolName: { is: "polymarket" } }
          Currency: {
            SmartContract: { is: "${conditionId}" }
          }
        }
      `;
    }

    const query = `
      {
        EVM(network: matic) {
          DEXTradeByTokens(
            orderBy: { descending: Block_Time }
            limit: { count: ${limit} }
            where: { ${whereClause} }
          ) {
            Block {
              Time
            }
            Transaction {
              Hash
            }
            Trade {
              Amount
              Price
              PriceInUSD
              Side {
                Amount
                Currency {
                  Name
                  Symbol
                  SmartContract {
                    Address {
                      Address
                    }
                  }
                }
                Type
              }
              Currency {
                Name
                Symbol
                SmartContract {
                  Address {
                    Address
                  }
                }
              }
              Buyer
              Seller
            }
          }
        }
      }
    `;

    const res = await fetch(BITQUERY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({ query }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("[bitquery-trades] API error:", res.status, errText);
      return new Response(
        JSON.stringify({ error: `Bitquery API returned ${res.status}`, details: errText.slice(0, 500) }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result = await res.json();

    if (result.errors) {
      console.error("[bitquery-trades] GraphQL errors:", result.errors);
      return new Response(
        JSON.stringify({ error: "GraphQL error", details: result.errors }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const rawTrades = result?.data?.EVM?.DEXTradeByTokens || [];

    // Normalize to consistent shape
    const trades = rawTrades.map((t: any, i: number) => ({
      id: t.Transaction?.Hash || `trade-${i}`,
      timestamp: t.Block?.Time || "",
      price: parseFloat(t.Trade?.Price || "0"),
      priceUsd: parseFloat(t.Trade?.PriceInUSD || "0"),
      size: parseFloat(t.Trade?.Amount || "0"),
      sideAmount: parseFloat(t.Trade?.Side?.Amount || "0"),
      side: t.Trade?.Side?.Type === "buy" ? "BUY" : "SELL",
      buyer: t.Trade?.Buyer || "",
      seller: t.Trade?.Seller || "",
      tokenName: t.Trade?.Currency?.Name || "",
      tokenSymbol: t.Trade?.Currency?.Symbol || "",
      tokenAddress: t.Trade?.Currency?.SmartContract?.Address?.Address || "",
      txHash: t.Transaction?.Hash || "",
    }));

    return new Response(JSON.stringify(trades), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[bitquery-trades] Error:", (err as any).message);
    return new Response(
      JSON.stringify({ error: (err as any).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
