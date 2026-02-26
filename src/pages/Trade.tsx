import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchMarketByConditionId,
  fetchPositionsByAddress,
  fetchTrades,
  fetchPriceHistory,
  fetchEventBySlug,
  cancelOrder,
  isBytes32Hex,
  type NormalizedMarket,
  type TradeRecord,
  type PriceHistoryPoint,
} from "@/lib/polymarket-api";
import { supabase } from "@/integrations/supabase/client";
import { OrderbookView } from "@/components/trading/OrderbookView";
import { OrderTicket } from "@/components/trading/OrderTicket";
import { PositionCard } from "@/components/trading/PositionCard";
import { LiveOrderbook } from "@/components/trading/LiveOrderbook";
import {
  ArrowLeft,
  BarChart3,
  Droplets,
  Calendar,
  Loader2,
  ExternalLink,
  Clock,
  Share2,
  Activity,
  TrendingUp,
  AlertTriangle,
  Wifi,
  WifiOff,
  Code,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  Send,
  RefreshCw,
} from "lucide-react";
import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { toast } from "sonner";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip as ReTooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";

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

function formatTime(ts: string): string {
  try {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return ts;
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return ts;
  }
}

const Trade = () => {
  const { conditionId } = useParams<{ conditionId: string }>();
  const [selectedOutcome, setSelectedOutcome] = useState(0);
  const [chartTab, setChartTab] = useState<"price" | "volume">("price");
  const [chartRange, setChartRange] = useState<"1D" | "1W" | "1M" | "ALL">("1W");
  const [activeTab, setActiveTab] = useState<"trade" | "orderbook" | "trades" | "community" | "analytics" | "data">("trade");
  const [wsEnabled, setWsEnabled] = useState(false);
  const [showRawJson, setShowRawJson] = useState(false);
  const [commentBody, setCommentBody] = useState("");
  const [commentName, setCommentName] = useState("");
  const { isConnected, address } = useAccount();
  const queryClient = useQueryClient();

  // Validate condition_id format
  const isValidId = conditionId ? isBytes32Hex(conditionId) : false;

  const { data: market, isLoading, refetch: refetchMarket } = useQuery({
    queryKey: ["trade-market", conditionId],
    queryFn: () => fetchMarketByConditionId(conditionId!),
    enabled: !!conditionId && isValidId,
    staleTime: 15_000,
    refetchInterval: 30_000,
    retry: 2,
  });

  const tokenIds = market?.clobTokenIds ?? [];
  const currentTokenId = tokenIds[selectedOutcome] || "";

  // Debug warning for missing token IDs
  if (market && tokenIds.length === 0) {
    console.warn("[PolyView] Market has no clobTokenIds:", market.condition_id, market.question);
  }

  // Fetch event context (rules/description) if we have an event_slug
  const { data: eventData } = useQuery({
    queryKey: ["event-context", market?.event_slug],
    queryFn: () => fetchEventBySlug(market!.event_slug),
    enabled: !!market?.event_slug,
    staleTime: 60_000,
  });

  // Merge event context into display fields
  const eventDescription = eventData?.description || market?.eventDescription || market?.description || "";
  const eventTitle = eventData?.title || market?.eventTitle || "";
  const resolutionSource = eventData?.resolution_source || market?.resolutionSource || "";

  // Real price history from CLOB
  const { data: priceHistory, isLoading: historyLoading } = useQuery({
    queryKey: ["price-history", currentTokenId, chartRange],
    queryFn: () => fetchPriceHistory(currentTokenId, chartRange),
    enabled: !!currentTokenId,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const { data: trades, isLoading: tradesLoading } = useQuery({
    queryKey: ["trades", currentTokenId],
    queryFn: () => fetchTrades(currentTokenId, 50),
    enabled: !!currentTokenId,
    staleTime: 5_000,
    refetchInterval: 5_000,
  });

  const { data: userPositions } = useQuery({
    queryKey: ["user-positions-market", address, conditionId],
    queryFn: async () => {
      const all = await fetchPositionsByAddress(address!);
      return all.filter((p: any) => p.condition_id === conditionId);
    },
    enabled: isConnected && !!address && !!conditionId,
    staleTime: 15_000,
  });

  // Community comments
  const { data: comments, isLoading: commentsLoading } = useQuery({
    queryKey: ["market-comments", conditionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("market_comments")
        .select("*")
        .eq("condition_id", conditionId!)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data || [];
    },
    enabled: !!conditionId && isValidId,
    staleTime: 10_000,
    refetchInterval: 15_000,
  });

  const postComment = useMutation({
    mutationFn: async () => {
      if (!commentBody.trim()) throw new Error("Comment cannot be empty");
      const { error } = await supabase.from("market_comments").insert({
        condition_id: conditionId!,
        user_address: address || "anonymous",
        display_name: commentName.trim() || (address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "Anon"),
        body: commentBody.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setCommentBody("");
      queryClient.invalidateQueries({ queryKey: ["market-comments", conditionId] });
      toast.success("Comment posted");
    },
    onError: (e: any) => toast.error(e.message || "Failed to post comment"),
  });

  // Real price history chart data
  const historyChartData = useMemo(() => {
    if (!priceHistory || priceHistory.length === 0) return [];
    return priceHistory.map((pt) => ({
      time: new Date(pt.t * 1000).toLocaleString([], {
        month: "short", day: "numeric",
        ...(chartRange === "1D" ? { hour: "2-digit", minute: "2-digit" } : {}),
      }),
      price: Math.round(pt.p * 100),
    }));
  }, [priceHistory, chartRange]);

  // Trades-based chart data (for volume chart & fallback)
  const chartData = useMemo(() => {
    if (!trades || trades.length === 0) return [];
    const sorted = [...trades].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    return sorted.map((t) => ({
      time: formatTime(t.timestamp),
      price: Math.round(t.price * 100),
      volume: t.size,
    }));
  }, [trades]);

  const analytics = useMemo(() => {
    if (!trades || trades.length < 2) return null;
    const prices = trades.map((t) => t.price);
    const latest = prices[0] ?? 0;
    const oldest = prices[prices.length - 1] ?? 0;
    const change24h = oldest > 0 ? ((latest - oldest) / oldest) * 100 : 0;
    const bestBid = Math.max(...prices);
    const bestAsk = Math.min(...prices);
    const spread = bestBid - bestAsk;
    const mid = (bestBid + bestAsk) / 2;
    const totalVol = trades.reduce((s, t) => s + t.size, 0);
    return { change24h, spread, mid, totalVol };
  }, [trades]);

  // Invalid ID
  if (!conditionId || conditionId === "undefined" || !isValidId) {
    return (
      <div className="container py-16 text-center">
        <AlertTriangle className="h-10 w-10 text-destructive mx-auto mb-4" />
        <p className="text-lg font-semibold text-destructive">Invalid Market ID</p>
        <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
          This link does not contain a valid Polymarket condition_id (must be 0x + 64 hex characters).
          {conditionId && (
            <span className="block mt-1 font-mono text-[10px] break-all">
              Received: {conditionId}
            </span>
          )}
        </p>
        <Link to="/live" className="inline-flex items-center gap-1.5 text-primary text-sm mt-4 hover:underline">
          <ArrowLeft className="h-4 w-4" /> Back to Live Markets
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
        <AlertTriangle className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
        <p className="text-lg font-semibold text-foreground">Market not found on Polymarket</p>
        <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
          No market exists for this condition ID. It may have been removed, resolved, or not yet indexed.
          <span className="block mt-1 font-mono text-[10px] break-all">
            {conditionId.slice(0, 20)}…{conditionId.slice(-8)}
          </span>
        </p>
        <div className="flex gap-3 justify-center mt-4">
          <button
            onClick={() => refetchMarket()}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent transition-all"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Retry
          </button>
          <Link to="/live" className="inline-flex items-center gap-1.5 text-primary text-sm hover:underline">
            <ArrowLeft className="h-4 w-4" /> Browse live markets
          </Link>
        </div>
      </div>
    );
  }

  const outcomes = market.outcomes;
  const prices = market.outcomePrices;
  const currentPrice = prices[selectedOutcome] ?? 0.5;
  const currentOutcome = outcomes[selectedOutcome] || (selectedOutcome === 0 ? "Yes" : "No");

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    toast.success("Link copied to clipboard");
  };

  const hasMissingTokenIds = tokenIds.length === 0;

  const tabs = [
    { id: "trade" as const, label: "Trade" },
    { id: "orderbook" as const, label: "Orderbook" },
    { id: "trades" as const, label: "Activity" },
    { id: "community" as const, label: "Community" },
    { id: "analytics" as const, label: "Analytics" },
    { id: "data" as const, label: "Market Data" },
  ];

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

        {/* Missing token IDs warning */}
        {hasMissingTokenIds && (
          <div className="rounded-lg border border-warning/30 bg-warning/5 p-4 mb-4 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-warning shrink-0" />
            <div>
              <p className="text-sm font-semibold text-warning">Orderbook Unavailable</p>
              <p className="text-xs text-muted-foreground">This market loaded but is missing token IDs. Orderbook and trading features are unavailable.</p>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="mb-6">
          <div className="flex items-start gap-4 mb-3">
            {market.icon && (
              <img src={market.icon} alt="" className="h-12 w-12 rounded-xl bg-muted shrink-0 mt-0.5" />
            )}
            <div className="flex-1">
              <h1 className="text-xl font-bold leading-snug">{market.question}</h1>
              {eventTitle && eventTitle !== market.question && (
                <p className="text-xs text-primary mt-0.5">{eventTitle}</p>
              )}
              {market.description && (
                <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{market.description}</p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-1 rounded-md bg-muted px-2 py-1">
              <BarChart3 className="h-3 w-3" />
              <span className="font-mono text-foreground">{formatVol(market.totalVolume)}</span>
              <span>vol</span>
            </div>
            <div className="flex items-center gap-1 rounded-md bg-muted px-2 py-1">
              <TrendingUp className="h-3 w-3" />
              <span className="font-mono text-foreground">{formatVol(market.volume24h)}</span>
              <span>24h</span>
            </div>
            <div className="flex items-center gap-1 rounded-md bg-muted px-2 py-1">
              <Droplets className="h-3 w-3" />
              <span className="font-mono text-foreground">{formatVol(market.liquidity)}</span>
              <span>liq</span>
            </div>
            {market.end_date_iso && (
              <div className="flex items-center gap-1 rounded-md bg-muted px-2 py-1">
                <Clock className="h-3 w-3" />
                <span className="font-mono text-foreground">{timeUntil(market.end_date_iso)}</span>
              </div>
            )}
            {analytics && (
              <div className={cn(
                "flex items-center gap-1 rounded-md px-2 py-1 font-mono",
                analytics.change24h >= 0 ? "bg-yes/10 text-yes" : "bg-no/10 text-no"
              )}>
                {analytics.change24h >= 0 ? "+" : ""}{analytics.change24h.toFixed(1)}%
              </div>
            )}
            {market.statusLabel === "LIVE" ? (
              <>
                <span className="rounded-full bg-yes/10 border border-yes/20 px-2 py-0.5 text-[10px] font-mono text-yes">
                  LIVE
                </span>
                {(market.event_slug || market.market_slug || market.slug) && (
                  <a
                    href={`https://polymarket.com/event/${market.event_slug || market.market_slug || market.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-primary hover:underline ml-auto"
                  >
                    <ExternalLink className="h-3 w-3" /> Polymarket
                  </a>
                )}
              </>
            ) : (
              <span className="ml-auto text-[10px] text-muted-foreground">
                Not available on Polymarket ({market.statusLabel?.toLowerCase()})
              </span>
            )}
          </div>

          {market.tags.length > 0 && (
            <div className="flex gap-1.5 mt-3">
              {market.tags.slice(0, 5).map((tag) => (
                <span key={tag} className="rounded-full bg-secondary px-2.5 py-0.5 text-[10px] font-medium text-secondary-foreground">
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Outcome selector */}
        <div className="flex gap-2 mb-6">
          {outcomes.map((outcome: string, i: number) => {
            const p = prices[i] ?? 0;
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

        {/* Tab bar */}
        <div className="flex gap-1 mb-6 overflow-x-auto border-b border-border pb-px">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "px-4 py-2 text-xs font-medium whitespace-nowrap transition-all border-b-2",
                activeTab === tab.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.label}
              {tab.id === "community" && comments && comments.length > 0 && (
                <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[9px]">{comments.length}</span>
              )}
            </button>
          ))}
        </div>

        {/* Trade tab */}
        {activeTab === "trade" && (
          <>
            {/* Chart */}
            <div className="rounded-lg border border-border bg-card p-4 mb-6">
              <div className="flex items-center justify-between mb-3">
                <div className="flex gap-2">
                  <button
                    onClick={() => setChartTab("price")}
                    className={cn(
                      "rounded-md px-3 py-1 text-xs font-medium transition-all",
                      chartTab === "price" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                    )}
                  >
                    Price
                  </button>
                  <button
                    onClick={() => setChartTab("volume")}
                    className={cn(
                      "rounded-md px-3 py-1 text-xs font-medium transition-all",
                      chartTab === "volume" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                    )}
                  >
                    Volume
                  </button>
                </div>
                {chartTab === "price" && (
                  <div className="flex gap-1">
                    {(["1D", "1W", "1M", "ALL"] as const).map((r) => (
                      <button
                        key={r}
                        onClick={() => setChartRange(r)}
                        className={cn(
                          "rounded px-2 py-0.5 text-[10px] font-mono font-medium transition-all",
                          chartRange === r ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="h-48">
                {chartTab === "price" ? (
                  historyLoading ? (
                    <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading chart...
                    </div>
                  ) : historyChartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={historyChartData}>
                        <XAxis dataKey="time" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" interval="preserveStartEnd" />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `${v}¢`} />
                        <ReTooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} formatter={(v: number) => [`${v}¢`, currentOutcome]} />
                        <Line type="monotone" dataKey="price" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
                      <Activity className="h-4 w-4 mr-2" /> No chart data available
                    </div>
                  )
                ) : chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <XAxis dataKey="time" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                      <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                      <ReTooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                      <Bar dataKey="volume" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
                    <Activity className="h-4 w-4 mr-2" /> No volume data
                  </div>
                )}
              </div>
            </div>

            {/* Rules / Market Context */}
            {(eventDescription || resolutionSource) && (
              <div className="rounded-lg border border-border bg-card p-4 mb-6">
                <h3 className="text-sm font-semibold mb-2">Rules & Resolution</h3>
                {eventDescription && (
                  <p className="text-xs text-muted-foreground whitespace-pre-wrap mb-2">{eventDescription}</p>
                )}
                {resolutionSource && (
                  <p className="text-[10px] text-muted-foreground">
                    <span className="font-semibold text-foreground">Resolution source:</span> {resolutionSource}
                  </p>
                )}
              </div>
            )}

            {/* Analytics bar */}
            {analytics && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                <div className="rounded-lg border border-border bg-card p-3">
                  <span className="text-[10px] text-muted-foreground block">Mid Price</span>
                  <span className="font-mono text-lg font-bold">{Math.round(analytics.mid * 100)}¢</span>
                </div>
                <div className="rounded-lg border border-border bg-card p-3">
                  <span className="text-[10px] text-muted-foreground block">Spread</span>
                  <span className="font-mono text-lg font-bold">{(analytics.spread * 100).toFixed(1)}¢</span>
                </div>
                <div className="rounded-lg border border-border bg-card p-3">
                  <span className="text-[10px] text-muted-foreground block">24h Change</span>
                  <span className={cn("font-mono text-lg font-bold", analytics.change24h >= 0 ? "text-yes" : "text-no")}>
                    {analytics.change24h >= 0 ? "+" : ""}{analytics.change24h.toFixed(1)}%
                  </span>
                </div>
                <div className="rounded-lg border border-border bg-card p-3">
                  <span className="text-[10px] text-muted-foreground block">Trade Vol</span>
                  <span className="font-mono text-lg font-bold">{analytics.totalVol.toFixed(1)}</span>
                </div>
              </div>
            )}

            {/* Trading grid */}
            <div className="grid gap-4 lg:grid-cols-12">
              <div className="lg:col-span-3 space-y-4">
                {wsEnabled ? (
                  <LiveOrderbook tokenId={currentTokenId} outcome={currentOutcome} />
                ) : (
                  <OrderbookView tokenId={currentTokenId} outcome={currentOutcome} />
                )}
                <div className="flex items-center gap-2 px-1">
                  <button
                    onClick={() => setWsEnabled(!wsEnabled)}
                    className={cn(
                      "flex items-center gap-1.5 text-[10px] font-medium rounded-md px-2 py-1 transition-all",
                      wsEnabled ? "bg-yes/10 text-yes border border-yes/30" : "bg-muted text-muted-foreground border border-transparent"
                    )}
                  >
                    {wsEnabled ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
                    {wsEnabled ? "Live WS" : "Polling"}
                  </button>
                </div>
                {tokenIds.length > 1 && !wsEnabled && (
                  <OrderbookView
                    tokenId={tokenIds[selectedOutcome === 0 ? 1 : 0]}
                    outcome={outcomes[selectedOutcome === 0 ? 1 : 0]}
                  />
                )}
              </div>

              <div className="lg:col-span-4">
                <OrderTicket
                  tokenId={currentTokenId}
                  outcome={currentOutcome}
                  currentPrice={currentPrice}
                  isTradable={market.accepting_orders !== false && !market.closed && !hasMissingTokenIds}
                />

                {userPositions && userPositions.length > 0 && (
                  <div className="mt-4">
                    <h3 className="text-xs font-semibold text-muted-foreground mb-2">Your Positions</h3>
                    <div className="space-y-2">
                      {userPositions.map((pos: any, i: number) => (
                        <PositionCard key={i} position={pos} compact />
                      ))}
                    </div>
                  </div>
                )}

                {isConnected && (
                  <div className="mt-4 rounded-lg border border-border bg-card p-4">
                    <h3 className="text-xs font-semibold text-muted-foreground mb-2">Open Orders</h3>
                    <p className="text-[10px] text-muted-foreground">Open order tracking coming next.</p>
                  </div>
                )}
              </div>

              <div className="lg:col-span-5 space-y-4">
                <div className="rounded-lg border border-border bg-card p-4">
                  <h3 className="text-sm font-semibold mb-3">Recent Trades</h3>
                  <div className="grid grid-cols-4 text-[10px] text-muted-foreground font-mono mb-1 px-1">
                    <span>Time</span>
                    <span>Price</span>
                    <span>Size</span>
                    <span className="text-right">Side</span>
                  </div>
                  <div className="max-h-64 overflow-y-auto space-y-px">
                    {tradesLoading ? (
                      <div className="flex justify-center py-4">
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      </div>
                    ) : trades && trades.length > 0 ? (
                      trades.slice(0, 50).map((trade, i) => {
                        const isLargeFill = trade.size >= 100;
                        return (
                          <div key={i} className={cn(
                            "grid grid-cols-4 px-1 py-0.5 text-xs font-mono hover:bg-muted/50 transition-colors",
                            isLargeFill && "bg-primary/5 border-l-2 border-primary"
                          )}>
                            <span className="text-muted-foreground">{formatTime(trade.timestamp)}</span>
                            <span>{Math.round(trade.price * 100)}¢</span>
                            <span className={isLargeFill ? "font-bold text-foreground" : ""}>{trade.size.toFixed(1)}{isLargeFill && " 🔥"}</span>
                            <span className={cn("text-right font-semibold", trade.side === "BUY" ? "text-yes" : "text-no")}>
                              {trade.side}
                            </span>
                          </div>
                        );
                      })
                    ) : (
                      <p className="text-xs text-muted-foreground py-4 text-center">No recent trades</p>
                    )}
                  </div>
                </div>

                <div className="rounded-lg border border-border bg-card p-4">
                  <h3 className="text-sm font-semibold mb-3">Market Details</h3>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Status</span>
                      <span className={market.accepting_orders ? "text-yes font-semibold" : "text-muted-foreground"}>
                        {market.accepting_orders ? "Active" : "Paused"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total Volume</span>
                      <span className="font-mono">{formatVol(market.totalVolume)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">24h Volume</span>
                      <span className="font-mono">{formatVol(market.volume24h)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Liquidity</span>
                      <span className="font-mono">{formatVol(market.liquidity)}</span>
                    </div>
                    {market.end_date_iso && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">End Date</span>
                        <span className="font-mono">{new Date(market.end_date_iso).toLocaleDateString()}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Condition ID</span>
                      <span className="font-mono text-[10px] truncate max-w-[160px]">{conditionId}</span>
                    </div>
                    {market.category && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Category</span>
                        <span>{market.category}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Orderbook tab */}
        {activeTab === "orderbook" && (
          <div className="grid gap-4 sm:grid-cols-2">
            {tokenIds.map((tid, i) => (
              <div key={tid}>
                {wsEnabled ? (
                  <LiveOrderbook tokenId={tid} outcome={outcomes[i] || `Outcome ${i}`} />
                ) : (
                  <OrderbookView tokenId={tid} outcome={outcomes[i] || `Outcome ${i}`} />
                )}
              </div>
            ))}
            {tokenIds.length === 0 && (
              <p className="text-sm text-muted-foreground py-8 text-center sm:col-span-2">No token IDs available for orderbook.</p>
            )}
            <div className="sm:col-span-2 flex items-center gap-2">
              <button
                onClick={() => setWsEnabled(!wsEnabled)}
                className={cn(
                  "flex items-center gap-1.5 text-xs font-medium rounded-md px-3 py-1.5 transition-all",
                  wsEnabled ? "bg-yes/10 text-yes border border-yes/30" : "bg-muted text-muted-foreground border border-border"
                )}
              >
                {wsEnabled ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
                {wsEnabled ? "Live WebSocket Stream" : "Enable Live Stream"}
              </button>
            </div>
          </div>
        )}

        {/* Activity tab */}
        {activeTab === "trades" && (
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Activity className="h-4 w-4" /> Activity — {currentOutcome}
              </h3>
              <span className="text-[10px] text-muted-foreground">
                {tradesLoading ? "Loading..." : `${trades?.length ?? 0} recent trades`}
              </span>
            </div>
            <div className="grid grid-cols-4 text-[10px] text-muted-foreground font-mono mb-1 px-1">
              <span>Time</span>
              <span>Price</span>
              <span>Size</span>
              <span className="text-right">Side</span>
            </div>
            <div className="max-h-[500px] overflow-y-auto space-y-px">
              {tradesLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : trades && trades.length > 0 ? (
                trades.map((trade, i) => {
                  const isLargeFill = trade.size >= 100;
                  return (
                    <div key={i} className={cn(
                      "grid grid-cols-4 px-1 py-0.5 text-xs font-mono hover:bg-muted/50 transition-colors",
                      isLargeFill && "bg-primary/5 border-l-2 border-primary"
                    )}>
                      <span className="text-muted-foreground">{formatTime(trade.timestamp)}</span>
                      <span>{Math.round(trade.price * 100)}¢</span>
                      <span className={isLargeFill ? "font-bold text-foreground" : ""}>{trade.size.toFixed(1)}{isLargeFill && " 🔥"}</span>
                      <span className={cn("text-right font-semibold", trade.side === "BUY" ? "text-yes" : "text-no")}>
                        {trade.side}
                      </span>
                    </div>
                  );
                })
              ) : (
                <p className="text-xs text-muted-foreground py-4 text-center">No recent trades for this token.</p>
              )}
            </div>
          </div>
        )}

        {/* Community tab */}
        {activeTab === "community" && (
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-card p-4">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <MessageSquare className="h-4 w-4" /> Community Discussion
              </h3>
              <p className="text-[10px] text-muted-foreground mb-4">
                Share your analysis and predictions. Comments are stored on PolyView, not Polymarket.
              </p>

              {/* Comment form */}
              <div className="rounded-md border border-border bg-muted/30 p-3 mb-4">
                {!commentName && (
                  <input
                    type="text"
                    value={commentName}
                    onChange={(e) => setCommentName(e.target.value)}
                    placeholder={address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "Display name (optional)"}
                    className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs mb-2 focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                )}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={commentBody}
                    onChange={(e) => setCommentBody(e.target.value)}
                    placeholder="Share your thoughts..."
                    className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && commentBody.trim()) postComment.mutate();
                    }}
                  />
                  <button
                    onClick={() => postComment.mutate()}
                    disabled={!commentBody.trim() || postComment.isPending}
                    className="rounded-md bg-primary text-primary-foreground px-3 py-2 text-xs font-semibold hover:bg-primary/90 disabled:opacity-50 transition-all"
                  >
                    {postComment.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                  </button>
                </div>
              </div>

              {/* Comments list */}
              <div className="space-y-3 max-h-[500px] overflow-y-auto">
                {commentsLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : comments && comments.length > 0 ? (
                  comments.map((c: any) => (
                    <div key={c.id} className="rounded-md border border-border bg-muted/30 p-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold text-foreground">{c.display_name || "Anon"}</span>
                        <span className="text-[10px] text-muted-foreground">{formatTime(c.created_at)}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">{c.body}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-muted-foreground py-8 text-center">No comments yet. Be the first!</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Analytics tab */}
        {activeTab === "analytics" && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-lg border border-border bg-card p-4">
                <span className="text-[10px] text-muted-foreground block">Total Volume</span>
                <span className="font-mono text-xl font-bold">{formatVol(market.totalVolume)}</span>
              </div>
              <div className="rounded-lg border border-border bg-card p-4">
                <span className="text-[10px] text-muted-foreground block">24h Volume</span>
                <span className="font-mono text-xl font-bold">{formatVol(market.volume24h)}</span>
              </div>
              <div className="rounded-lg border border-border bg-card p-4">
                <span className="text-[10px] text-muted-foreground block">Liquidity</span>
                <span className="font-mono text-xl font-bold">{formatVol(market.liquidity)}</span>
              </div>
              {analytics && (
                <div className="rounded-lg border border-border bg-card p-4">
                  <span className="text-[10px] text-muted-foreground block">24h Change</span>
                  <span className={cn("font-mono text-xl font-bold", analytics.change24h >= 0 ? "text-yes" : "text-no")}>
                    {analytics.change24h >= 0 ? "+" : ""}{analytics.change24h.toFixed(1)}%
                  </span>
                </div>
              )}
            </div>

            <div className="rounded-lg border border-border bg-card p-4">
              <h3 className="text-sm font-semibold mb-3">Price History — {currentOutcome}</h3>
              <div className="h-64">
                {chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <XAxis dataKey="time" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                      <ReTooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                      <Line type="monotone" dataKey="price" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-xs text-muted-foreground">No price data</div>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-4">
              <h3 className="text-sm font-semibold mb-3">Volume — {currentOutcome}</h3>
              <div className="h-48">
                {chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <XAxis dataKey="time" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                      <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                      <ReTooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                      <Bar dataKey="volume" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-xs text-muted-foreground">No volume data</div>
                )}
              </div>
            </div>

            {analytics && (
              <div className="rounded-lg border border-border bg-card p-4">
                <h3 className="text-sm font-semibold mb-3">Spread & Mid</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <span className="text-[10px] text-muted-foreground block">Mid Price</span>
                    <span className="font-mono text-lg font-bold">{Math.round(analytics.mid * 100)}¢</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground block">Spread</span>
                    <span className="font-mono text-lg font-bold">{(analytics.spread * 100).toFixed(1)}¢</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground block">Trades</span>
                    <span className="font-mono text-lg font-bold">{trades?.length ?? 0}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Market Data tab */}
        {activeTab === "data" && (
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-card p-4">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Code className="h-4 w-4" /> Market Data
              </h3>
              <div className="space-y-3 text-xs">
                <div>
                  <span className="text-muted-foreground block mb-1">Condition ID</span>
                  <span className="font-mono text-[11px] break-all text-foreground">{market.condition_id}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block mb-1">Token IDs</span>
                  {tokenIds.length > 0 ? tokenIds.map((tid, i) => (
                    <div key={i} className="flex items-center gap-2 mt-1">
                      <span className={cn("text-[10px] font-semibold w-8", i === 0 ? "text-yes" : "text-no")}>
                        {outcomes[i] || `#${i}`}
                      </span>
                      <span className="font-mono text-[10px] break-all text-muted-foreground">{tid}</span>
                    </div>
                  )) : (
                    <span className="text-muted-foreground">No token IDs available</span>
                  )}
                </div>
                <div>
                  <span className="text-muted-foreground block mb-1">Outcomes</span>
                  <span className="font-mono">{JSON.stringify(outcomes)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block mb-1">Outcome Prices</span>
                  <span className="font-mono">{JSON.stringify(prices)}</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <span className="text-muted-foreground block">Liquidity</span>
                    <span className="font-mono font-bold">{formatVol(market.liquidity)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">24h Vol</span>
                    <span className="font-mono font-bold">{formatVol(market.volume24h)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">Total Vol</span>
                    <span className="font-mono font-bold">{formatVol(market.totalVolume)}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-4">
              <button
                onClick={() => setShowRawJson(!showRawJson)}
                className="flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
              >
                {showRawJson ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                Raw Market JSON
              </button>
              {showRawJson && (
                <pre className="mt-3 rounded-md bg-muted p-3 text-[10px] font-mono text-muted-foreground overflow-x-auto max-h-96">
                  {JSON.stringify(market, null, 2)}
                </pre>
              )}
            </div>
          </div>
        )}

        {/* Disclaimer */}
        <div className="mt-8 rounded-lg border border-border bg-muted/50 p-3 text-center">
          <p className="text-[10px] text-muted-foreground">
            Trading involves risk. Not financial advice. PolyView is a third-party client, not affiliated with Polymarket Inc.
            Your wallet signs all transactions. We never hold your funds or private keys.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Trade;
