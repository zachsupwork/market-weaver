import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useMarkets } from "@/hooks/useMarkets";
import { useFeaturedEvents, type FeaturedEvent } from "@/hooks/useFeaturedEvents";
import { Link } from "react-router-dom";
import { Activity, Loader2, TrendingUp, BarChart3, Search, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAccount } from "wagmi";
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
import { MiniOrderbook } from "@/components/trading/MiniOrderbook";
import { EventGridCard } from "@/components/markets/EventGridCard";
import { useLiveDataFeeds } from "@/hooks/useLiveDataFeeds";
import { SportScoreBadge } from "@/components/markets/SportScoreBadge";
import { CryptoPriceBadge } from "@/components/markets/CryptoPriceBadge";
import { extractCryptoSymbol, extractSportsSlug } from "@/lib/live-data-utils";

function formatVol(n: number): string {
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function formatPrice(p: number | undefined): string {
  if (p === undefined || p === null || isNaN(p)) return "—";
  const cents = Math.round(p * 100);
  return `${cents}¢`;
}

function StatusBadge({ status }: { status: MarketStatusLabel }) {
  if (status === "LIVE") {
    return (
      <span className="rounded-full bg-yes/10 border border-yes/20 px-2 py-0.5 text-[10px] font-mono text-yes">
        LIVE
      </span>
    );
  }
  if (status === "ENDED") {
    return (
      <span className="rounded-full bg-warning/10 border border-warning/20 px-2 py-0.5 text-[10px] font-mono text-warning">
        ENDED
      </span>
    );
  }
  const colors: Record<string, string> = {
    CLOSED: "bg-muted border-border text-muted-foreground",
    ARCHIVED: "bg-muted border-border text-muted-foreground",
    UNAVAILABLE: "bg-destructive/10 border-destructive/20 text-destructive",
  };
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-mono border", colors[status] || colors.UNAVAILABLE)}>
      {status}
    </span>
  );
}

function polymarketUrl(market: NormalizedMarket): string {
  if (market.event_slug) return `https://polymarket.com/event/${market.event_slug}`;
  const marketSlug = market.market_slug || market.slug;
  if (marketSlug) return `https://polymarket.com/market/${marketSlug}`;
  return `https://polymarket.com`;
}

type GridItem =
  | { type: "market"; data: NormalizedMarket; volume: number }
  | { type: "event"; data: FeaturedEvent; volume: number };

const LiveMarkets = () => {
  useLiveDataFeeds();

  const [category, setCategory] = useState<CategoryId>("trending");
  const [sportsSubcat, setSportsSubcat] = useState<SportsSubId>("all-sports");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [allMarkets, setAllMarkets] = useState<NormalizedMarket[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [showEnded, setShowEnded] = useState(false);
  const [showClosed, setShowClosed] = useState(false);
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

  // Always fetch events (blended with markets)
  const { data: events } = useFeaturedEvents(30);

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

  const { isConnected } = useAccount();
  const [tradeModal, setTradeModal] = useState<{ market: NormalizedMarket; outcome: number } | null>(null);

  const resetFilters = () => {
    setOffset(0);
    setAllMarkets([]);
    setHasMore(true);
    prevDataRef.current = "";
  };

  // Filter events by category
  const filteredEvents = useMemo(() => {
    if (!events) return [];
    if (category === "trending" || category === "new" || category === "breaking") return events;

    return events.filter((e) => {
      const texts = [e.title, ...e.markets.map(m => m.question || "")].join(" ");
      const tags = e.markets.flatMap(m => m.tags || []);
      const inferred = inferCategory({ question: texts, tags });
      return inferred === category;
    });
  }, [events, category]);

  const { liveMarkets, endedMarkets, otherMarkets } = useMemo(() => {
    if (allMarkets.length === 0 && !markets) return { liveMarkets: [], endedMarkets: [], otherMarkets: [] };

    let list = allMarkets as (NormalizedMarket & { _inferredCategory?: CategoryId; _sportsSubcat?: SportsSubId })[];

    list = list.map((m) => ({
      ...m,
      _inferredCategory: inferCategory({
        category: m.category,
        tags: m.tags,
        question: m.question,
      }),
      _sportsSubcat: inferSportsSubcategory({
        tags: m.tags,
        question: m.question,
      }),
    }));

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (m) =>
          m.question?.toLowerCase().includes(q) ||
          m.description?.toLowerCase().includes(q)
      );
    }

    if (category === "new") {
      list = [...list].sort(
        (a, b) =>
          new Date(b.accepting_order_timestamp || b.end_date_iso || 0).getTime() -
          new Date(a.accepting_order_timestamp || a.end_date_iso || 0).getTime()
      );
    } else if (category !== "trending") {
      list = list.filter((m) => m._inferredCategory === category);
    }

    if (category === "sports" && sportsSubcat !== "all-sports") {
      list = list.filter((m) => m._sportsSubcat === sportsSubcat);
    }

    if (category === "trending" || category !== "new") {
      list = sortByTrending(list);
    }

    const live = list.filter((m) => m.statusLabel === "LIVE" || (m.statusLabel === "UNAVAILABLE" && isBytes32Hex(m.condition_id)));
    const ended = list.filter((m) => m.statusLabel === "ENDED");
    const other = list.filter((m) => m.statusLabel !== "LIVE" && m.statusLabel !== "ENDED" && m.statusLabel !== "UNAVAILABLE");

    return { liveMarkets: live, endedMarkets: ended, otherMarkets: other };
  }, [allMarkets, category, sportsSubcat, search]);

  // Merge markets + events into a single sorted list
  const combinedGrid = useMemo((): GridItem[] => {
    const items: GridItem[] = [];

    for (const m of liveMarkets) {
      if (!m.condition_id || !isBytes32Hex(m.condition_id)) continue;
      items.push({ type: "market", data: m, volume: m.volume24h || 0 });
    }

    const marketConditionIds = new Set(liveMarkets.map(m => m.condition_id));
    for (const e of filteredEvents) {
      const hasUniqueChildren = e.markets.some(m => !marketConditionIds.has(m.condition_id));
      if (hasUniqueChildren || e.markets.length >= 3) {
        items.push({ type: "event", data: e, volume: e.volume });
      }
    }

    items.sort((a, b) => b.volume - a.volume);
    return items;
  }, [liveMarkets, filteredEvents]);

  const renderMarketCard = (market: NormalizedMarket, dimmed = false) => {
    const hasValidId = isBytes32Hex(market.condition_id);
    if (!market.condition_id) return null;

    const yesPrice = market.outcomePrices?.[0];
    const noPrice = market.outcomePrices?.[1];
    const isLive = hasValidId && market.statusLabel === "LIVE";
    const pmUrl = polymarketUrl(market);
    const yesPct = yesPrice !== undefined ? Math.round(yesPrice * 100) : 50;

    return (
      <div key={market.id || market.condition_id || market.question} className={cn(
        "group rounded-xl border border-border bg-card p-5 transition-all",
        dimmed ? "opacity-60 cursor-not-allowed" : "hover:border-primary/30 hover:glow-primary"
      )}>
        <Link
          to={isLive ? `/trade/${encodeURIComponent(market.condition_id)}` : "#"}
          className="block"
          onClick={(e) => { if (!isLive) e.preventDefault(); }}
        >
          <div className="flex items-start gap-3 mb-3">
            {market.icon && (
              <img src={market.icon} alt="" className="h-8 w-8 rounded-full bg-muted shrink-0" loading="lazy" />
            )}
            <h3 className="text-sm font-semibold leading-snug text-foreground group-hover:text-primary transition-colors line-clamp-2 flex-1">
              {market.question}
            </h3>
          </div>
        </Link>

        {/* Live sports score or crypto price badge */}
        {(() => {
          const sportsSlug = extractSportsSlug(market.tags, market.event_slug);
          const cryptoSym = extractCryptoSymbol(market.question, market.tags);
          if (sportsSlug) return <div className="mb-2"><SportScoreBadge sportsSlug={sportsSlug} tags={market.tags} /></div>;
          if (cryptoSym) return <div className="mb-2"><CryptoPriceBadge symbol={cryptoSym} /></div>;
          return null;
        })()}

        {isLive && !dimmed ? (
          <>
            <div className="mb-2">
              <div className="flex justify-between text-xs mb-1">
                <span className="text-yes font-mono font-semibold">Yes {formatPrice(yesPrice)}</span>
                <span className="text-no font-mono font-semibold">No {formatPrice(noPrice)}</span>
              </div>
              <div className="h-2 rounded-full bg-no/20 overflow-hidden">
                <div className="h-full rounded-full bg-yes transition-all" style={{ width: `${yesPct}%` }} />
              </div>
            </div>
            <div className="flex gap-2 mb-3">
              <button
                onClick={() => setTradeModal({ market, outcome: 0 })}
                className="flex-1 rounded-lg bg-yes/10 border border-yes/20 py-1.5 text-xs font-semibold text-yes hover:bg-yes/20 transition-all"
              >
                Buy Yes
              </button>
              <button
                onClick={() => setTradeModal({ market, outcome: 1 })}
                className="flex-1 rounded-lg bg-no/10 border border-no/20 py-1.5 text-xs font-semibold text-no hover:bg-no/20 transition-all"
              >
                Buy No
              </button>
            </div>
          </>
        ) : (
          <div className="flex items-center gap-4 mb-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Yes</span>
              <span className="font-mono text-lg font-bold text-yes">{formatPrice(yesPrice)}</span>
            </div>
            <div className="h-6 w-px bg-border" />
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">No</span>
              <span className="font-mono text-lg font-bold text-no">{formatPrice(noPrice)}</span>
            </div>
          </div>
        )}

        {isLive && !dimmed && (
          <MiniOrderbook
            tokenId={market.clobTokenIds?.[0] || market.tokens?.[0]?.token_id}
            className="mb-3 rounded border border-border bg-background/60 p-1"
            wsEnabled
          />
        )}

        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <BarChart3 className="h-3 w-3" />
            <span>{formatVol(market.volume24h)}</span>
          </div>
          <div className="flex items-center gap-1">
            <TrendingUp className="h-3 w-3" />
            <span>{formatVol(market.liquidity)} liq</span>
          </div>
          <a
            href={pmUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="ml-auto flex items-center gap-1 text-muted-foreground hover:text-primary transition-colors"
            title="View on Polymarket"
          >
            <ExternalLink className="h-3 w-3" />
          </a>
          <StatusBadge status={market.statusLabel} />
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen">
      <div className="container py-8">
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <Activity className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold">Live Markets</h1>
            <span className="rounded-full bg-yes/10 border border-yes/20 px-2 py-0.5 text-[10px] font-mono text-yes animate-pulse-yes">
              LIVE
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            Active, tradable prediction markets & events — sorted by volume.
          </p>
        </div>

        {/* Search */}
        <div className="relative mb-4 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search markets & events..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-border bg-card pl-10 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all"
          />
        </div>

        {/* Category tabs */}
        <div className="flex flex-wrap gap-2 mb-3">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => { setCategory(cat.id); setSportsSubcat("all-sports"); resetFilters(); }}
              className={cn(
                "rounded-full px-4 py-1.5 text-xs font-medium transition-all",
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
          <div className="flex flex-wrap gap-1.5 mb-4 pl-1">
            {SPORTS_SUBCATEGORIES.map((sub) => (
              <button
                key={sub.id}
                onClick={() => setSportsSubcat(sub.id)}
                className={cn(
                  "rounded-full px-3 py-1 text-[11px] font-medium transition-all border",
                  sportsSubcat === sub.id
                    ? "bg-primary/20 border-primary/40 text-primary"
                    : "bg-card border-border text-muted-foreground hover:border-primary/30 hover:text-foreground"
                )}
              >
                {sub.label}
              </button>
            ))}
          </div>
        )}

        {!isConnected && (
          <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 mb-6 text-sm text-muted-foreground">
            <span className="text-primary font-semibold">Connect your wallet</span> to trade on these markets.
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

        {/* Combined grid: markets + events */}
        {combinedGrid.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {combinedGrid.map((item) => {
              if (item.type === "event") {
                return <EventGridCard key={`evt-${item.data.slug}`} event={item.data} />;
              }
              return renderMarketCard(item.data);
            })}
          </div>
        )}

        {!isLoading && combinedGrid.length === 0 && !error && (
          <div className="text-center py-16 text-muted-foreground">
            <p className="text-sm">No active markets or events found for this category.</p>
            <p className="text-xs mt-1">Try selecting "Trending" or broadening your search.</p>
          </div>
        )}

        {/* Ended markets */}
        {endedMarkets.length > 0 && (
          <div className="mt-8">
            <button
              onClick={() => setShowEnded(!showEnded)}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
            >
              {showEnded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              Ended / Resolved ({endedMarkets.length})
            </button>
            {showEnded && (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {endedMarkets.map((market) => renderMarketCard(market, true))}
              </div>
            )}
          </div>
        )}

        {/* Other / closed markets */}
        {otherMarkets.length > 0 && (
          <div className="mt-8">
            <button
              onClick={() => setShowClosed(!showClosed)}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
            >
              {showClosed ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              Closed / Unavailable ({otherMarkets.length})
            </button>
            {showClosed && (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {otherMarkets.map((market) => renderMarketCard(market, true))}
              </div>
            )}
          </div>
        )}

        {/* Load more */}
        {hasMore && combinedGrid.length > 0 && (
          <div className="flex justify-center mt-8">
            <button
              onClick={loadMore}
              disabled={isFetching}
              className="rounded-md border border-border px-6 py-2.5 text-sm font-medium hover:bg-accent transition-all disabled:opacity-50 flex items-center gap-2"
            >
              {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Load More
            </button>
          </div>
        )}

        {/* Global recent trades */}
        <div className="mt-10">
          <RecentTradesPanel limit={30} pollMs={1_000} />
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

export default LiveMarkets;
