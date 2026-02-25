import { useState } from "react";
import { useMarkets } from "@/hooks/useMarkets";
import { Link } from "react-router-dom";
import { Activity, Loader2, TrendingUp, BarChart3, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

function formatVol(n: number): string {
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

const LiveMarkets = () => {
  const [page, setPage] = useState(0);
  const limit = 24;
  const { data: markets, isLoading, error } = useMarkets({ limit, offset: page * limit });

  return (
    <div className="min-h-screen">
      <div className="container py-8">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Activity className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold">Live Markets</h1>
            <span className="rounded-full bg-yes/10 border border-yes/20 px-2 py-0.5 text-[10px] font-mono text-yes">
              LIVE
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            Real-time prediction markets from Polymarket — click to view orderbook and trade.
          </p>
        </div>

        {isLoading && (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
            <p className="text-sm text-destructive">Failed to load markets: {(error as Error).message}</p>
          </div>
        )}

        {markets && (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {markets.map((market) => {
                const prices = market.outcome_prices ? JSON.parse(market.outcome_prices) : [];
                const outcomes = market.outcomes ? JSON.parse(market.outcomes) : [];
                const yesPrice = prices[0] ? parseFloat(prices[0]) : null;
                const noPrice = prices[1] ? parseFloat(prices[1]) : null;
                const slug = market.market_slug || market.condition_id;

                return (
                  <Link
                    key={market.condition_id}
                    to={`/trade/${encodeURIComponent(market.condition_id)}`}
                    className="group block rounded-xl border border-border bg-card p-5 transition-all hover:border-primary/30 hover:glow-primary animate-slide-in"
                  >
                    <div className="flex items-start gap-3 mb-3">
                      {market.icon && (
                        <img
                          src={market.icon}
                          alt=""
                          className="h-8 w-8 rounded-full bg-muted shrink-0"
                          loading="lazy"
                        />
                      )}
                      <h3 className="text-sm font-semibold leading-snug text-foreground group-hover:text-primary transition-colors line-clamp-2 flex-1">
                        {market.question}
                      </h3>
                    </div>

                    <div className="flex items-center gap-4 mb-4">
                      {yesPrice !== null && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">Yes</span>
                          <span className="font-mono text-lg font-bold text-yes">
                            {Math.round(yesPrice * 100)}¢
                          </span>
                        </div>
                      )}
                      {yesPrice !== null && noPrice !== null && (
                        <div className="h-6 w-px bg-border" />
                      )}
                      {noPrice !== null && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">No</span>
                          <span className="font-mono text-lg font-bold text-no">
                            {Math.round(noPrice * 100)}¢
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <BarChart3 className="h-3 w-3" />
                        <span>{formatVol(market.volume_num || 0)}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <TrendingUp className="h-3 w-3" />
                        <span>{formatVol(market.liquidity_num || 0)} liq</span>
                      </div>
                      {!market.accepting_orders && (
                        <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                          Paused
                        </span>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>

            <div className="flex justify-center gap-3 mt-8">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="rounded-md border border-border px-4 py-2 text-sm disabled:opacity-30 hover:bg-accent transition-all"
              >
                Previous
              </button>
              <span className="flex items-center text-sm text-muted-foreground">
                Page {page + 1}
              </span>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={!markets.length || markets.length < limit}
                className="rounded-md border border-border px-4 py-2 text-sm disabled:opacity-30 hover:bg-accent transition-all"
              >
                Next
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default LiveMarkets;
