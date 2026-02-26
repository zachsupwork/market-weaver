import { useState, useMemo } from "react";
import { useMarkets } from "@/hooks/useMarkets";
import { Link } from "react-router-dom";
import { Activity, Loader2, TrendingUp, BarChart3, Search, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAccount } from "wagmi";
import {
  CATEGORIES,
  type CategoryId,
  inferCategory,
  sortByTrending,
} from "@/lib/market-categories";
import { isBytes32Hex, type NormalizedMarket, type MarketStatusLabel } from "@/lib/polymarket-api";

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

const LiveMarkets = () => {
  const [page, setPage] = useState(0);
  const [category, setCategory] = useState<CategoryId>("trending");
  const [search, setSearch] = useState("");
  const [showClosed, setShowClosed] = useState(false);
  const [showEnded, setShowEnded] = useState(false);
  const limit = 100;
  const { data: markets, isLoading, error } = useMarkets({ limit, offset: page * limit });
  const { isConnected } = useAccount();

  const { liveMarkets, endedMarkets, otherMarkets } = useMemo(() => {
    if (!markets) return { liveMarkets: [], endedMarkets: [], otherMarkets: [] };

    let list = markets as (NormalizedMarket & { _inferredCategory?: CategoryId })[];

    list = list.map((m) => ({
      ...m,
      _inferredCategory: inferCategory({
        category: m.category,
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

    if (category === "trending" || category !== "new") {
      list = sortByTrending(list);
    }

    const live = list.filter((m) => m.statusLabel === "LIVE");
    const ended = list.filter((m) => m.statusLabel === "ENDED");
    const other = list.filter((m) => m.statusLabel !== "LIVE" && m.statusLabel !== "ENDED");

    return { liveMarkets: live, endedMarkets: ended, otherMarkets: other };
  }, [markets, category, search]);

  const renderMarketCard = (market: NormalizedMarket & { _inferredCategory?: CategoryId }, dimmed = false) => {
    const hasValidId = isBytes32Hex(market.condition_id);
    if (!market.condition_id) return null;

    const yesPrice = market.outcomePrices?.[0];
    const noPrice = market.outcomePrices?.[1];

    const content = (
      <div className={cn(
        "group block rounded-xl border border-border bg-card p-5 transition-all",
        dimmed ? "opacity-60" : "hover:border-primary/30 hover:glow-primary"
      )}>
        <div className="flex items-start gap-3 mb-3">
          {market.icon && (
            <img src={market.icon} alt="" className="h-8 w-8 rounded-full bg-muted shrink-0" loading="lazy" />
          )}
          <h3 className="text-sm font-semibold leading-snug text-foreground group-hover:text-primary transition-colors line-clamp-2 flex-1">
            {market.question}
          </h3>
        </div>

        <div className="flex items-center gap-4 mb-4">
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

        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <BarChart3 className="h-3 w-3" />
            <span>{formatVol(market.volume24h)}</span>
          </div>
          <div className="flex items-center gap-1">
            <TrendingUp className="h-3 w-3" />
            <span>{formatVol(market.liquidity)} liq</span>
          </div>
          <span className="ml-auto">
            <StatusBadge status={market.statusLabel} />
          </span>
        </div>
      </div>
    );

    if (!hasValidId || market.statusLabel !== "LIVE") {
      return <div key={market.id || market.condition_id || market.question} className="cursor-not-allowed">{content}</div>;
    }

    return (
      <Link key={market.condition_id} to={`/trade/${encodeURIComponent(market.condition_id)}`} className="block">
        {content}
      </Link>
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

        <div className="relative mb-4 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search markets..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-border bg-card pl-10 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all"
          />
        </div>

        <div className="flex flex-wrap gap-2 mb-6">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => { setCategory(cat.id); setPage(0); }}
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

        {/* LIVE markets */}
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

        {/* Closed / Unavailable section */}
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

        {/* Ended / Resolved section — always last */}
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

        {liveMarkets.length > 0 && (
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
              disabled={liveMarkets.length < 20}
              className="rounded-md border border-border px-4 py-2 text-sm disabled:opacity-30 hover:bg-accent transition-all"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default LiveMarkets;
