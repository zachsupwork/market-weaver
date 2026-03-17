import { useState, useEffect, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchEventById, isBytes32Hex, type NormalizedMarket } from "@/lib/polymarket-api";
import { normalizeMarkets } from "@/lib/normalizePolymarket";
import { orderbookWsService } from "@/services/orderbook-ws.service";
import { useMarketStore } from "@/stores/useMarketStore";
import { ArrowLeft, Loader2, BarChart3, TrendingUp, Droplets, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LiveOrderbook } from "@/components/trading/LiveOrderbook";
import { RecentTradesPanel } from "@/components/trades/RecentTradesPanel";
import { OrderTicket } from "@/components/trading/OrderTicket";
import { motion, AnimatePresence } from "framer-motion";

function formatVol(n: number): string {
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

/** Candidate row in the leaderboard */
function CandidateRow({
  market,
  selected,
  onSelect,
}: {
  market: NormalizedMarket;
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
        "w-full flex items-center gap-3 px-4 py-2.5 text-left transition-all rounded-lg",
        selected
          ? "bg-primary/10 border border-primary/30"
          : "hover:bg-muted/50 border border-transparent"
      )}
    >
      <span className="flex-1 text-sm font-medium truncate">{market.question}</span>
      <div className="w-16 shrink-0">
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
          {pct}%
        </motion.span>
      </AnimatePresence>
      <span className="text-xs text-muted-foreground font-mono w-16 text-right shrink-0 hidden sm:block">
        {formatVol(market.volume24h)}
      </span>
    </button>
  );
}

const EventDetail = () => {
  const { eventId } = useParams<{ eventId: string }>();
  const [selectedIdx, setSelectedIdx] = useState(0);

  const { data: event, isLoading } = useQuery({
    queryKey: ["polymarket-event", eventId],
    queryFn: () => fetchEventById(eventId!),
    enabled: !!eventId,
    staleTime: 30_000,
  });

  const markets = useMemo(() => {
    if (!event?.markets) return [];
    const all = normalizeMarkets(event.markets);
    return all
      .filter((m) => isBytes32Hex(m.condition_id))
      .sort((a, b) => (b.outcomePrices?.[0] ?? 0) - (a.outcomePrices?.[0] ?? 0));
  }, [event]);

  const liveMarkets = useMemo(
    () => markets.filter((m) => m.statusLabel === "LIVE"),
    [markets]
  );

  // Subscribe all token IDs to WebSocket for live prices
  useEffect(() => {
    if (liveMarkets.length === 0) return;
    const tokenIds = new Set<string>();
    liveMarkets.forEach((m) => {
      if (m.clobTokenIds?.[0]) tokenIds.add(m.clobTokenIds[0]);
      if (m.clobTokenIds?.[1]) tokenIds.add(m.clobTokenIds[1]);
    });
    const unsubs = [...tokenIds].map((id) => orderbookWsService.subscribe(id, () => {}));
    return () => unsubs.forEach((u) => u());
  }, [liveMarkets]);

  // Reset selection when markets change
  useEffect(() => {
    setSelectedIdx(0);
  }, [eventId]);

  const selected = liveMarkets[selectedIdx] ?? liveMarkets[0];
  const yesTokenId = selected?.clobTokenIds?.[0] ?? "";
  const noTokenId = selected?.clobTokenIds?.[1] ?? "";

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
  const totalVol = markets.reduce((s, m) => s + m.totalVolume, 0);
  const totalLiq = markets.reduce((s, m) => s + m.liquidity, 0);

  return (
    <div className="min-h-screen">
      <div className="container py-6 max-w-7xl">
        {/* Back link */}
        <Link
          to="/events"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft className="h-4 w-4" /> Events
        </Link>

        {/* Header */}
        <div className="mb-6">
          <div className="flex items-start gap-4 mb-3">
            {event.image && (
              <img src={event.image} alt="" className="h-14 w-14 rounded-xl bg-muted shrink-0 object-cover" />
            )}
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold mb-0.5">{title}</h1>
              {event.description && (
                <p className="text-xs text-muted-foreground line-clamp-2">{event.description}</p>
              )}
            </div>
            {pmUrl && (
              <a
                href={pmUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors shrink-0 border border-border rounded-lg px-3 py-1.5"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Polymarket
              </a>
            )}
          </div>

          {/* Stats */}
          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <BarChart3 className="h-3.5 w-3.5" />
              <span className="font-mono font-semibold text-foreground">{formatVol(totalVol)}</span>
              vol
            </div>
            <div className="flex items-center gap-1">
              <Droplets className="h-3.5 w-3.5" />
              <span className="font-mono font-semibold text-foreground">{formatVol(totalLiq)}</span>
              liq
            </div>
            <div className="flex items-center gap-1">
              <span className="font-semibold text-foreground">{liveMarkets.length}</span>
              candidate{liveMarkets.length !== 1 ? "s" : ""}
            </div>
            {liveMarkets.length > 0 && (
              <span className="rounded-full bg-yes/10 border border-yes/20 px-2 py-0.5 text-[10px] font-mono text-yes">
                LIVE
              </span>
            )}
          </div>
        </div>

        {/* Main layout: two columns */}
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Left: Leaderboard + Tabs */}
          <div className="flex-1 min-w-0">
            {/* Leaderboard header */}
            <div className="flex items-center gap-3 px-4 py-2 text-xs text-muted-foreground border-b border-border mb-1">
              <span className="flex-1">Candidate</span>
              <span className="w-16 text-right">Prob</span>
              <span className="w-10" />
              <span className="w-16 text-right hidden sm:block">24h Vol</span>
            </div>

            {/* Candidate rows */}
            <div className="space-y-0.5 mb-4 max-h-[50vh] overflow-y-auto">
              {liveMarkets.map((m, idx) => (
                <CandidateRow
                  key={m.condition_id}
                  market={m}
                  selected={idx === selectedIdx}
                  onSelect={() => setSelectedIdx(idx)}
                />
              ))}
              {liveMarkets.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">No live candidates.</p>
              )}
            </div>

            {/* Orderbook + Trades tabs */}
            {selected && (
              <Tabs defaultValue="orderbook" className="mt-2">
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
            )}
          </div>

          {/* Right: Trading sidebar */}
          <div className="lg:w-80 shrink-0">
            <div className="lg:sticky lg:top-20">
              {selected ? (
                <div className="rounded-xl border border-border bg-card p-4">
                  <h3 className="text-sm font-semibold mb-3 line-clamp-2">{selected.question}</h3>
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
                  <p className="text-sm text-muted-foreground">Select a candidate to trade</p>
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
