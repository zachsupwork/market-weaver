import { useState, useEffect, useMemo } from "react";
import { useParams, Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchEventById, isBytes32Hex, type NormalizedMarket } from "@/lib/polymarket-api";
import { normalizeMarkets } from "@/lib/normalizePolymarket";
import { groupMarkets, type MarketGroup } from "@/lib/market-grouping";
import { orderbookWsService } from "@/services/orderbook-ws.service";
import { useMarketStore } from "@/stores/useMarketStore";
import { EventMarketCard } from "@/components/markets/EventMarketCard";
import {
  ArrowLeft,
  Loader2,
  BarChart3,
  TrendingUp,
  Droplets,
  ExternalLink,
  Calendar,
  Layers,
  Share2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LiveOrderbook } from "@/components/trading/LiveOrderbook";
import { RecentTradesPanel } from "@/components/trades/RecentTradesPanel";
import { OrderTicket } from "@/components/trading/OrderTicket";
import { SportScoreBadge } from "@/components/markets/SportScoreBadge";
import { CryptoPriceBadge } from "@/components/markets/CryptoPriceBadge";
import { extractSportsSlug, extractCryptoSymbol } from "@/lib/live-data-utils";
import { motion, AnimatePresence } from "framer-motion";
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

/** Leaderboard row for multi-outcome events (top candidates) */
function CandidateRow({
  market,
  rank,
  selected,
  onSelect,
}: {
  market: NormalizedMarket;
  rank: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const tokenId = market.clobTokenIds?.[0];
  const wsPrice = useMarketStore((s) => (tokenId ? s.assets[tokenId]?.lastTradePrice : null));
  const price = wsPrice ?? market.outcomePrices?.[0] ?? 0;
  const pct = Math.round(price * 100);

  return (
    <button
      onClick={onSelect}
      className={cn(
        "w-full flex items-center gap-3 px-3 py-2 text-left transition-all rounded-lg",
        selected
          ? "bg-primary/10 border border-primary/30"
          : "hover:bg-muted/50 border border-transparent"
      )}
    >
      <span className="text-xs text-muted-foreground font-mono w-5 shrink-0">{rank}</span>
      <span className="flex-1 text-sm font-medium truncate">{market.question}</span>
      <div className="w-14 shrink-0">
        <Progress value={pct} className="h-1.5" />
      </div>
      <AnimatePresence mode="popLayout">
        <motion.span
          key={pct}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 4 }}
          transition={{ duration: 0.15 }}
          className="text-sm font-mono font-semibold w-10 text-right shrink-0 text-primary"
        >
          {pct}¢
        </motion.span>
      </AnimatePresence>
      <span className="text-[10px] text-muted-foreground/60 font-mono w-10 text-right shrink-0 hidden sm:block">
        /{100 - pct}¢
      </span>
      <span className="text-xs text-muted-foreground font-mono w-14 text-right shrink-0 hidden md:block">
        {formatVol(market.volume24h)}
      </span>
    </button>
  );
}

const EventDetail = () => {
  const { eventId } = useParams<{ eventId: string }>();
  const [searchParams] = useSearchParams();
  const preselectedMarket = searchParams.get("market");
  const [selectedConditionId, setSelectedConditionId] = useState<string | null>(preselectedMarket);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<"orderbook" | "trades">("orderbook");

  const { data: event, isLoading } = useQuery({
    queryKey: ["polymarket-event", eventId],
    queryFn: () => fetchEventById(eventId!),
    enabled: !!eventId,
    staleTime: 15_000,
    refetchInterval: 30_000, // refresh every 30s for status updates
  });

  const allMarkets = useMemo(() => {
    if (!event?.markets) return [];
    return normalizeMarkets(event.markets)
      .filter((m) => isBytes32Hex(m.condition_id));
  }, [event]);

  // Tradable markets: LIVE or markets that are active (not just status === "LIVE")
  const tradableMarkets = useMemo(
    () => allMarkets.filter((m) => m.statusLabel === "LIVE" || (m.active && !m.closed && !m.ended))
      .sort((a, b) => (b.outcomePrices?.[0] ?? 0) - (a.outcomePrices?.[0] ?? 0)),
    [allMarkets]
  );

  // Derive event-level UI status
  type EventUIStatus = "LIVE" | "UPCOMING" | "ENDED";
  const eventUIStatus: EventUIStatus = useMemo(() => {
    // If event itself has resolved flag
    if (event?.resolved === true) return "ENDED";
    // If all markets are ended/closed
    if (allMarkets.length > 0 && allMarkets.every((m) => m.statusLabel === "ENDED" || m.statusLabel === "ARCHIVED" || m.statusLabel === "CLOSED")) return "ENDED";
    // If any market is actively tradable
    if (tradableMarkets.length > 0) return "LIVE";
    // Check if event has a future start/end date
    const endDate = event?.endDate || event?.end_date_iso;
    if (endDate && new Date(endDate).getTime() > Date.now()) return "UPCOMING";
    return "ENDED";
  }, [event, allMarkets, tradableMarkets]);

  const groups = useMemo(() => groupMarkets(tradableMarkets), [tradableMarkets]);

  // Auto-select first group
  useEffect(() => {
    if (groups.length > 0 && !activeGroupId) {
      setActiveGroupId(groups[0].id);
    }
  }, [groups, activeGroupId]);

  // Auto-select first market (only if none pre-selected via query param)
  useEffect(() => {
    if (tradableMarkets.length > 0 && !selectedConditionId) {
      setSelectedConditionId(tradableMarkets[0].condition_id);
    }
    // If preselected market exists, validate it's in the list
    if (preselectedMarket && tradableMarkets.length > 0 && !tradableMarkets.find(m => m.condition_id === preselectedMarket)) {
      setSelectedConditionId(tradableMarkets[0].condition_id);
    }
  }, [tradableMarkets, selectedConditionId, preselectedMarket]);

  // Reset on event change
  useEffect(() => {
    setSelectedConditionId(null);
    setActiveGroupId(null);
  }, [eventId]);

  // Subscribe all token IDs to WebSocket
  useEffect(() => {
    if (tradableMarkets.length === 0) return;
    const tokenIds = new Set<string>();
    tradableMarkets.forEach((m) => {
      if (m.clobTokenIds?.[0]) tokenIds.add(m.clobTokenIds[0]);
      if (m.clobTokenIds?.[1]) tokenIds.add(m.clobTokenIds[1]);
    });
    const unsubs = [...tokenIds].map((id) => orderbookWsService.subscribe(id, () => {}));
    return () => unsubs.forEach((u) => u());
  }, [tradableMarkets]);

  const selected = tradableMarkets.find((m) => m.condition_id === selectedConditionId) ?? tradableMarkets[0];
  const yesTokenId = selected?.clobTokenIds?.[0] ?? "";
  const noTokenId = selected?.clobTokenIds?.[1] ?? "";

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    toast.success("Link copied to clipboard");
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!event) {
    return (
      <div className="container py-16 text-center">
        <p className="text-muted-foreground">Event not found.</p>
        <Link to="/events" className="text-primary text-sm mt-2 inline-block hover:underline">
          ← Back to events
        </Link>
      </div>
    );
  }

  const title = event.title || event.question || "Untitled Event";
  const pmSlug = event.slug || eventId;
  const pmUrl = pmSlug ? `https://polymarket.com/event/${pmSlug}` : null;
  const totalVol = allMarkets.reduce((s, m) => s + m.totalVolume, 0);
  const totalLiq = allMarkets.reduce((s, m) => s + m.liquidity, 0);

  // Live data badges
  const sportsSlug = extractSportsSlug(tradableMarkets[0]?.tags, pmSlug || "");
  const cryptoSym = extractCryptoSymbol(title, tradableMarkets[0]?.tags);

  // Determine if this is a simple multi-outcome (like "Who will win?") or complex with groups
  const hasMultipleGroups = groups.length > 1;
  const activeGroup = groups.find((g) => g.id === activeGroupId) ?? groups[0];

  // Get the earliest end date from markets
  const endDate = allMarkets
    .map((m) => m.end_date_iso)
    .filter(Boolean)
    .sort()[0];

  return (
    <div className="min-h-screen">
      <div className="container py-6 max-w-7xl">
        {/* Navigation bar */}
        <div className="flex items-center justify-between mb-4">
          <Link
            to="/events"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" /> Events
          </Link>
          <div className="flex items-center gap-2">
            <button
              onClick={handleShare}
              className="rounded-md border border-border p-2 hover:bg-accent transition-all"
            >
              <Share2 className="h-4 w-4 text-muted-foreground" />
            </button>
            {pmUrl && (
              <a
                href={pmUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors border border-border rounded-lg px-3 py-2"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Polymarket
              </a>
            )}
          </div>
        </div>

        {/* Event header */}
        <div className="mb-6">
          <div className="flex items-start gap-4 mb-3">
            {event.image && (
              <img src={event.image} alt="" className="h-14 w-14 rounded-xl bg-muted shrink-0 object-cover" />
            )}
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold leading-snug">{title}</h1>
              {event.description && (
                <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{event.description}</p>
              )}
            </div>
          </div>

          {/* Live data badges */}
          {sportsSlug && <div className="mb-3"><SportScoreBadge sportsSlug={sportsSlug} /></div>}
          {cryptoSym && <div className="mb-3"><CryptoPriceBadge symbol={cryptoSym} /></div>}

          {/* Stats row */}
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-1 rounded-md bg-muted px-2 py-1">
              <BarChart3 className="h-3 w-3" />
              <span className="font-mono text-foreground">{formatVol(totalVol)}</span>
              <span>vol</span>
            </div>
            <div className="flex items-center gap-1 rounded-md bg-muted px-2 py-1">
              <Droplets className="h-3 w-3" />
              <span className="font-mono text-foreground">{formatVol(totalLiq)}</span>
              <span>liq</span>
            </div>
            <div className="flex items-center gap-1 rounded-md bg-muted px-2 py-1">
              <Layers className="h-3 w-3" />
              <span className="font-mono text-foreground">{tradableMarkets.length}</span>
              <span>market{tradableMarkets.length !== 1 ? "s" : ""}</span>
            </div>
            {endDate && (
              <div className="flex items-center gap-1 rounded-md bg-muted px-2 py-1">
                <Calendar className="h-3 w-3" />
                <span className="font-mono text-foreground">{timeUntil(endDate)}</span>
              </div>
            )}
            {eventUIStatus === "LIVE" && (
              <span className="rounded-full bg-yes/10 border border-yes/20 px-2 py-0.5 text-[10px] font-mono text-yes inline-flex items-center gap-1">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yes opacity-75" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-yes" />
                </span>
                LIVE
              </span>
            )}
            {eventUIStatus === "UPCOMING" && (
              <span className="rounded-full bg-primary/10 border border-primary/20 px-2 py-0.5 text-[10px] font-mono text-primary">
                UPCOMING
              </span>
            )}
            {eventUIStatus === "ENDED" && (
              <span className="rounded-full bg-destructive/10 border border-destructive/20 px-2 py-0.5 text-[10px] font-mono text-destructive">
                ENDED
              </span>
            )}
          </div>
        </div>

        {/* Main two-column layout */}
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Left column: Market groups */}
          <div className="flex-1 min-w-0">

            {/* Category tabs (only if multiple groups) */}
            {hasMultipleGroups && (
              <div className="flex gap-1 mb-4 overflow-x-auto pb-1">
                {groups.map((g) => (
                  <button
                    key={g.id}
                    onClick={() => setActiveGroupId(g.id)}
                    className={cn(
                      "rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-all",
                      activeGroupId === g.id
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {g.label}
                    <span className="ml-1 opacity-60">({g.markets.length})</span>
                  </button>
                ))}
                {/* "All" button */}
                <button
                  onClick={() => setActiveGroupId("__all__")}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-all",
                    activeGroupId === "__all__"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:text-foreground"
                  )}
                >
                  All
                  <span className="ml-1 opacity-60">({tradableMarkets.length})</span>
                </button>
              </div>
            )}

            {/* Markets display */}
            {activeGroupId === "__all__" || !hasMultipleGroups ? (
              /* Leaderboard view for all markets or single-group events */
              <div className="space-y-0.5 mb-4">
                {/* Header */}
                <div className="flex items-center gap-3 px-3 py-1.5 text-[10px] text-muted-foreground uppercase tracking-wider border-b border-border mb-1">
                  <span className="w-5 shrink-0">#</span>
                  <span className="flex-1">Market</span>
                  <span className="w-14 text-right">Prob</span>
                  <span className="w-10 text-right">Yes</span>
                  <span className="w-10 text-right hidden sm:block">No</span>
                  <span className="w-14 text-right hidden md:block">24h Vol</span>
                </div>
                <div className="max-h-[55vh] overflow-y-auto space-y-0.5">
                  {(activeGroupId === "__all__" ? tradableMarkets : (activeGroup?.markets ?? tradableMarkets)).map((m, idx) => (
                    <CandidateRow
                      key={m.condition_id}
                      market={m}
                      rank={idx + 1}
                      selected={m.condition_id === selectedConditionId}
                      onSelect={() => setSelectedConditionId(m.condition_id)}
                    />
                  ))}
                </div>
              </div>
            ) : (
              /* Card grid for categorized groups */
              <div className="grid gap-2 sm:grid-cols-2 mb-4 max-h-[55vh] overflow-y-auto">
                {(activeGroup?.markets ?? []).map((m) => (
                  <EventMarketCard
                    key={m.condition_id}
                    market={m}
                    selected={m.condition_id === selectedConditionId}
                    onSelect={() => setSelectedConditionId(m.condition_id)}
                  />
                ))}
              </div>
            )}

            {tradableMarkets.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">No live markets for this event.</p>
            )}

            {/* Orderbook + Trades tabs for selected market */}
            {selected && (
              <div className="mt-2">
                <div className="flex items-center gap-2 mb-3">
                  <p className="text-xs text-muted-foreground truncate flex-1">
                    <span className="text-foreground font-medium">Selected:</span>{" "}
                    {selected.question}
                  </p>
                </div>
                <Tabs value={detailTab} onValueChange={(v) => setDetailTab(v as any)}>
                  <TabsList className="w-full">
                    <TabsTrigger value="orderbook" className="flex-1">Orderbook</TabsTrigger>
                    <TabsTrigger value="trades" className="flex-1">Activity</TabsTrigger>
                  </TabsList>
                  <TabsContent value="orderbook" className="mt-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <LiveOrderbook tokenId={yesTokenId || undefined} outcome="Yes" />
                      <LiveOrderbook tokenId={noTokenId || undefined} outcome="No" />
                    </div>
                  </TabsContent>
                  <TabsContent value="trades" className="mt-3">
                    <RecentTradesPanel
                      conditionId={selected.condition_id}
                      tokenId={yesTokenId || undefined}
                    />
                  </TabsContent>
                </Tabs>
              </div>
            )}
          </div>

          {/* Right column: Trading sidebar */}
          <div className="lg:w-80 shrink-0">
            <div className="lg:sticky lg:top-20 space-y-4">
              {selected ? (
                <div className="rounded-xl border border-border bg-card p-4">
                  <h3 className="text-sm font-semibold mb-1 line-clamp-2">{selected.question}</h3>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="rounded-md bg-yes/15 border border-yes/25 px-2 py-0.5 text-xs font-mono font-semibold text-yes">
                      Yes {Math.round((selected.outcomePrices?.[0] ?? 0.5) * 100)}¢
                    </span>
                    <span className="rounded-md bg-no/15 border border-no/25 px-2 py-0.5 text-xs font-mono font-semibold text-no">
                      No {Math.round((selected.outcomePrices?.[1] ?? 0.5) * 100)}¢
                    </span>
                  </div>
                  <OrderTicket
                    yesTokenId={yesTokenId}
                    noTokenId={noTokenId}
                    yesPrice={selected.outcomePrices?.[0] ?? 0.5}
                    noPrice={selected.outcomePrices?.[1] ?? 0.5}
                    conditionId={selected.condition_id}
                    isTradable={selected.statusLabel === "LIVE"}
                  />
                </div>
              ) : (
                <div className="rounded-xl border border-border bg-card p-6 text-center">
                  <TrendingUp className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Select a market to trade</p>
                </div>
              )}

              {/* Quick links to other markets in event */}
              {tradableMarkets.length > 3 && selected && (
                <div className="rounded-xl border border-border bg-card p-3">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Other Markets</p>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {tradableMarkets
                      .filter((m) => m.condition_id !== selectedConditionId)
                      .slice(0, 8)
                      .map((m) => {
                        const p = Math.round((m.outcomePrices?.[0] ?? 0.5) * 100);
                        return (
                          <button
                            key={m.condition_id}
                            onClick={() => setSelectedConditionId(m.condition_id)}
                            className="w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted/50 transition-colors"
                          >
                            <span className="text-xs truncate flex-1">{m.question}</span>
                            <span className="text-xs font-mono text-primary shrink-0">{p}¢</span>
                          </button>
                        );
                      })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EventDetail;
