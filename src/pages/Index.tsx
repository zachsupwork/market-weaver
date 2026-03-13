import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useMarkets } from "@/hooks/useMarkets";
import { Link } from "react-router-dom";
import { Activity, Loader2, TrendingUp, BarChart3, Search, Trophy, Wallet, ChevronDown, ChevronUp, ExternalLink, Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { RecentTradesPanel } from "@/components/trades/RecentTradesPanel";
import {
  CATEGORIES,
  SPORTS_SUBCATEGORIES,
  type CategoryId,
  type SportsSubId,
  inferCategory,
  inferSportsSubcategory,
  sortByTrending,
} from "@/lib/market-categories";
import { isBytes32Hex, type NormalizedMarket, type MarketStatusLabel } from "@/lib/polymarket-api";
import { QuickTradeModal } from "@/components/markets/QuickTradeModal";
import { Progress } from "@/components/ui/progress";
import { MiniOrderbook } from "@/components/trading/MiniOrderbook";

function formatVol(n: number): string {
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function formatPrice(p: number | undefined): string {
  if (p === undefined || p === null || isNaN(p)) return "—";
  return `${Math.round(p * 100)}¢`;
}

function polymarketUrl(market: NormalizedMarket): string {
  const slug = market.event_slug || market.market_slug || market.slug;
  if (slug) return `https://polymarket.com/event/${slug}`;
  return `https://polymarket.com/event/${market.condition_id}`;
}

const Index = () => {
  const [category, setCategory] = useState<CategoryId>("trending");
  const [sportsSubcat, setSportsSubcat] = useState<SportsSubId>("all-sports");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [allMarkets, setAllMarkets] = useState<NormalizedMarket[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [showEnded, setShowEnded] = useState(false);
  const limit = 100;
  const prevDataRef = useRef<string>("");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setAllMarkets([]);
    setOffset(0);
    setHasMore(true);
    prevDataRef.current = "";
  }, [debouncedSearch]);

  const { data: markets, isLoading, error, isFetching } = useMarkets({
    limit,
    offset,
    textQuery: debouncedSearch || undefined,
  });

  const { isConnected } = useAccount();
  const [tradeModal, setTradeModal] = useState<{ market: NormalizedMarket; outcome: number } | null>(null);

  useEffect(() => {
    if (!markets || markets.length === 0) return;
    const dataKey = `${offset}-${markets.length}`;
    if (dataKey === prevDataRef.current) return;
    prevDataRef.current = dataKey;

    if (offset === 0) {
      setAllMarkets(markets as NormalizedMarket[]);
    } else {
      setAllMarkets(prev => {
        const existingIds = new Set(prev.map(m => m.condition_id));
        const newOnes = (markets as NormalizedMarket[]).filter(m => !existingIds.has(m.condition_id));
        return [...prev, ...newOnes];
      });
    }
    setHasMore((markets as NormalizedMarket[]).length >= limit);
  }, [markets, offset, limit]);

  const loadMore = useCallback(() => {
    if (!isFetching && hasMore) {
      setOffset(prev => prev + limit);
    }
  }, [isFetching, hasMore, limit]);

  const { liveMarkets, endedMarkets } = useMemo(() => {
    if (allMarkets.length === 0 && !markets) return { liveMarkets: [], endedMarkets: [] };

    let list = allMarkets as (NormalizedMarket & { _inferredCategory?: CategoryId; _sportsSubcat?: SportsSubId })[];
    list = list.map((m) => ({
      ...m,
      _inferredCategory: inferCategory({ category: m.category, tags: m.tags, question: m.question }),
      _sportsSubcat: inferSportsSubcategory({ tags: m.tags, question: m.question }),
    }));

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(m => m.question?.toLowerCase().includes(q) || m.description?.toLowerCase().includes(q));
    }

    if (category === "new") {
      list = [...list].sort((a, b) =>
        new Date(b.accepting_order_timestamp || b.end_date_iso || 0).getTime() -
        new Date(a.accepting_order_timestamp || a.end_date_iso || 0).getTime()
      );
    } else if (category !== "trending") {
      list = list.filter(m => m._inferredCategory === category);
    }

    if (category === "sports" && sportsSubcat !== "all-sports") {
      list = list.filter(m => m._sportsSubcat === sportsSubcat);
    }

    if (category === "trending" || category !== "new") {
      list = sortByTrending(list);
    }

    return {
      liveMarkets: list.filter(m => m.statusLabel === "LIVE"),
      endedMarkets: list.filter(m => m.statusLabel !== "LIVE"),
    };
  }, [allMarkets, category, sportsSubcat, search]);

  return (
    <div className="min-h-screen">
      <div className="container py-6">
        {/* Hero section */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold mb-1">
              Poly<span className="text-primary">View</span>
            </h1>
            <p className="text-sm text-muted-foreground">
              Browse & trade prediction markets. Powered by Polymarket.
            </p>
          </div>
          <div className="hidden sm:block">
            <ConnectButton />
          </div>
        </div>

        {/* Stats row */}
        {allMarkets.length > 0 && (
          <div className="flex flex-wrap gap-3 mb-6">
            <div className="rounded-lg border border-border bg-card px-3 py-2 flex items-center gap-2">
              <Activity className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs text-muted-foreground">Markets</span>
              <span className="font-mono text-sm font-bold">{allMarkets.length}</span>
            </div>
            <div className="rounded-lg border border-border bg-card px-3 py-2 flex items-center gap-2">
              <BarChart3 className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs text-muted-foreground">24h Vol</span>
              <span className="font-mono text-sm font-bold">
                {formatVol(allMarkets.reduce((s, m) => s + (m.volume24h || 0), 0))}
              </span>
            </div>
            <div className="rounded-lg border border-border bg-card px-3 py-2 flex items-center gap-2">
              <TrendingUp className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs text-muted-foreground">Liquidity</span>
              <span className="font-mono text-sm font-bold">
                {formatVol(allMarkets.reduce((s, m) => s + (m.liquidity || 0), 0))}
              </span>
            </div>
          </div>
        )}

        {/* Quick links */}
        <div className="grid gap-2 grid-cols-2 sm:grid-cols-4 mb-6">
          <Link to="/live" className="rounded-lg border border-border bg-card px-3 py-2.5 hover:border-primary/30 transition-all group flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            <span className="text-xs font-semibold group-hover:text-primary transition-colors">Live Markets</span>
          </Link>
          <Link to="/events" className="rounded-lg border border-border bg-card px-3 py-2.5 hover:border-primary/30 transition-all group flex items-center gap-2">
            <Layers className="h-4 w-4 text-primary" />
            <span className="text-xs font-semibold group-hover:text-primary transition-colors">Events</span>
          </Link>
          <Link to="/leaderboard" className="rounded-lg border border-border bg-card px-3 py-2.5 hover:border-primary/30 transition-all group flex items-center gap-2">
            <Trophy className="h-4 w-4 text-warning" />
            <span className="text-xs font-semibold group-hover:text-primary transition-colors">Leaderboard</span>
          </Link>
          <Link to="/portfolio" className="rounded-lg border border-border bg-card px-3 py-2.5 hover:border-primary/30 transition-all group flex items-center gap-2">
            <Wallet className="h-4 w-4 text-yes" />
            <span className="text-xs font-semibold group-hover:text-primary transition-colors">Portfolio</span>
          </Link>
        </div>

        {/* Search */}
        <div className="relative mb-4 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search markets..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-border bg-card pl-10 pr-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all"
          />
        </div>

        {/* Category tabs */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => { setCategory(cat.id); setSportsSubcat("all-sports"); setOffset(0); setAllMarkets([]); setHasMore(true); prevDataRef.current = ""; }}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition-all",
                category === cat.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground hover:bg-accent"
              )}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {category === "sports" && (
          <div className="flex flex-wrap gap-1 mb-4">
            {SPORTS_SUBCATEGORIES.map((sub) => (
              <button
                key={sub.id}
                onClick={() => setSportsSubcat(sub.id)}
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-all border",
                  sportsSubcat === sub.id
                    ? "bg-primary/20 border-primary/40 text-primary"
                    : "bg-card border-border text-muted-foreground hover:border-primary/30"
                )}
              >
                {sub.label}
              </button>
            ))}
          </div>
        )}

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

        {/* Market cards grid */}
        {liveMarkets.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {liveMarkets.map((market) => {
              if (!market.condition_id || !isBytes32Hex(market.condition_id)) return null;
              const yesPrice = market.outcomePrices?.[0];
              const noPrice = market.outcomePrices?.[1];
              const yesPct = yesPrice !== undefined ? Math.round(yesPrice * 100) : 50;

              return (
                <div
                  key={market.condition_id}
                  className="group rounded-xl border border-border bg-card p-4 transition-all hover:border-primary/30 hover:glow-primary"
                >
                  <Link to={`/trade/${encodeURIComponent(market.condition_id)}`} className="block">
                    <div className="flex items-start gap-2.5 mb-3">
                      {market.icon && (
                        <img src={market.icon} alt="" className="h-8 w-8 rounded-full bg-muted shrink-0" loading="lazy" />
                      )}
                      <h3 className="text-sm font-semibold leading-snug text-foreground group-hover:text-primary transition-colors line-clamp-2 flex-1">
                        {market.question}
                      </h3>
                    </div>
                  </Link>

                  {/* Progress bar */}
                  <div className="mb-3">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-yes font-mono font-semibold">Yes {formatPrice(yesPrice)}</span>
                      <span className="text-no font-mono font-semibold">No {formatPrice(noPrice)}</span>
                    </div>
                    <div className="h-2 rounded-full bg-no/20 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-yes transition-all"
                        style={{ width: `${yesPct}%` }}
                      />
                    </div>
                  </div>

                  {/* Trade buttons */}
                  <div className="flex gap-2 mb-3">
                    <button
                      onClick={(e) => { e.preventDefault(); setTradeModal({ market, outcome: 0 }); }}
                      className="flex-1 rounded-lg bg-yes/10 border border-yes/20 py-1.5 text-xs font-semibold text-yes hover:bg-yes/20 transition-all"
                    >
                      Buy Yes
                    </button>
                    <button
                      onClick={(e) => { e.preventDefault(); setTradeModal({ market, outcome: 1 }); }}
                      className="flex-1 rounded-lg bg-no/10 border border-no/20 py-1.5 text-xs font-semibold text-no hover:bg-no/20 transition-all"
                    >
                      Buy No
                    </button>
                  </div>

                  {/* Mini live orderbook */}
                  <MiniOrderbook
                    tokenId={market.tokens?.[0]?.token_id}
                    className="mb-2 rounded border border-border bg-background/50 p-1"
                  />

                  <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                    <span>{formatVol(market.volume24h)} vol</span>
                    <span>{formatVol(market.liquidity)} liq</span>
                    <a
                      href={polymarketUrl(market)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="ml-auto text-muted-foreground hover:text-primary transition-colors"
                      title="View on Polymarket"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </a>
                    <span className="rounded-full bg-yes/10 border border-yes/20 px-1.5 py-0.5 text-[9px] font-mono text-yes">
                      LIVE
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {endedMarkets.length > 0 && (
          <div className="mt-6">
            <button
              onClick={() => setShowEnded(!showEnded)}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-3"
            >
              {showEnded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              Ended / Other ({endedMarkets.length})
            </button>
            {showEnded && (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {endedMarkets.map((market) => {
                  if (!market.condition_id) return null;
                  const yesPrice = market.outcomePrices?.[0];
                  const noPrice = market.outcomePrices?.[1];
                  return (
                    <div key={market.condition_id} className="rounded-xl border border-border bg-card p-4 opacity-50">
                      <h3 className="text-sm font-semibold leading-snug line-clamp-2 mb-2">{market.question}</h3>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="font-mono">Yes {formatPrice(yesPrice)}</span>
                        <span className="font-mono">No {formatPrice(noPrice)}</span>
                        <span className="ml-auto rounded-full bg-muted border border-border px-1.5 py-0.5 text-[9px] font-mono">
                          {market.statusLabel}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {!isLoading && liveMarkets.length === 0 && !error && (
          <div className="text-center py-16 text-muted-foreground">
            <p className="text-sm">No active markets found.</p>
          </div>
        )}

        {hasMore && liveMarkets.length > 0 && (
          <div className="flex justify-center mt-6">
            <button
              onClick={loadMore}
              disabled={isFetching}
              className="rounded-md border border-border px-6 py-2 text-sm font-medium hover:bg-accent transition-all disabled:opacity-50 flex items-center gap-2"
            >
              {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Load More
            </button>
          </div>
        )}

        <div className="mt-8">
          <RecentTradesPanel limit={20} />
        </div>
      </div>

      {tradeModal && (
        <QuickTradeModal
          market={tradeModal.market}
          initialOutcome={tradeModal.outcome}
          onClose={() => setTradeModal(null)}
        />
      )}
    </div>
  );
};

export default Index;
