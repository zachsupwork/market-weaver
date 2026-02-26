import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchMarketByConditionId, type PolymarketMarket } from "@/lib/polymarket-api";
import { OrderbookView } from "@/components/trading/OrderbookView";
import { OrderTicket } from "@/components/trading/OrderTicket";
import { ArrowLeft, BarChart3, Droplets, Calendar, Loader2, ExternalLink } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

function formatVol(n: number): string {
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

const Trade = () => {
  const { conditionId } = useParams<{ conditionId: string }>();
  const [selectedOutcome, setSelectedOutcome] = useState(0);

  const { data: market, isLoading } = useQuery({
    queryKey: ["trade-market", conditionId],
    queryFn: () => fetchMarketByConditionId(conditionId!),
    enabled: !!conditionId,
    staleTime: 15_000,
  });

  // Guard: missing/undefined param
  if (!conditionId || conditionId === "undefined") {
    return (
      <div className="container py-16 text-center">
        <p className="text-lg font-semibold text-destructive">Invalid market ID</p>
        <p className="text-sm text-muted-foreground mt-1">The market link appears to be broken.</p>
        <Link to="/live" className="text-primary text-sm mt-4 inline-block hover:underline">
          ← Back to live markets
        </Link>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!market) {
    return (
      <div className="container py-16 text-center">
        <p className="text-muted-foreground">
          Market not found{conditionId ? ` (ID: ${conditionId.slice(0, 12)}…)` : ""}
        </p>
        <Link to="/live" className="text-primary text-sm mt-2 inline-block hover:underline">
          ← Back to live markets
        </Link>
      </div>
    );
  }

  const prices = market.outcome_prices ? JSON.parse(market.outcome_prices) : [];
  const outcomes = market.outcomes ? JSON.parse(market.outcomes) : ["Yes", "No"];
  const tokenIds = market.clob_token_ids ? JSON.parse(market.clob_token_ids) : [];

  const currentTokenId = tokenIds[selectedOutcome];
  const currentPrice = prices[selectedOutcome] ? parseFloat(prices[selectedOutcome]) : 0.5;
  const currentOutcome = outcomes[selectedOutcome] || (selectedOutcome === 0 ? "Yes" : "No");

  return (
    <div className="min-h-screen">
      <div className="container py-8 max-w-6xl">
        <Link
          to="/live"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft className="h-4 w-4" /> Back to markets
        </Link>

        {/* Header */}
        <div className="mb-6">
          <div className="flex items-start gap-4 mb-3">
            {market.icon && (
              <img src={market.icon} alt="" className="h-10 w-10 rounded-full bg-muted shrink-0 mt-1" />
            )}
            <div className="flex-1">
              <h1 className="text-xl font-bold leading-snug">{market.question}</h1>
              {market.description && (
                <p className="text-sm text-muted-foreground mt-1 line-clamp-3">{market.description}</p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <BarChart3 className="h-3.5 w-3.5" />
              <span>Vol: <span className="font-mono text-foreground">{formatVol(market.volume_num || 0)}</span></span>
            </div>
            <div className="flex items-center gap-1">
              <Droplets className="h-3.5 w-3.5" />
              <span>Liq: <span className="font-mono text-foreground">{formatVol(market.liquidity_num || 0)}</span></span>
            </div>
            {market.end_date_iso && (
              <div className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                <span>Ends: <span className="font-mono text-foreground">{new Date(market.end_date_iso).toLocaleDateString()}</span></span>
              </div>
            )}
            <a
              href={`https://polymarket.com/event/${market.market_slug || market.condition_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-primary hover:underline ml-auto"
            >
              <ExternalLink className="h-3 w-3" /> Polymarket
            </a>
          </div>
        </div>

        {/* Outcome selector */}
        <div className="flex gap-2 mb-6">
          {outcomes.map((outcome: string, i: number) => {
            const p = prices[i] ? parseFloat(prices[i]) : 0;
            const isYes = outcome === "Yes" || i === 0;
            return (
              <button
                key={i}
                onClick={() => setSelectedOutcome(i)}
                className={cn(
                  "flex-1 rounded-lg border p-4 transition-all",
                  selectedOutcome === i
                    ? isYes
                      ? "border-yes/40 bg-yes/5 glow-yes"
                      : "border-no/40 bg-no/5 glow-no"
                    : "border-border bg-card hover:border-primary/20"
                )}
              >
                <div className="flex items-center justify-between">
                  <span className={cn("text-sm font-semibold", isYes ? "text-yes" : "text-no")}>
                    {outcome}
                  </span>
                  <span className="font-mono text-2xl font-bold">{Math.round(p * 100)}¢</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Trading grid */}
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-1">
            <OrderbookView tokenId={currentTokenId} outcome={currentOutcome} />
          </div>
          <div className="lg:col-span-1">
            <OrderTicket
              tokenId={currentTokenId}
              outcome={currentOutcome}
              currentPrice={currentPrice}
            />
          </div>
          <div className="lg:col-span-1">
            {/* Second outcome orderbook */}
            {tokenIds.length > 1 && (
              <OrderbookView
                tokenId={tokenIds[selectedOutcome === 0 ? 1 : 0]}
                outcome={outcomes[selectedOutcome === 0 ? 1 : 0]}
              />
            )}
          </div>
        </div>

        {/* Disclaimer */}
        <div className="mt-8 rounded-lg border border-border bg-muted/50 p-3 text-center">
          <p className="text-[10px] text-muted-foreground">
            This is a third-party client for Polymarket. Not affiliated with Polymarket Inc. Trading involves risk. 
            Order execution depends on server-side credential configuration.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Trade;
