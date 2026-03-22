import { useState, useEffect, useMemo } from "react";
import { useParams, Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchEventById, isBytes32Hex, type NormalizedMarket } from "@/lib/polymarket-api";
import { normalizeMarkets } from "@/lib/normalizePolymarket";
import { groupMarkets } from "@/lib/market-grouping";
import { orderbookWsService } from "@/services/orderbook-ws.service";
import { useMarketStore } from "@/stores/useMarketStore";
import { EventMarketCard } from "@/components/markets/EventMarketCard";
import { EventPriceChart } from "@/components/markets/EventPriceChart";
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
  Clock,
  Info,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { LiveOrderbook } from "@/components/trading/LiveOrderbook";
import { RecentTradesPanel } from "@/components/trades/RecentTradesPanel";
import { OrderTicket } from "@/components/trading/OrderTicket";
import { SportScoreBadge } from "@/components/markets/SportScoreBadge";
import { CryptoPriceBadge } from "@/components/markets/CryptoPriceBadge";
import { extractSportsSlug, extractCryptoSymbol } from "@/lib/live-data-utils";
import { extractEventMarketLabel } from "@/lib/event-market-display";
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

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString([], {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

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
  const noTokenId = market.clobTokenIds?.[1];
  const wsPrice = useMarketStore((s) => (tokenId ? s.assets[tokenId]?.lastTradePrice : null));
  const wsNo = useMarketStore((s) => (noTokenId ? s.assets[noTokenId]?.lastTradePrice : null));
  const price = wsPrice ?? market.outcomePrices?.[0] ?? null;
  const noPrice = wsNo ?? market.outcomePrices?.[1] ?? null;
  const pct = price !== null ? Math.round(price * 1000) / 10 : null;
  const noPct = noPrice !== null ? Math.round(noPrice * 1000) / 10 : null;
  const displayLabel = extractEventMarketLabel(market.question);

  return (
    <button
      onClick={onSelect}
      className={cn(
        "w-full flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-3 text-left transition-all rounded-xl group",
        selected
          ? "bg-primary/8 border border-primary/30 shadow-sm shadow-primary/5"
          : "hover:bg-muted/60 border border-transparent hover:border-border/50"
      )}
    >
      <span
        className={cn(
          "text-xs font-bold font-mono w-6 h-6 rounded-full flex items-center justify-center shrink-0",
          rank <= 3 ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
        )}
      >
        {rank}
      </span>

      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium break-words leading-snug block">{displayLabel}</span>
        <div className="h-1.5 rounded-full bg-muted overflow-hidden mt-1.5 max-w-[200px]">
          {pct !== null ? (
            <motion.div
              className={cn("h-full rounded-full", pct >= 50 ? "bg-yes" : "bg-no")}
              initial={false}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.4 }}
            />
          ) : (
            <div className="h-full w-1/3 rounded-full bg-muted-foreground/20 animate-pulse" />
          )}
        </div>
      </div>

      <AnimatePresence mode="popLayout">
        {pct !== null ? (
          <motion.span
            key={pct}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.15 }}
            className="text-lg font-bold font-mono text-foreground w-14 text-right shrink-0"
          >
            {pct}%
          </motion.span>
        ) : (
          <div className="h-6 w-12 rounded bg-muted animate-pulse" />
        )}
      </AnimatePresence>

      <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
        <span className="rounded-md bg-yes/15 border border-yes/25 px-1.5 sm:px-2 py-1 text-[11px] sm:text-xs font-mono font-bold text-yes min-w-[44px] sm:min-w-[56px] text-center">
          {pct !== null ? `${Math.round(price * 100)}¢` : "—"}
        </span>
        <span className="rounded-md bg-no/15 border border-no/25 px-1.5 sm:px-2 py-1 text-[11px] sm:text-xs font-mono font-bold text-no min-w-[44px] sm:min-w-[56px] text-center">
          {noPct !== null ? `${Math.round((noPrice ?? 0) * 100)}¢` : "—"}
        </span>
      </div>

      <span className="text-[10px] text-muted-foreground font-mono w-14 text-right shrink-0 hidden md:block">
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
  const [showDescription, setShowDescription] = useState(false);

  const [, setTick] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(iv);
  }, []);

  const { data: event, isLoading, refetch } = useQuery({
    queryKey: ["polymarket-event", eventId],
    queryFn: () => fetchEventById(eventId!),
    enabled: !!eventId,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  const allMarkets = useMemo(() => {
    if (!event?.markets) return [];
    return normalizeMarkets(event.markets).filter((m) => isBytes32Hex(m.condition_id));
  }, [event]);

  const tradableMarkets = useMemo(
    () =>
      allMarkets
        .filter((m) => m.statusLabel === "LIVE" || (m.active && !m.closed && !m.ended))
        .sort((a, b) => (b.outcomePrices?.[0] ?? -1) - (a.outcomePrices?.[0] ?? -1)),
    [allMarkets]
  );

  type EventUIStatus = "LIVE" | "UPCOMING" | "ENDED";
  const eventUIStatus: EventUIStatus = useMemo(() => {
    if (event?.resolved === true) return "ENDED";
    if (
      allMarkets.length > 0 &&
      allMarkets.every(
        (m) => m.statusLabel === "ENDED" || m.statusLabel === "ARCHIVED" || m.statusLabel === "CLOSED"
      )
    )
      return "ENDED";
    if (tradableMarkets.length > 0) return "LIVE";
    const ed = event?.endDate || event?.end_date_iso;
    if (ed && new Date(ed).getTime() > Date.now()) return "UPCOMING";
    return "ENDED";
  }, [event, allMarkets, tradableMarkets]);

  const groups = useMemo(() => groupMarkets(tradableMarkets), [tradableMarkets]);

  useEffect(() => {
    if (groups.length > 0 && !activeGroupId) setActiveGroupId(groups[0].id);
  }, [groups, activeGroupId]);

  useEffect(() => {
    if (tradableMarkets.length > 0 && !selectedConditionId) {
      setSelectedConditionId(tradableMarkets[0].condition_id);
    }
    if (
      preselectedMarket &&
      tradableMarkets.length > 0 &&
      !tradableMarkets.find((m) => m.condition_id === preselectedMarket)
    ) {
      setSelectedConditionId(tradableMarkets[0].condition_id);
    }
  }, [tradableMarkets, selectedConditionId, preselectedMarket]);

  useEffect(() => {
    setSelectedConditionId(null);
    setActiveGroupId(null);
  }, [eventId]);

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
  const selectedYesWs = useMarketStore((s) => (yesTokenId ? s.assets[yesTokenId]?.lastTradePrice : null));
  const selectedNoWs = useMarketStore((s) => (noTokenId ? s.assets[noTokenId]?.lastTradePrice : null));
  const selectedYesPrice = selected ? selectedYesWs ?? selected.outcomePrices?.[0] ?? null : null;
  const selectedNoPrice = selected ? selectedNoWs ?? selected.outcomePrices?.[1] ?? null : null;
  const selectedDisplayLabel = selected ? extractEventMarketLabel(selected.question) : "";

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
        <p className="text-muted-foreground">Event not found. It may have ended or been removed.</p>
        <div className="mt-3 flex items-center justify-center gap-3">
          <button onClick={() => refetch()} className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent transition-all">
            Retry
          </button>
          <Link to="/events" className="text-primary text-sm inline-block hover:underline">
            Browse live markets
          </Link>
        </div>
      </div>
    );
  }

  const title = event.title || event.question || "Untitled Event";
  const pmSlug = event.slug || eventId;
  const pmUrl = pmSlug ? `https://polymarket.com/event/${pmSlug}` : null;
  const totalVol = allMarkets.reduce((s, m) => s + m.totalVolume, 0);
  const totalLiq = allMarkets.reduce((s, m) => s + m.liquidity, 0);
  const sportsSlug = extractSportsSlug(tradableMarkets[0]?.tags, pmSlug || "");
  const cryptoSym = extractCryptoSymbol(title, tradableMarkets[0]?.tags);
  const hasMultipleGroups = groups.length > 1;
  const activeGroup = groups.find((g) => g.id === activeGroupId) ?? groups[0];

  const endDate = allMarkets
    .map((m) => m.end_date_iso)
    .filter(Boolean)
    .sort()[0];
  const gameStartTime = allMarkets
    .map((m) => m.game_start_time)
    .filter(Boolean)
    .sort()[0];

  const description = event.description || "";
  const resolutionSource = event.resolution_source || event.resolutionSource || "";

  return (
    <div className="min-h-screen">
      <div className="container px-3 sm:px-4 py-4 sm:py-6 max-w-7xl">
        <div className="flex items-center justify-between mb-5">
          <Link
            to="/events"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" /> Events
          </Link>
          <div className="flex items-center gap-2">
            <button
              onClick={handleShare}
              className="rounded-lg border border-border p-2 hover:bg-accent transition-all"
            >
              <Share2 className="h-4 w-4 text-muted-foreground" />
            </button>
            {pmUrl && (
              <a
                href={pmUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors border border-border rounded-lg px-3 py-2 hover:border-primary/30"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                View on Polymarket
              </a>
            )}
          </div>
        </div>

        <div className="mb-6 rounded-2xl border border-border bg-card p-5">
          <div className="flex items-start gap-4 mb-4">
            {event.image && (
              <img
                src={event.image}
                alt=""
                className="h-16 w-16 rounded-xl bg-muted shrink-0 object-cover ring-2 ring-border"
              />
            )}
            <div className="flex-1 min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold leading-snug break-words">{title}</h1>

              <div className="flex flex-wrap items-center gap-2.5 mt-2">
                {gameStartTime && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted rounded-lg px-2.5 py-1">
                    <Clock className="h-3 w-3" />
                    <span>{formatDate(gameStartTime)}</span>
                  </div>
                )}
                {endDate && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted rounded-lg px-2.5 py-1">
                    <Calendar className="h-3 w-3" />
                    <span>
                      {eventUIStatus === "ENDED" ? "Ended" : `Ends ${timeUntil(endDate)}`}
                    </span>
                  </div>
                )}
                {eventUIStatus === "LIVE" && (
                  <span className="rounded-full bg-yes/15 border border-yes/30 px-3 py-1 text-xs font-bold font-mono text-yes inline-flex items-center gap-1.5">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yes opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-yes" />
                    </span>
                    LIVE
                  </span>
                )}
                {eventUIStatus === "UPCOMING" && (
                  <span className="rounded-full bg-primary/15 border border-primary/30 px-3 py-1 text-xs font-bold font-mono text-primary">
                    UPCOMING
                  </span>
                )}
                {eventUIStatus === "ENDED" && (
                  <span className="rounded-full bg-destructive/15 border border-destructive/30 px-3 py-1 text-xs font-bold font-mono text-destructive">
                    ENDED
                  </span>
                )}
              </div>
            </div>
          </div>

          {sportsSlug && (
            <div className="mb-3">
              <SportScoreBadge sportsSlug={sportsSlug} />
            </div>
          )}
          {cryptoSym && (
            <div className="mb-3">
              <CryptoPriceBadge symbol={cryptoSym} />
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 mb-3">
            <div className="flex items-center gap-2 rounded-xl bg-muted/70 border border-border px-4 py-2.5">
              <BarChart3 className="h-4 w-4 text-primary" />
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Volume</p>
                <p className="text-sm font-bold font-mono text-foreground">{formatVol(totalVol)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-xl bg-muted/70 border border-border px-4 py-2.5">
              <Droplets className="h-4 w-4 text-primary" />
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Liquidity</p>
                <p className="text-sm font-bold font-mono text-foreground">{formatVol(totalLiq)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-xl bg-muted/70 border border-border px-4 py-2.5">
              <Layers className="h-4 w-4 text-primary" />
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Markets</p>
                <p className="text-sm font-bold font-mono text-foreground">{tradableMarkets.length}</p>
              </div>
            </div>
          </div>

          {description && (
            <div>
              <button
                onClick={() => setShowDescription((v) => !v)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <Info className="h-3.5 w-3.5" />
                <span>Event details</span>
                {showDescription ? (
                  <ChevronUp className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
              </button>
              <AnimatePresence>
                {showDescription && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="mt-2 rounded-xl bg-background border border-border p-4 overflow-hidden"
                  >
                    <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">
                      {description}
                    </p>
                    {resolutionSource && (
                      <p className="text-[10px] text-muted-foreground/60 mt-2">
                        Resolution source: {resolutionSource}
                      </p>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>

        <div className="flex flex-col lg:flex-row gap-4 lg:gap-6">
          <div className="flex-1 min-w-0 space-y-5">
            {selected && (
              <EventPriceChart
                market={selected}
                allMarkets={tradableMarkets}
              />
            )}

            {hasMultipleGroups && (
              <ScrollArea className="w-full">
                <div className="flex gap-1.5 pb-2">
                  {groups.map((g) => (
                    <button
                      key={g.id}
                      onClick={() => setActiveGroupId(g.id)}
                      className={cn(
                        "rounded-xl px-4 py-2 text-xs font-semibold whitespace-nowrap transition-all",
                        activeGroupId === g.id
                          ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                          : "bg-muted text-muted-foreground hover:text-foreground hover:bg-accent"
                      )}
                    >
                      {g.label}
                      <span className="ml-1.5 opacity-60">({g.markets.length})</span>
                    </button>
                  ))}
                  <button
                    onClick={() => setActiveGroupId("__all__")}
                    className={cn(
                      "rounded-xl px-4 py-2 text-xs font-semibold whitespace-nowrap transition-all",
                      activeGroupId === "__all__"
                        ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                        : "bg-muted text-muted-foreground hover:text-foreground hover:bg-accent"
                    )}
                  >
                    All
                    <span className="ml-1.5 opacity-60">({tradableMarkets.length})</span>
                  </button>
                </div>
                <ScrollBar orientation="horizontal" />
              </ScrollArea>
            )}

            {activeGroupId === "__all__" || !hasMultipleGroups ? (
              <div className="space-y-1">
                <div className="flex items-center gap-3 px-4 py-2 text-[10px] text-muted-foreground uppercase tracking-wider border-b border-border mb-1">
                  <span className="w-6 shrink-0">#</span>
                  <span className="flex-1">Candidate</span>
                  <span className="w-14 text-right">Prob</span>
                  <span className="w-24 text-right">Yes / No</span>
                  <span className="w-14 text-right hidden md:block">24h Vol</span>
                </div>
                <div className="max-h-[55vh] overflow-y-auto space-y-0.5 pr-1">
                  {(activeGroupId === "__all__"
                    ? tradableMarkets
                    : activeGroup?.markets ?? tradableMarkets
                  ).map((m, idx) => (
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
              <div className="space-y-5">
                {(activeGroup ? [activeGroup] : groups).map((group) => (
                  <div key={group.id}>
                    <h3 className="text-sm font-bold text-foreground mb-3 px-1 flex items-center gap-2">
                      {group.label}
                      <span className="text-xs font-normal text-muted-foreground">
                        {group.markets.length} market{group.markets.length !== 1 ? "s" : ""}
                      </span>
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                      {group.markets.map((m) => (
                        <EventMarketCard
                          key={m.condition_id}
                          market={m}
                          selected={m.condition_id === selectedConditionId}
                          onSelect={() => setSelectedConditionId(m.condition_id)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {tradableMarkets.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">
                No live markets for this event.
              </p>
            )}

            {selected && (
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center gap-2 mb-3">
                  <p className="text-xs text-muted-foreground truncate flex-1">
                    <span className="text-foreground font-semibold">Selected:</span> {selectedDisplayLabel}
                  </p>
                </div>
                <Tabs value={detailTab} onValueChange={(v) => setDetailTab(v as any)}>
                  <TabsList className="w-full">
                    <TabsTrigger value="orderbook" className="flex-1">
                      Orderbook
                    </TabsTrigger>
                    <TabsTrigger value="trades" className="flex-1">
                      Activity
                    </TabsTrigger>
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

          <div className="w-full lg:w-[340px] shrink-0">
            <div className="lg:sticky lg:top-20 space-y-4">
              {selected ? (
                <div className="rounded-2xl border border-border bg-card p-5 shadow-lg shadow-black/10">
                  <h3 className="text-sm font-bold mb-2 line-clamp-2">{selectedDisplayLabel}</h3>

                  <div className="flex items-center gap-2 mb-4">
                    <div className="flex-1 rounded-xl bg-yes/10 border border-yes/20 p-3 text-center">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Yes</p>
                      {selectedYesPrice !== null ? (
                        <p className="text-xl font-bold font-mono text-yes">
                          {Math.round(selectedYesPrice * 100)}¢
                        </p>
                      ) : (
                        <div className="mx-auto h-7 w-14 rounded bg-muted animate-pulse" />
                      )}
                    </div>
                    <div className="flex-1 rounded-xl bg-no/10 border border-no/20 p-3 text-center">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">No</p>
                      {selectedNoPrice !== null ? (
                        <p className="text-xl font-bold font-mono text-no">
                          {Math.round(selectedNoPrice * 100)}¢
                        </p>
                      ) : (
                        <div className="mx-auto h-7 w-14 rounded bg-muted animate-pulse" />
                      )}
                    </div>
                  </div>

                  <OrderTicket
                    yesTokenId={yesTokenId}
                    noTokenId={noTokenId}
                    yesPrice={selectedYesPrice}
                    noPrice={selectedNoPrice}
                    conditionId={selected.condition_id}
                    isTradable={selected.statusLabel === "LIVE" && selectedYesPrice !== null && selectedNoPrice !== null}
                  />
                </div>
              ) : (
                <div className="rounded-2xl border border-border bg-card p-8 text-center">
                  <TrendingUp className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground font-medium">Select a market to trade</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">
                    Click any market from the list
                  </p>
                </div>
              )}

              {tradableMarkets.length > 3 && selected && (
                <div className="rounded-2xl border border-border bg-card p-4">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-3">
                    Other Markets
                  </p>
                  <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                    {tradableMarkets
                      .filter((m) => m.condition_id !== selectedConditionId)
                      .slice(0, 10)
                      .map((m) => {
                        const p = m.outcomePrices?.[0] !== undefined ? Math.round(m.outcomePrices[0] * 1000) / 10 : null;
                        return (
                          <button
                            key={m.condition_id}
                            onClick={() => setSelectedConditionId(m.condition_id)}
                            className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-muted/60 transition-colors group"
                          >
                            <span className="text-xs truncate flex-1 group-hover:text-foreground transition-colors">{extractEventMarketLabel(m.question)}</span>
                            <span className="text-xs font-mono font-bold text-primary shrink-0">{p !== null ? `${p}%` : "—"}</span>
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
