import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { TrendingUp, Layers, ExternalLink, BarChart3, Clock } from "lucide-react";
import { CandidatePreviewRow } from "./CandidatePreviewRow";
import { SportScoreBadge } from "./SportScoreBadge";
import { CryptoPriceBadge } from "./CryptoPriceBadge";
import { extractSportsSlug, extractCryptoSymbol } from "@/lib/live-data-utils";
import { cn } from "@/lib/utils";
import type { FeaturedEvent } from "@/hooks/useFeaturedEvents";

function formatVol(n: number): string {
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function timeUntilShort(dateStr: string): string {
  const diff = new Date(dateStr).getTime() - Date.now();
  if (diff <= 0) return "";
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const secs = Math.floor((diff % (1000 * 60)) / 1000);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m ${secs}s`;
}

interface Props {
  event: FeaturedEvent;
}

export function EventGridCard({ event }: Props) {
  const [, setTick] = useState(0);
  const hasEndDate = !!event.endDate;
  const isClosed = event.status === "CLOSED" || event.status === "ENDED";

  // Tick every second if there's an active timer
  useEffect(() => {
    if (isClosed || !hasEndDate) return;
    const iv = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(iv);
  }, [isClosed, hasEndDate]);

  const countdown = hasEndDate ? timeUntilShort(event.endDate) : "";

  return (
    <Link
      to={`/event/${encodeURIComponent(event.slug)}`}
      className={cn(
        "group block rounded-2xl border border-border bg-card overflow-hidden transition-all",
        isClosed
          ? "opacity-70 hover:opacity-90"
          : "hover:border-primary/40 hover:glow-primary"
      )}
    >
      {/* Header with image */}
      <div className="relative p-4 pb-3">
        <div className="flex items-start gap-3">
          {event.image && (
            <img
              src={event.image}
              alt=""
              className="h-12 w-12 rounded-xl bg-muted shrink-0 object-cover ring-1 ring-border"
              loading="lazy"
            />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-1">
              <h3 className="text-sm font-bold leading-snug text-foreground group-hover:text-primary transition-colors line-clamp-2 flex-1">
                {event.title}
              </h3>
              <a
                href={`https://polymarket.com/event/${event.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="shrink-0 mt-0.5 text-muted-foreground hover:text-primary transition-colors"
                title="View on Polymarket"
              >
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>

            {/* Stats row */}
            <div className="flex items-center gap-3 mt-1.5">
              <div className="flex items-center gap-1">
                <Layers className="h-3 w-3 text-primary" />
                <span className="text-[10px] text-muted-foreground font-medium">
                  {event.markets.length} options
                </span>
              </div>
              <div className="flex items-center gap-1">
                <TrendingUp className="h-3 w-3 text-yes" />
                <span className="text-[10px] text-muted-foreground font-mono font-medium">
                  {formatVol(event.volume)}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <BarChart3 className="h-3 w-3 text-primary" />
                <span className="text-[10px] text-muted-foreground font-mono font-medium">
                  {formatVol(event.liquidity)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Timer */}
      {hasEndDate && !isClosed && countdown && (
        <div className="px-4 pb-2 flex items-center gap-1.5">
          <Clock className="h-3 w-3 text-muted-foreground" />
          <span className="text-[10px] font-mono text-muted-foreground">
            Ends in {countdown}
          </span>
        </div>
      )}

      {/* Live data badge */}
      {(() => {
        const sportsSlug = extractSportsSlug(event.markets[0]?.tags, event.slug);
        const cryptoSym = extractCryptoSymbol(event.title, event.markets[0]?.tags);
        if (sportsSlug) return <div className="px-4 mb-2"><SportScoreBadge sportsSlug={sportsSlug} /></div>;
        if (cryptoSym) return <div className="px-4 mb-2"><CryptoPriceBadge symbol={cryptoSym} /></div>;
        return null;
      })()}

      {/* Candidates with ranking */}
      <div className="px-3 pb-1">
        {event.markets.slice(0, 5).map((m, i) => (
          <CandidatePreviewRow
            key={m.condition_id}
            label={m.question}
            price={m.outcomePrices?.[0]}
            tokenId={m.clobTokenIds?.[0]}
            conditionId={m.condition_id}
            eventSlug={event.slug}
            showTrade={!isClosed}
            rank={i + 1}
          />
        ))}
        {event.markets.length > 5 && (
          <div className="text-center py-1">
            <span className="text-[10px] text-muted-foreground">
              +{event.markets.length - 5} more options
            </span>
          </div>
        )}
      </div>

      {/* Footer with status */}
      <div className="px-4 py-2.5 border-t border-border bg-muted/30 flex items-center gap-2">
        {event.status === "LIVE" && (
          <>
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yes opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-yes" />
            </span>
            <span className="text-[10px] font-medium text-yes">LIVE</span>
          </>
        )}
        {event.status === "CLOSED" && (
          <>
            <span className="relative flex h-2 w-2">
              <span className="relative inline-flex rounded-full h-2 w-2 bg-muted-foreground" />
            </span>
            <span className="text-[10px] font-medium text-muted-foreground">CLOSED — No more bets</span>
          </>
        )}
        {event.status === "ENDED" && (
          <>
            <span className="relative flex h-2 w-2">
              <span className="relative inline-flex rounded-full h-2 w-2 bg-destructive" />
            </span>
            <span className="text-[10px] font-medium text-destructive">ENDED</span>
          </>
        )}
        <span className="ml-auto rounded-full bg-primary/10 border border-primary/20 px-2 py-0.5 text-[9px] font-bold font-mono text-primary tracking-wide">
          EVENT
        </span>
      </div>
    </Link>
  );
}
