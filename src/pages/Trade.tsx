import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchMarketByConditionId, fetchPositionsByAddress, type PolymarketMarket } from "@/lib/polymarket-api";
import { OrderbookView } from "@/components/trading/OrderbookView";
import { OrderTicket } from "@/components/trading/OrderTicket";
import { PriceChart } from "@/components/trading/PriceChart";
import { PositionCard } from "@/components/trading/PositionCard";
import { ArrowLeft, BarChart3, Droplets, Calendar, Loader2, ExternalLink, Users, Clock, Share2 } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { toast } from "sonner";

function formatVol(n: number): string {
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function timeUntil(dateStr: string): string {
  const diff = new Date(dateStr).getTime() - Date.now();
  if (diff <= 0) return "Ended";
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  if (days > 0) return `${days}d ${hours}h`;
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours}h ${mins}m`;
}

const Trade = () => {
  const { conditionId } = useParams<{ conditionId: string }>();
  const [selectedOutcome, setSelectedOutcome] = useState(0);
  const { isConnected, address } = useAccount();

  const { data: market, isLoading } = useQuery({
    queryKey: ["trade-market", conditionId],
    queryFn: () => fetchMarketByConditionId(conditionId!),
    enabled: !!conditionId && conditionId !== "undefined",
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  // Fetch user's positions for this market
  const { data: userPositions } = useQuery({
    queryKey: ["user-positions-market", address, conditionId],
    queryFn: async () => {
      const all = await fetchPositionsByAddress(address!);
      return all.filter((p: any) => p.condition_id === conditionId);
    },
    enabled: isConnected && !!address && !!conditionId,
    staleTime: 15_000,
  });

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

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    toast.success("Link copied to clipboard");
  };

  return (
    <div className="min-h-screen">
      <div className="container py-6 max-w-7xl">
        {/* Nav */}
        <div className="flex items-center justify-between mb-4">
          <Link
            to="/live"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" /> Markets
          </Link>
          <div className="flex items-center gap-2">
            <button onClick={handleShare} className="rounded-md border border-border p-2 hover:bg-accent transition-all">
              <Share2 className="h-4 w-4 text-muted-foreground" />
            </button>
            {!isConnected && <ConnectButton />}
          </div>
        </div>

        {/* Header */}
        <div className="mb-6">
          <div className="flex items-start gap-4 mb-3">
            {market.icon && (
              <img src={market.icon} alt="" className="h-12 w-12 rounded-xl bg-muted shrink-0 mt-0.5" />
            )}
            <div className="flex-1">
              <h1 className="text-xl font-bold leading-snug">{market.question}</h1>
              {market.description && (
                <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{market.description}</p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-1 rounded-md bg-muted px-2 py-1">
              <BarChart3 className="h-3 w-3" />
              <span className="font-mono text-foreground">{formatVol(market.volume_num || 0)}</span>
              <span>vol</span>
            </div>
            <div className="flex items-center gap-1 rounded-md bg-muted px-2 py-1">
              <Droplets className="h-3 w-3" />
              <span className="font-mono text-foreground">{formatVol(market.liquidity_num || 0)}</span>
              <span>liq</span>
            </div>
            {market.end_date_iso && (
              <div className="flex items-center gap-1 rounded-md bg-muted px-2 py-1">
                <Clock className="h-3 w-3" />
                <span className="font-mono text-foreground">{timeUntil(market.end_date_iso)}</span>
              </div>
            )}
            <span className="rounded-full bg-yes/10 border border-yes/20 px-2 py-0.5 text-[10px] font-mono text-yes">
              LIVE
            </span>
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
                  <div className="text-right">
                    <span className="font-mono text-2xl font-bold">{Math.round(p * 100)}¢</span>
                    <span className="block text-[10px] text-muted-foreground">
                      {Math.round(p * 100)}% chance
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Main trading grid */}
        <div className="grid gap-4 lg:grid-cols-12">
          {/* Left: Chart + Orderbook */}
          <div className="lg:col-span-4 space-y-4">
            <PriceChart
              tokenId={currentTokenId}
              outcome={currentOutcome}
              currentPrice={currentPrice}
            />
            <OrderbookView tokenId={currentTokenId} outcome={currentOutcome} />
          </div>

          {/* Center: Order ticket */}
          <div className="lg:col-span-4">
            <OrderTicket
              tokenId={currentTokenId}
              outcome={currentOutcome}
              currentPrice={currentPrice}
              isTradable={market.accepting_orders !== false && !market.closed}
            />

            {/* User's position in this market */}
            {userPositions && userPositions.length > 0 && (
              <div className="mt-4">
                <h3 className="text-xs font-semibold text-muted-foreground mb-2">Your Position</h3>
                <div className="space-y-2">
                  {userPositions.map((pos: any, i: number) => (
                    <PositionCard key={i} position={pos} compact />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right: Other outcome orderbook + market info */}
          <div className="lg:col-span-4 space-y-4">
            {tokenIds.length > 1 && (
              <OrderbookView
                tokenId={tokenIds[selectedOutcome === 0 ? 1 : 0]}
                outcome={outcomes[selectedOutcome === 0 ? 1 : 0]}
              />
            )}

            {/* Market details card */}
            <div className="rounded-lg border border-border bg-card p-4">
              <h3 className="text-sm font-semibold mb-3">Market Details</h3>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <span className="text-yes font-semibold">Active</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Volume</span>
                  <span className="font-mono">{formatVol(market.volume_num || 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Liquidity</span>
                  <span className="font-mono">{formatVol(market.liquidity_num || 0)}</span>
                </div>
                {market.end_date_iso && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">End Date</span>
                    <span className="font-mono">{new Date(market.end_date_iso).toLocaleDateString()}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Condition ID</span>
                  <span className="font-mono text-[10px] truncate max-w-[120px]">{conditionId}</span>
                </div>
              </div>
            </div>

            {/* Resolution info */}
            <div className="rounded-lg border border-border bg-card p-4">
              <h3 className="text-sm font-semibold mb-2">Resolution</h3>
              <p className="text-xs text-muted-foreground">
                Markets resolve via UMA Optimistic Oracle on Polygon. Once resolved, winning shares are redeemable for $1 USDC each.
              </p>
            </div>
          </div>
        </div>

        {/* Disclaimer */}
        <div className="mt-8 rounded-lg border border-border bg-muted/50 p-3 text-center">
          <p className="text-[10px] text-muted-foreground">
            PolyView is a third-party client. Not affiliated with Polymarket Inc. Trading prediction markets involves substantial risk.
            Your wallet signs all transactions. We never hold your funds.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Trade;
