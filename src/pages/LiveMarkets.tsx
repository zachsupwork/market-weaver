import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useMarkets } from "@/hooks/useMarkets";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Activity, Loader2, TrendingUp, BarChart3, Search, AlertTriangle, ChevronDown, ChevronUp, ExternalLink, LayoutGrid, Layers } from "lucide-react";
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
import { isBytes32Hex, type NormalizedMarket, type MarketStatusLabel, fetchEvents } from "@/lib/polymarket-api";
import { normalizeMarkets } from "@/lib/normalizePolymarket";
import { QuickTradeModal } from "@/components/markets/QuickTradeModal";

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
  const slug = market.event_slug || market.market_slug || market.slug;
  if (slug) return `https://polymarket.com/event/${slug}`;
  return `https://polymarket.com/event/${market.condition_id}`;
}

type ViewMode = "markets" | "events";

const LiveMarkets = () => {
  const [viewMode, setViewMode] = useState<ViewMode>("markets");
  const [category, setCategory] = useState<CategoryId>("trending");
  const [sportsSubcat, setSportsSubcat] = useState<SportsSubId>("all-sports");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [showClosed, setShowClosed] = useState(false);
  const [showEnded, setShowEnded] = useState(false);
  const [allMarkets, setAllMarkets] = useState<NormalizedMarket[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const limit = 100;
  const prevDataRef = useRef<string>("");

  // Events view state
  const [eventsPage, setEventsPage] = useState(0);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(timer);
  }, [search]);

  // Reset accumulated markets when search changes
  useEffect(() => {
    setAllMarkets([]);
    setOffset(0);
    setHasMore(true);
    prevDataRef.current = "";
    setEventsPage(0);
  }, [debouncedSearch]);

  const { data: markets, isLoading, error, isFetching } = useMarkets({
    limit,
    offset,
    textQuery: debouncedSearch || undefined,
  });

  // Events query
  const { data: events, isLoading: eventsLoading, error: eventsError } = useQuery({
    queryKey: ["polymarket-events-live", eventsPage, debouncedSearch],
    queryFn: () => fetchEvents({
      active: true,
      closed: false,
      limit: 50,
      offset: eventsPage * 50,
      keyword: debouncedSearch || undefined,
    }),
    enabled: viewMode === "events",
    staleTime: 30_000,
  });

  // Append new data when markets change
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

    // Apply sports sub-filter
    if (category === "sports" && sportsSubcat !== "all-sports") {
      list = list.filter((m) => m._sportsSubcat === sportsSubcat);
    }

    if (category === "trending" || category !== "new") {
      list = sortByTrending(list);
    }

    const live = list.filter((m) => m.statusLabel === "LIVE");
    const ended = list.filter((m) => m.statusLabel === "ENDED");
    const other = list.filter((m) => m.statusLabel !== "LIVE" && m.statusLabel !== "ENDED");

    return { liveMarkets: live, endedMarkets: ended, otherMarkets: other };
  }, [allMarkets, category, sportsSubcat, search]);

  const renderMarketCard = (market: NormalizedMarket & { _inferredCategory?: CategoryId }, dimmed = false) => {
    const hasValidId = isBytes32Hex(market.condition_id);
    if (!market.condition_id) return null;

    const yesPrice = market.outcomePrices?.[0];
    const noPrice = market.outcomePrices?.[1];
    const isLive = hasValidId && market.statusLabel === "LIVE";
    const pmUrl = polymarketUrl(market);

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

        {/* Quick trade buttons for live markets */}
        {isLive && !dimmed ? (
          <>
            <div className="mb-2">
              <div className="flex justify-between text-xs mb-1">
                <span className="text-yes font-mono font-semibold">Yes {formatPrice(yesPrice)}</span>
                <span className="text-no font-mono font-semibold">No {formatPrice(noPrice)}</span>
              </div>
              <div className="h-2 rounded-full bg-no/20 overflow-hidden">
                <div className="h-full rounded-full bg-yes transition-all" style={{ width: `${yesPrice !== undefined ? Math.round(yesPrice * 100) : 50}%` }} />
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

  const renderEventCard = (event: any) => {
    const title = event.title || event.question || "Untitled Event";
    const rawMarkets = event.markets || [];
    const markets = normalizeMarkets(rawMarkets);
    const liveCount = markets.filter(m => m.statusLabel === "LIVE").length;
    const slug = event.slug || event.id || "";
    const pmUrl = slug ? `https://polymarket.com/event/${slug}` : null;

    return (
      <div key={event.id || slug} className="rounded-xl border border-border bg-card p-5 transition-all hover:border-primary/30">
        <Link
          to={`/events/${encodeURIComponent(event.id || slug)}`}
          className="block"
        >
          <div className="flex items-start gap-3 mb-3">
            {event.image && (
              <img src={event.image} alt="" className="h-10 w-10 rounded-lg bg-muted shrink-0" loading="lazy" />
            )}
            <div className="flex-1">
              <h3 className="text-sm font-semibold leading-snug text-foreground hover:text-primary transition-colors line-clamp-2">
                {title}
              </h3>
              {event.description && (
                <p className="text-xs text-muted-foreground line-clamp-1 mt-1">{event.description}</p>
              )}
            </div>
          </div>
        </Link>

        {/* Show child markets with prices */}
        {markets.length > 0 && (
          <div className="space-y-2 mb-3">
            {markets.slice(0, 5).map((m) => {
              const yesPrice = m.outcomePrices?.[0];
              const isLive = isBytes32Hex(m.condition_id) && m.statusLabel === "LIVE";
              return (
                <div key={m.condition_id || m.question} className="flex items-center justify-between gap-2 text-xs">
                  <Link
                    to={isLive ? `/trade/${encodeURIComponent(m.condition_id)}` : "#"}
                    onClick={(e) => { if (!isLive) e.preventDefault(); }}
                    className={cn("truncate flex-1", isLive ? "text-foreground hover:text-primary" : "text-muted-foreground")}
                  >
                    {m.question}
                  </Link>
                  <div className="flex items-center gap-2 shrink-0">
                    {isLive && (
                      <div className="flex gap-1">
                        <button
                          onClick={() => setTradeModal({ market: m, outcome: 0 })}
                          className="rounded bg-yes/10 border border-yes/20 px-2 py-0.5 text-[10px] font-semibold text-yes hover:bg-yes/20"
                        >
                          Yes {formatPrice(yesPrice)}
                        </button>
                        <button
                          onClick={() => setTradeModal({ market: m, outcome: 1 })}
                          className="rounded bg-no/10 border border-no/20 px-2 py-0.5 text-[10px] font-semibold text-no hover:bg-no/20"
                        >
                          No {formatPrice(m.outcomePrices?.[1])}
                        </button>
                      </div>
                    )}
                    {!isLive && yesPrice !== undefined && (
                      <span className="font-mono text-muted-foreground">{formatPrice(yesPrice)}</span>
                    )}
                  </div>
                </div>
              );
            })}
            {markets.length > 5 && (
              <Link
                to={`/events/${encodeURIComponent(event.id || slug)}`}
                className="text-[10px] text-primary hover:underline"
              >
                +{markets.length - 5} more markets →
              </Link>
            )}
          </div>
        )}

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>{markets.length} market{markets.length !== 1 ? "s" : ""}</span>
          {liveCount > 0 && (
            <span className="rounded-full bg-yes/10 border border-yes/20 px-2 py-0.5 text-[10px] font-mono text-yes">
              {liveCount} LIVE
            </span>
          )}
          {pmUrl && (
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
          )}
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
            Active, tradable prediction markets — sorted by volume.
          </p>
        </div>

        {/* View mode toggle + Search */}
        <div className="flex items-center gap-3 mb-4">
          <div className="flex rounded-lg border border-border overflow-hidden">
            <button
              onClick={() => setViewMode("markets")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-all",
                viewMode === "markets" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground"
              )}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              Markets
            </button>
            <button
              onClick={() => setViewMode("events")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-all",
                viewMode === "events" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground"
              )}
            >
              <Layers className="h-3.5 w-3.5" />
              Events
            </button>
          </div>

          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder={viewMode === "events" ? "Search events..." : "Search markets..."}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-border bg-card pl-10 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all"
            />
          </div>
        </div>

        {/* Category tabs (markets view only) */}
        {viewMode === "markets" && (
          <>
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
          </>
        )}

        {!isConnected && (
          <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 mb-6 text-sm text-muted-foreground">
            <span className="text-primary font-semibold">Connect your wallet</span> to trade on these markets.
          </div>
        )}

        {/* ── MARKETS VIEW ── */}
        {viewMode === "markets" && (
          <>
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

            {liveMarkets.length > 0 && (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {liveMarkets.map((market) => renderMarketCard(market))}
              </div>
            )}

            {!isLoading && liveMarkets.length === 0 && !error && (
              <div className="text-center py-16 text-muted-foreground">
                <p className="text-sm">No active markets found for this category.</p>
              </div>
            )}

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

            {hasMore && liveMarkets.length > 0 && (
              <div className="flex justify-center mt-8">
                <button
                  onClick={loadMore}
                  disabled={isFetching}
                  className="rounded-md border border-border px-6 py-2.5 text-sm font-medium hover:bg-accent transition-all disabled:opacity-50 flex items-center gap-2"
                >
                  {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Load More Markets
                </button>
              </div>
            )}
          </>
        )}

        {/* ── EVENTS VIEW ── */}
        {viewMode === "events" && (
          <>
            {eventsLoading && (
              <div className="flex justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            )}

            {eventsError && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
                <p className="text-sm text-destructive">Failed to load events: {(eventsError as Error).message}</p>
              </div>
            )}

            {events && events.length > 0 && (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {events.map((event: any) => renderEventCard(event))}
              </div>
            )}

            {!eventsLoading && events && events.length === 0 && !eventsError && (
              <div className="text-center py-16 text-muted-foreground">
                <p className="text-sm">No events found.</p>
              </div>
            )}

            {events && events.length >= 50 && (
              <div className="flex justify-center gap-3 mt-8">
                <button
                  onClick={() => setEventsPage(p => Math.max(0, p - 1))}
                  disabled={eventsPage === 0}
                  className="rounded-md border border-border px-4 py-2 text-sm disabled:opacity-30 hover:bg-accent transition-all"
                >
                  Previous
                </button>
                <span className="flex items-center text-sm text-muted-foreground">Page {eventsPage + 1}</span>
                <button
                  onClick={() => setEventsPage(p => p + 1)}
                  className="rounded-md border border-border px-4 py-2 text-sm hover:bg-accent transition-all"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}

        {/* Recent Trades via Bitquery */}
        <div className="mt-10">
          <RecentTradesPanel limit={30} />
        </div>
      </div>

      {/* Quick trade modal */}
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
