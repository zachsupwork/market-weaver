import { useState, useMemo } from "react";
import { useMarkets } from "@/hooks/useMarkets";
import { Link } from "react-router-dom";
import { Activity, Loader2, TrendingUp, BarChart3, Search, Trophy, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import {
  CATEGORIES,
  type CategoryId,
  inferCategory,
  sortByTrending,
} from "@/lib/market-categories";
import { isBytes32Hex, type NormalizedMarket } from "@/lib/polymarket-api";

function formatVol(n: number): string {
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function formatPrice(p: number | undefined): string {
  if (p === undefined || p === null || isNaN(p)) return "—";
  return `${Math.round(p * 100)}¢`;
}

const Index = () => {
  const [category, setCategory] = useState<CategoryId>("trending");
  const [search, setSearch] = useState("");
  const { data: markets, isLoading, error } = useMarkets({ limit: 100, offset: 0 });
  const { isConnected } = useAccount();

  const filtered = useMemo(() => {
    if (!markets) return [];
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
    return list;
  }, [markets, category, search]);

  return (
    <div className="min-h-screen">
      <div className="container py-8">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Activity className="h-7 w-7 text-primary" />
            <h1 className="text-3xl font-bold">
              Poly<span className="text-primary">View</span>
            </h1>
          </div>
          <p className="text-muted-foreground max-w-lg">
            Browse, trade, and track prediction markets. Non-custodial. Powered by Polymarket.
          </p>

          {markets && markets.length > 0 && (
            <div className="flex flex-wrap gap-4 mt-4">
              <div className="rounded-lg border border-border bg-card px-4 py-2">
                <span className="text-xs text-muted-foreground block">Active Markets</span>
                <span className="font-mono text-lg font-bold text-foreground">{markets.length}</span>
              </div>
              <div className="rounded-lg border border-border bg-card px-4 py-2">
                <span className="text-xs text-muted-foreground block">24h Volume</span>
                <span className="font-mono text-lg font-bold text-foreground">
                  {formatVol(markets.reduce((s, m) => s + (m.volume24h || 0), 0))}
                </span>
              </div>
              <div className="rounded-lg border border-border bg-card px-4 py-2">
                <span className="text-xs text-muted-foreground block">Total Liquidity</span>
                <span className="font-mono text-lg font-bold text-foreground">
                  {formatVol(markets.reduce((s, m) => s + (m.liquidity || 0), 0))}
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-4 mb-8">
          <Link to="/live" className="rounded-xl border border-border bg-card p-4 hover:border-primary/30 transition-all group">
            <Activity className="h-5 w-5 text-primary mb-2" />
            <h3 className="text-sm font-semibold group-hover:text-primary transition-colors">Live Markets</h3>
            <p className="text-xs text-muted-foreground mt-1">Browse all active prediction markets</p>
          </Link>
          <Link to="/events" className="rounded-xl border border-border bg-card p-4 hover:border-primary/30 transition-all group">
            <Search className="h-5 w-5 text-primary mb-2" />
            <h3 className="text-sm font-semibold group-hover:text-primary transition-colors">Explore Events</h3>
            <p className="text-xs text-muted-foreground mt-1">Browse events with nested markets</p>
          </Link>
          <Link to="/leaderboard" className="rounded-xl border border-border bg-card p-4 hover:border-primary/30 transition-all group">
            <Trophy className="h-5 w-5 text-warning mb-2" />
            <h3 className="text-sm font-semibold group-hover:text-primary transition-colors">Leaderboard</h3>
            <p className="text-xs text-muted-foreground mt-1">Top traders by profit & volume</p>
          </Link>
          <Link to="/portfolio" className="rounded-xl border border-border bg-card p-4 hover:border-primary/30 transition-all group">
            <Wallet className="h-5 w-5 text-yes mb-2" />
            <h3 className="text-sm font-semibold group-hover:text-primary transition-colors">Portfolio</h3>
            <p className="text-xs text-muted-foreground mt-1">Your positions, trades & balances</p>
          </Link>
        </div>

        {!isConnected && (
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-5 mb-8 flex items-center justify-between flex-wrap gap-4">
            <div>
              <p className="text-sm font-semibold text-foreground">Connect your wallet to start trading</p>
              <p className="text-xs text-muted-foreground mt-1">Non-custodial. You control your funds.</p>
            </div>
            <ConnectButton />
          </div>
        )}

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
              onClick={() => setCategory(cat.id)}
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

        {filtered.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.slice(0, 30).map((market) => {
              if (!market.condition_id) return null;
              const hasValidId = isBytes32Hex(market.condition_id);
              if (!hasValidId) return null;

              const yesPrice = market.outcomePrices?.[0];
              const noPrice = market.outcomePrices?.[1];

              return (
                <Link
                  key={market.condition_id}
                  to={`/trade/${encodeURIComponent(market.condition_id)}`}
                  className="group block rounded-xl border border-border bg-card p-5 transition-all hover:border-primary/30 hover:glow-primary"
                >
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
                    {market.accepting_orders && (
                      <span className="ml-auto rounded-full bg-yes/10 border border-yes/20 px-2 py-0.5 text-[10px] font-mono text-yes">
                        LIVE
                      </span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        {!isLoading && filtered.length === 0 && !error && (
          <div className="text-center py-16 text-muted-foreground">
            <p className="text-sm">No active markets found.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Index;
