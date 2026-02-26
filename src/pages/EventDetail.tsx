import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchEventById, isBytes32Hex } from "@/lib/polymarket-api";
import { normalizeMarkets } from "@/lib/normalizePolymarket";
import { ArrowLeft, Loader2, BarChart3, TrendingUp, Droplets } from "lucide-react";
import { cn } from "@/lib/utils";

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

  return (
    <div className="min-h-screen">
      <div className="container py-8 max-w-5xl">
        <Link
          to="/events"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft className="h-4 w-4" /> Events
        </Link>

        <div className="mb-8">
          <div className="flex items-start gap-4 mb-3">
            {event.image && (
              <img src={event.image} alt="" className="h-14 w-14 rounded-xl bg-muted shrink-0" />
            )}
            <div>
              <h1 className="text-2xl font-bold">{title}</h1>
              {event.description && (
                <p className="text-sm text-muted-foreground mt-1">{event.description}</p>
              )}
            </div>
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

        <h2 className="text-lg font-semibold mb-4">
          Markets ({markets.length})
        </h2>

        <div className="grid gap-4 sm:grid-cols-2">
          {markets.map((market) => {
            const hasValidId = isBytes32Hex(market.condition_id);
            const yesPrice = market.outcomePrices?.[0];
            const noPrice = market.outcomePrices?.[1];

            const card = (
              <div className={cn(
                "rounded-xl border border-border bg-card p-5 transition-all",
                hasValidId && "hover:border-primary/30 cursor-pointer"
              )}>
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
                  {market.accepting_orders && (
                    <span className="ml-auto rounded-full bg-yes/10 border border-yes/20 px-2 py-0.5 text-[10px] font-mono text-yes">
                      LIVE
                    </span>
                  )}
                </div>

                <div className="mt-2 text-[10px] font-mono text-muted-foreground truncate">
                  {market.condition_id || "No condition ID"}
                </div>
              </div>
            );

            if (!hasValidId) {
              return <div key={market.id || market.question} className="opacity-60">{card}</div>;
            }

            return (
              <Link
                key={market.condition_id}
                to={`/trade/${encodeURIComponent(market.condition_id)}`}
                className="block"
              >
                {card}
              </Link>
            );
          })}
        </div>

        {markets.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">No markets in this event.</p>
        )}
      </div>
    </div>
  );
};

export default EventDetail;
