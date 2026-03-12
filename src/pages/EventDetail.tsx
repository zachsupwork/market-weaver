import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchEventById, isBytes32Hex, type NormalizedMarket } from "@/lib/polymarket-api";
import { normalizeMarkets } from "@/lib/normalizePolymarket";
import { ArrowLeft, Loader2, BarChart3, TrendingUp, Droplets, ExternalLink, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import { QuickTradeModal } from "@/components/markets/QuickTradeModal";

function formatVol(n: number): string {
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function formatPrice(p: number | undefined): string {
  if (p === undefined || p === null || isNaN(p)) return "—";
  return `${Math.round(p * 100)}¢`;
}

const EventDetail = () => {
  const { eventId } = useParams<{ eventId: string }>();
  const [tradeModal, setTradeModal] = useState<{ market: NormalizedMarket; outcome: number } | null>(null);

  const { data: event, isLoading } = useQuery({
    queryKey: ["polymarket-event", eventId],
    queryFn: () => fetchEventById(eventId!),
    enabled: !!eventId,
    staleTime: 30_000,
  });

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
  const rawMarkets = event.markets || [];
  const markets = normalizeMarkets(rawMarkets);
  const liveMarkets = markets.filter(m => isBytes32Hex(m.condition_id) && m.statusLabel === "LIVE");
  const endedMarkets = markets.filter(m => m.statusLabel !== "LIVE");
  const pmSlug = event.slug || eventId;
  const pmUrl = pmSlug ? `https://polymarket.com/event/${pmSlug}` : null;
  const totalVol = markets.reduce((s, m) => s + m.totalVolume, 0);
  const totalLiq = markets.reduce((s, m) => s + m.liquidity, 0);

  return (
    <div className="min-h-screen">
      <div className="container py-8 max-w-5xl">
        <Link
          to="/events"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft className="h-4 w-4" /> Events
        </Link>

        {/* Event Header */}
        <div className="mb-8">
          <div className="flex items-start gap-4 mb-4">
            {event.image && (
              <img src={event.image} alt="" className="h-16 w-16 rounded-xl bg-muted shrink-0 object-cover" />
            )}
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-bold mb-1">{title}</h1>
              {event.description && (
                <p className="text-sm text-muted-foreground line-clamp-3">{event.description}</p>
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

          {/* Stats bar */}
          <div className="flex flex-wrap gap-4">
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <BarChart3 className="h-4 w-4" />
              <span className="font-mono font-semibold text-foreground">{formatVol(totalVol)}</span>
              <span>volume</span>
            </div>
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Droplets className="h-4 w-4" />
              <span className="font-mono font-semibold text-foreground">{formatVol(totalLiq)}</span>
              <span>liquidity</span>
            </div>
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">{markets.length}</span>
              <span>market{markets.length !== 1 ? "s" : ""}</span>
            </div>
            {liveMarkets.length > 0 && (
              <span className="rounded-full bg-yes/10 border border-yes/20 px-2.5 py-0.5 text-xs font-mono text-yes">
                {liveMarkets.length} LIVE
              </span>
            )}
          </div>

          {event.tags && event.tags.length > 0 && (
            <div className="flex gap-1.5 mt-3">
              {event.tags.slice(0, 5).map((tag: string) => (
                <span key={tag} className="rounded-full bg-secondary px-2.5 py-0.5 text-[10px] font-medium text-secondary-foreground">
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Live Markets */}
        {liveMarkets.length > 0 && (
          <>
            <h2 className="text-lg font-semibold mb-4">Live Markets ({liveMarkets.length})</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {liveMarkets.map((market) => {
                const yesPrice = market.outcomePrices?.[0];
                const noPrice = market.outcomePrices?.[1];

                return (
                  <div
                    key={market.condition_id}
                    className="rounded-xl border border-border bg-card p-5 transition-all hover:border-primary/30"
                  >
                    <Link
                      to={`/trade/${encodeURIComponent(market.condition_id)}`}
                      className="block"
                    >
                      <h3 className="text-sm font-semibold leading-snug mb-3 line-clamp-2 hover:text-primary transition-colors">
                        {market.question}
                      </h3>
                    </Link>

                    <div className="flex gap-2 mb-3">
                      <button
                        onClick={() => setTradeModal({ market, outcome: 0 })}
                        className="flex-1 rounded-lg bg-yes/10 border border-yes/20 py-2 text-xs font-semibold text-yes hover:bg-yes/20 transition-all"
                      >
                        Buy Yes {formatPrice(yesPrice)}
                      </button>
                      <button
                        onClick={() => setTradeModal({ market, outcome: 1 })}
                        className="flex-1 rounded-lg bg-no/10 border border-no/20 py-2 text-xs font-semibold text-no hover:bg-no/20 transition-all"
                      >
                        Buy No {formatPrice(noPrice)}
                      </button>
                    </div>

                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <BarChart3 className="h-3 w-3" />
                        <span>{formatVol(market.volume24h)}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <TrendingUp className="h-3 w-3" />
                        <span>{formatVol(market.totalVolume)}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Droplets className="h-3 w-3" />
                        <span>{formatVol(market.liquidity)}</span>
                      </div>
                      <span className="ml-auto rounded-full bg-yes/10 border border-yes/20 px-2 py-0.5 text-[10px] font-mono text-yes">
                        LIVE
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Ended/Other Markets */}
        {endedMarkets.length > 0 && (
          <div className="mt-8">
            <h2 className="text-lg font-semibold mb-4 text-muted-foreground">
              Ended / Other ({endedMarkets.length})
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {endedMarkets.map((market) => {
                const yesPrice = market.outcomePrices?.[0];
                const noPrice = market.outcomePrices?.[1];

                return (
                  <div
                    key={market.condition_id || market.id || market.question}
                    className="rounded-xl border border-border bg-card p-5 opacity-60"
                  >
                    <h3 className="text-sm font-semibold leading-snug mb-3 line-clamp-2">
                      {market.question}
                    </h3>

                    <div className="flex items-center gap-4 mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Yes</span>
                        <span className="font-mono text-lg font-bold text-yes">{formatPrice(yesPrice)}</span>
                      </div>
                      <div className="h-5 w-px bg-border" />
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">No</span>
                        <span className="font-mono text-lg font-bold text-no">{formatPrice(noPrice)}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{formatVol(market.totalVolume)} vol</span>
                      <span className="ml-auto rounded-full bg-muted border border-border px-2 py-0.5 text-[10px] font-mono">
                        {market.statusLabel}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {markets.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">No markets in this event.</p>
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

export default EventDetail;
