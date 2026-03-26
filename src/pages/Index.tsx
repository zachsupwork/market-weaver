import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useMarkets } from "@/hooks/useMarkets";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useFeaturedEvents, type FeaturedEvent } from "@/hooks/useFeaturedEvents";
import { Link } from "react-router-dom";
import {
  Activity, Loader2, TrendingUp, BarChart3, Search,
  Trophy, Wallet, ChevronDown, ChevronUp, ExternalLink,
  Layers, Flame, Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { RecentTradesPanel } from "@/components/trades/RecentTradesPanel";
import {
  CATEGORIES, SPORTS_SUBCATEGORIES, CRYPTO_SUBCATEGORIES,
  type CategoryId, type SportsSubId, type CryptoSubId,
  inferCategory, inferSportsSubcategory, inferCryptoSubcategory, sortByTrending,
} from "@/lib/market-categories";
import { isBytes32Hex, type NormalizedMarket } from "@/lib/polymarket-api";
import { QuickTradeModal } from "@/components/markets/QuickTradeModal";
import { MiniOrderbook } from "@/components/trading/MiniOrderbook";
import { EventGridCard } from "@/components/markets/EventGridCard";
import { orderbookWsService } from "@/services/orderbook-ws.service";
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
  return `${Math.round(p * 100)}¢`;
}

function polymarketUrl(market: NormalizedMarket): string {
  if (market.event_slug) return `https://polymarket.com/event/${market.event_slug}`;
  const marketSlug = market.market_slug || market.slug;
  if (marketSlug) return `https://polymarket.com/market/${marketSlug}`;
  return `https://polymarket.com`;
}

type SortOption = "volume" | "newest" | "ending" | "az";

type GridItem =
  | { type: "market"; data: NormalizedMarket; volume: number; endDate: string }
  | { type: "event"; data: FeaturedEvent; volume: number; endDate: string };

const Index = () => {
  useLiveDataFeeds();

  const [category, setCategory] = useState<CategoryId>("trending");
  const [sportsSubcat, setSportsSubcat] = useState<SportsSubId>("all-sports");
  const [cryptoSubcat, setCryptoSubcat] = useState<CryptoSubId>("all-crypto");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [allMarkets, setAllMarkets] = useState<NormalizedMarket[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [showEnded, setShowEnded] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>("volume");
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
  }, [debouncedSearch, category]);

  // Map UI category to Gamma API tag for server-side filtering
  const apiTag = useMemo(() => {
    const TAG_MAP: Record<string, string> = {
      crypto: "Crypto",
      politics: "Politics",
      sports: "Sports",
      finance: "Finance",
      tech: "Technology",
      science: "Science",
      weather: "Weather",
      culture: "Culture",
    };
    return TAG_MAP[category] ?? undefined;
  }, [category]);

  const { data: markets, isLoading, error, isFetching } = useMarkets({
    limit,
    offset,
    tag: apiTag,
    textQuery: debouncedSearch || undefined,
  });

  const { data: events } = useFeaturedEvents(20, apiTag);
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

  useEffect(() => {
    if (!events || events.length === 0) return;
    const tokenIds = new Set<string>();
    events.forEach((e) =>
      e.markets.forEach((m) => {
        if (m.clobTokenIds?.[0]) tokenIds.add(m.clobTokenIds[0]);
      })
    );
    const unsubs = [...tokenIds].map((id) =>
      orderbookWsService.subscribe(id, () => {})
    );
    return () => unsubs.forEach((u) => u());
  }, [events]);

  const loadMore = useCallback(() => {
    if (!isFetching && hasMore) setOffset(prev => prev + limit);
  }, [isFetching, hasMore, limit]);

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

  const { liveMarkets, endedMarkets } = useMemo(() => {
    if (allMarkets.length === 0 && !markets) return { liveMarkets: [], endedMarkets: [] };
    let list = allMarkets as (NormalizedMarket & { _inferredCategory?: CategoryId; _sportsSubcat?: SportsSubId; _cryptoSubcat?: CryptoSubId })[];
    list = list.map((m) => ({
      ...m,
      _inferredCategory: inferCategory({ category: m.category, tags: m.tags, question: m.question }),
      _sportsSubcat: inferSportsSubcategory({ tags: m.tags, question: m.question }),
      _cryptoSubcat: inferCryptoSubcategory({ tags: m.tags, question: m.question }),
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
    if (category === "crypto" && cryptoSubcat !== "all-crypto") {
      // Use direct text matching for better accuracy with time/type filters
      list = list.filter(m => {
        const text = [...(m.tags || []), m.question || ""].join(" ").toLowerCase();
        // Check if market matches any keyword for the selected subcategory
        const keywords: Record<string, string[]> = {
          "up-down": ["up or down", "up/down"],
          "above-below": ["above", "below"],
          "price-range": ["price range", "price on", "what price"],
          "hit-price": ["hit price", "hit $", "will hit"],
          "5min": ["5 minute", "5-minute", "5 min"],
          "15min": ["15 minute", "15-minute", "15 min"],
          "1hour": ["1 hour", "hourly", "1-hour"],
          "4hours": ["4 hour", "4-hour"],
          daily: ["daily", "one day", "1 day", "24 hour"],
          weekly: ["weekly", "week", "march 23-29", "march 23–29"],
          monthly: ["monthly", "in march", "in april"],
          yearly: ["yearly", "in 2026", "in 2027", "this year"],
          bitcoin: ["bitcoin", "btc"],
          ethereum: ["ethereum", "eth"],
          solana: ["solana", "sol"],
          xrp: ["xrp", "ripple"],
          dogecoin: ["dogecoin", "doge"],
          bnb: ["bnb", "binance coin"],
          altcoins: ["cardano", "polkadot", "avalanche", "chainlink"],
        };
        const kws = keywords[cryptoSubcat] || [];
        return kws.some(kw => text.includes(kw));
      });
    }
    if (category === "trending" || category !== "new") {
      list = sortByTrending(list);
    }
    const tradable = list.filter(m => m.statusLabel === "LIVE" || (m.statusLabel === "UNAVAILABLE" && isBytes32Hex(m.condition_id)));
    const ended = list.filter(m => m.statusLabel === "ENDED" || m.statusLabel === "CLOSED" || m.statusLabel === "ARCHIVED");
    return { liveMarkets: tradable, endedMarkets: ended };
  }, [allMarkets, category, sportsSubcat, cryptoSubcat, search]);

  const combinedGrid = useMemo((): GridItem[] => {
    const items: GridItem[] = [];
    for (const m of liveMarkets) {
      if (!m.condition_id || !isBytes32Hex(m.condition_id)) continue;
      items.push({ type: "market", data: m, volume: m.volume24h || 0, endDate: m.end_date_iso || "" });
    }
    const marketConditionIds = new Set(liveMarkets.map(m => m.condition_id));
    for (const e of filteredEvents) {
      const hasUniqueChildren = e.markets.some(m => !marketConditionIds.has(m.condition_id));
      if (hasUniqueChildren || e.markets.length >= 3) {
        items.push({ type: "event", data: e, volume: e.volume, endDate: e.endDate || "" });
      }
    }

    // Sort based on selected option
    const getTitle = (item: GridItem) =>
      item.type === "market" ? (item.data.question || "") : (item.data.title || "");

    switch (sortBy) {
      case "newest":
        items.sort((a, b) => {
          const aDate = a.type === "market"
            ? (a.data.accepting_order_timestamp || a.data.end_date_iso || "")
            : (a.data.endDate || "");
          const bDate = b.type === "market"
            ? (b.data.accepting_order_timestamp || b.data.end_date_iso || "")
            : (b.data.endDate || "");
          return new Date(bDate).getTime() - new Date(aDate).getTime();
        });
        break;
      case "ending":
        items.sort((a, b) => {
          const aEnd = a.endDate ? new Date(a.endDate).getTime() : Infinity;
          const bEnd = b.endDate ? new Date(b.endDate).getTime() : Infinity;
          return aEnd - bEnd;
        });
        break;
      case "az":
        items.sort((a, b) => getTitle(a).localeCompare(getTitle(b)));
        break;
      default: // volume
        items.sort((a, b) => b.volume - a.volume);
    }

    return items;
  }, [liveMarkets, filteredEvents, sortBy]);

  // Live global stats from edge function
  const { data: globalStats } = useQuery({
    queryKey: ["polymarket-global-stats"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("polymarket-global-stats");
      if (error) throw error;
      return data as { marketCount: number; totalVolume24h: number; totalLiquidity: number };
    },
    staleTime: 30_000,
    refetchInterval: 45_000,
  });

  const totalVol = globalStats?.totalVolume24h ?? allMarkets.reduce((s, m) => s + (m.volume24h || 0), 0);
  const totalLiq = globalStats?.totalLiquidity ?? allMarkets.reduce((s, m) => s + (m.liquidity || 0), 0);
  const marketCount = globalStats?.marketCount ?? allMarkets.length;

  return (
    <div className="min-h-screen">
      <div className="container py-6 max-w-7xl">
        {/* Hero */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight mb-1">
              Poly<span className="text-primary">View</span>
            </h1>
            <p className="text-sm text-muted-foreground">
              Browse & trade prediction markets · Powered by Polymarket
            </p>
          </div>
          <div className="hidden sm:block">
            <ConnectButton />
          </div>
        </div>

        {/* Stats cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          <div className="rounded-xl border border-border bg-card p-4 flex flex-col">
            <div className="flex items-center gap-2 mb-1">
              <Activity className="h-4 w-4 text-primary" />
              <span className="text-xs text-muted-foreground font-medium">Markets</span>
            </div>
            <span className="font-mono text-2xl font-extrabold text-foreground">{marketCount.toLocaleString()}</span>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 flex flex-col">
            <div className="flex items-center gap-2 mb-1">
              <BarChart3 className="h-4 w-4 text-yes" />
              <span className="text-xs text-muted-foreground font-medium">24h Volume</span>
            </div>
            <span className="font-mono text-2xl font-extrabold text-yes">{formatVol(totalVol)}</span>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 flex flex-col">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="h-4 w-4 text-primary" />
              <span className="text-xs text-muted-foreground font-medium">Liquidity</span>
            </div>
            <span className="font-mono text-2xl font-extrabold text-foreground">{formatVol(totalLiq)}</span>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 flex flex-col">
            <div className="flex items-center gap-2 mb-1">
              <Flame className="h-4 w-4 text-warning" />
              <span className="text-xs text-muted-foreground font-medium">Events</span>
            </div>
            <span className="font-mono text-2xl font-extrabold text-foreground">{filteredEvents.length}</span>
          </div>
        </div>

        {/* Quick links */}
        <div className="grid gap-2 grid-cols-2 sm:grid-cols-4 mb-8">
          {[
            { to: "/live", icon: <Zap className="h-4 w-4" />, label: "Live Markets", color: "text-yes" },
            { to: "/events", icon: <Layers className="h-4 w-4" />, label: "Events", color: "text-primary" },
            { to: "/leaderboard", icon: <Trophy className="h-4 w-4" />, label: "Leaderboard", color: "text-warning" },
            { to: "/portfolio", icon: <Wallet className="h-4 w-4" />, label: "Portfolio", color: "text-primary" },
          ].map(({ to, icon, label, color }) => (
            <Link
              key={to}
              to={to}
              className="rounded-xl border border-border bg-card px-4 py-3 hover:border-primary/30 hover:glow-primary transition-all group flex items-center gap-3"
            >
              <span className={color}>{icon}</span>
              <span className="text-sm font-semibold group-hover:text-primary transition-colors">{label}</span>
            </Link>
          ))}
        </div>

        {/* Search + Sort */}
        <div className="flex flex-col sm:flex-row gap-3 mb-5">
          <div className="relative flex-1 max-w-lg">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search markets… e.g. 'bitcoin march 27' or 'above 80000'"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-border bg-card pl-10 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all"
            />
          </div>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="rounded-xl border border-border bg-card px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all"
          >
            <option value="volume">Sort: Volume ↓</option>
            <option value="newest">Sort: Newest First</option>
            <option value="ending">Sort: Ending Soon</option>
            <option value="az">Sort: A → Z</option>
          </select>
        </div>

        {/* Category tabs */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => { setCategory(cat.id); setSportsSubcat("all-sports"); setCryptoSubcat("all-crypto"); setOffset(0); setAllMarkets([]); setHasMore(true); prevDataRef.current = ""; }}
              className={cn(
                "rounded-full px-4 py-1.5 text-xs font-semibold transition-all",
                category === cat.id
                  ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                  : "bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {category === "sports" && (
          <div className="flex flex-wrap gap-1 mb-5">
            {SPORTS_SUBCATEGORIES.map((sub) => (
              <button
                key={sub.id}
                onClick={() => setSportsSubcat(sub.id)}
                className={cn(
                  "rounded-full px-3 py-1 text-[11px] font-medium transition-all border",
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

        {category === "crypto" && (
          <div className="mb-5">
            {/* Market type filters */}
            <div className="flex flex-wrap gap-1 mb-2">
              {CRYPTO_SUBCATEGORIES.filter(s => ["all-crypto", "up-down", "above-below", "price-range", "hit-price"].includes(s.id)).map((sub) => (
                <button
                  key={sub.id}
                  onClick={() => setCryptoSubcat(sub.id)}
                  className={cn(
                    "rounded-full px-3 py-1 text-[11px] font-medium transition-all border",
                    cryptoSubcat === sub.id
                      ? "bg-primary/20 border-primary/40 text-primary"
                      : "bg-card border-border text-muted-foreground hover:border-primary/30"
                  )}
                >
                  {sub.label}
                </button>
              ))}
            </div>
            {/* Time interval filters */}
            <div className="flex flex-wrap gap-1 mb-2">
              {CRYPTO_SUBCATEGORIES.filter(s => ["5min", "15min", "1hour", "4hours", "daily", "weekly", "monthly", "yearly"].includes(s.id)).map((sub) => (
                <button
                  key={sub.id}
                  onClick={() => setCryptoSubcat(sub.id)}
                  className={cn(
                    "rounded-full px-3 py-1 text-[11px] font-medium transition-all border",
                    cryptoSubcat === sub.id
                      ? "bg-primary/20 border-primary/40 text-primary"
                      : "bg-card border-border text-muted-foreground hover:border-primary/30"
                  )}
                >
                  {sub.label}
                </button>
              ))}
            </div>
            {/* Coin filters */}
            <div className="flex flex-wrap gap-1">
              {CRYPTO_SUBCATEGORIES.filter(s => ["bitcoin", "ethereum", "solana", "xrp", "dogecoin", "bnb", "altcoins"].includes(s.id)).map((sub) => (
                <button
                  key={sub.id}
                  onClick={() => setCryptoSubcat(sub.id)}
                  className={cn(
                    "rounded-full px-3 py-1 text-[11px] font-medium transition-all border",
                    cryptoSubcat === sub.id
                      ? "bg-primary/20 border-primary/40 text-primary"
                      : "bg-card border-border text-muted-foreground hover:border-primary/30"
                  )}
                >
                  {sub.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {isLoading && (
          <div className="flex justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5">
            <p className="text-sm text-destructive">Failed to load markets: {(error as Error).message}</p>
          </div>
        )}

        {/* Combined grid */}
        {combinedGrid.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {combinedGrid.map((item) => {
              if (item.type === "event") {
                return <EventGridCard key={`evt-${item.data.slug}`} event={item.data} />;
              }

              const market = item.data;
              const yesPrice = market.outcomePrices?.[0];
              const noPrice = market.outcomePrices?.[1];
              const yesPct = yesPrice !== undefined ? Math.round(yesPrice * 100) : 50;

              return (
                <div
                  key={market.condition_id}
                  className="group rounded-2xl border border-border bg-card overflow-hidden transition-all hover:border-primary/40 hover:glow-primary"
                >
                  <Link to={`/trade/${encodeURIComponent(market.condition_id)}`} className="block p-4 pb-3">
                    <div className="flex items-start gap-3 mb-3">
                      {market.icon && (
                        <img src={market.icon} alt="" className="h-10 w-10 rounded-xl bg-muted shrink-0 ring-1 ring-border" loading="lazy" />
                      )}
                      <h3 className="text-sm font-bold leading-snug text-foreground group-hover:text-primary transition-colors line-clamp-2 flex-1">
                        {market.question}
                      </h3>
                    </div>
                  </Link>

                  {/* Live badges */}
                  {(() => {
                    const sportsSlug = extractSportsSlug(market.tags, market.event_slug);
                    const cryptoSym = extractCryptoSymbol(market.question, market.tags);
                    if (sportsSlug) return <div className="px-4 mb-2"><SportScoreBadge sportsSlug={sportsSlug} tags={market.tags} /></div>;
                    if (cryptoSym) return <div className="px-4 mb-2"><CryptoPriceBadge symbol={cryptoSym} /></div>;
                    return null;
                  })()}

                  <div className="px-4 pb-3">
                    {/* Large probability display */}
                    <div className="flex items-end gap-3 mb-3">
                      <span className="text-3xl font-extrabold font-mono text-yes tabular-nums">{yesPct}%</span>
                      <span className="text-sm text-muted-foreground font-medium mb-1">chance</span>
                    </div>

                    {/* Progress bar */}
                    <div className="mb-4">
                      <div className="h-2.5 rounded-full bg-no/15 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-yes transition-all duration-500"
                          style={{ width: `${yesPct}%` }}
                        />
                      </div>
                    </div>

                    {/* YES/NO trade buttons */}
                    <div className="flex gap-2 mb-3">
                      <button
                        onClick={(e) => { e.preventDefault(); setTradeModal({ market, outcome: 0 }); }}
                        className="flex-1 rounded-xl bg-yes/10 border border-yes/20 py-2.5 text-sm font-bold text-yes hover:bg-yes/20 hover:border-yes/40 transition-all flex items-center justify-center gap-2"
                      >
                        Yes <span className="font-mono text-xs opacity-80">{formatPrice(yesPrice)}</span>
                      </button>
                      <button
                        onClick={(e) => { e.preventDefault(); setTradeModal({ market, outcome: 1 }); }}
                        className="flex-1 rounded-xl bg-no/10 border border-no/20 py-2.5 text-sm font-bold text-no hover:bg-no/20 hover:border-no/40 transition-all flex items-center justify-center gap-2"
                      >
                        No <span className="font-mono text-xs opacity-80">{formatPrice(noPrice)}</span>
                      </button>
                    </div>

                    {/* Mini orderbook */}
                    <MiniOrderbook
                      tokenId={market.clobTokenIds?.[0] || market.tokens?.[0]?.token_id}
                      className="mb-2 rounded-lg border border-border bg-background/50 p-1.5"
                    />
                  </div>

                  {/* Footer */}
                  <div className="px-4 py-2.5 border-t border-border bg-muted/30 flex items-center gap-3 text-[11px] text-muted-foreground">
                    <span className="font-mono font-medium">{formatVol(market.volume24h)} vol</span>
                    <span className="font-mono font-medium">{formatVol(market.liquidity)} liq</span>
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
                    <span className="flex items-center gap-1">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yes opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-yes" />
                      </span>
                      <span className="text-[10px] font-semibold text-yes">LIVE</span>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {endedMarkets.length > 0 && (
          <div className="mt-8">
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

        {!isLoading && combinedGrid.length === 0 && endedMarkets.length === 0 && !error && (
          <div className="text-center py-20 text-muted-foreground">
            <p className="text-sm">No markets found{category !== "trending" ? ` in "${CATEGORIES.find(c => c.id === category)?.label || category}"` : ""}.</p>
            <p className="text-xs mt-1">Try a different category or search term.</p>
          </div>
        )}

        {hasMore && liveMarkets.length > 0 && (
          <div className="flex justify-center mt-8">
            <button
              onClick={loadMore}
              disabled={isFetching}
              className="rounded-xl border border-border bg-card px-8 py-2.5 text-sm font-semibold hover:bg-accent hover:border-primary/30 transition-all disabled:opacity-50 flex items-center gap-2"
            >
              {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Load More
            </button>
          </div>
        )}

        {liveMarkets.length > 0 && (
          <div className="mt-10">
            <RecentTradesPanel limit={30} pollMs={1_000} />
          </div>
        )}
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
