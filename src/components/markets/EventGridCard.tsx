import { Link } from "react-router-dom";
import { TrendingUp, Layers } from "lucide-react";
import { CandidatePreviewRow } from "./CandidatePreviewRow";
import { OrderBookPreview } from "./OrderBookPreview";
import { LiveTradeTicker } from "./LiveTradeTicker";
import type { FeaturedEvent } from "@/hooks/useFeaturedEvents";

function formatVol(n: number): string {
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

interface Props {
  event: FeaturedEvent;
}

/** Grid-friendly event card that blends with MarketCard rows */
export function EventGridCard({ event }: Props) {
  const topTokenId = event.markets[0]?.clobTokenIds?.[0];
  const tokenIds = event.markets
    .map((m) => m.clobTokenIds?.[0])
    .filter(Boolean) as string[];

  return (
    <Link
      to={`/event/${encodeURIComponent(event.slug)}`}
      className="group block rounded-xl border border-border bg-card p-4 transition-all hover:border-primary/30 hover:glow-primary"
    >
      {/* Header */}
      <div className="flex items-start gap-2.5 mb-3">
        {event.image && (
          <img
            src={event.image}
            alt=""
            className="h-8 w-8 rounded-lg bg-muted shrink-0 object-cover"
            loading="lazy"
          />
        )}
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold leading-snug text-foreground group-hover:text-primary transition-colors line-clamp-2">
            {event.title}
          </h3>
          <div className="flex items-center gap-1.5 mt-0.5">
            <Layers className="h-3 w-3 text-primary" />
            <span className="text-[10px] text-muted-foreground">
              {event.markets.length} outcome{event.markets.length !== 1 ? "s" : ""}
            </span>
            <span className="h-1 w-1 rounded-full bg-border" />
            <TrendingUp className="h-3 w-3 text-primary" />
            <span className="text-[10px] text-muted-foreground font-mono">
              {formatVol(event.volume)} vol
            </span>
          </div>
        </div>
      </div>

      {/* Top 5 candidates */}
      <div className="space-y-0.5 mb-2">
        {event.markets.slice(0, 5).map((m) => (
          <CandidatePreviewRow
            key={m.condition_id}
            label={m.question}
            price={m.outcomePrices?.[0] ?? 0.5}
            tokenId={m.clobTokenIds?.[0]}
            conditionId={m.condition_id}
            eventSlug={event.slug}
            showTrade
          />
        ))}
      </div>

      {/* Mini order book for top candidate */}
      {topTokenId && <OrderBookPreview tokenId={topTokenId} maxRows={3} />}

      {/* Live trade ticker */}
      <LiveTradeTicker tokenIds={tokenIds.slice(0, 3)} maxItems={3} />

      {/* Footer */}
      <div className="mt-2 flex items-center gap-1.5">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
        </span>
        <span className="text-[10px] text-muted-foreground">Live</span>
        <span className="ml-auto text-[10px] text-muted-foreground font-mono">
          {formatVol(event.liquidity)} liq
        </span>
        <span className="rounded-full bg-primary/10 border border-primary/20 px-1.5 py-0.5 text-[9px] font-mono text-primary">
          EVENT
        </span>
      </div>
    </Link>
  );
}
