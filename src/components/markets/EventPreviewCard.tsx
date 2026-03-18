import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { TrendingUp, Layers, BarChart3 } from "lucide-react";
import { CandidatePreviewRow } from "./CandidatePreviewRow";
import type { FeaturedEvent } from "@/hooks/useFeaturedEvents";

function formatVol(n: number): string {
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

interface Props {
  event: FeaturedEvent;
}

export function EventPreviewCard({ event }: Props) {
  return (
    <Link to={`/event/${encodeURIComponent(event.slug)}`} className="block shrink-0">
      <Card className="w-80 hover:border-primary/40 hover:glow-primary transition-all group cursor-pointer h-full flex flex-col rounded-2xl overflow-hidden">
        <CardHeader className="p-4 pb-2">
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
              <h4 className="text-sm font-bold leading-snug line-clamp-2 group-hover:text-primary transition-colors">
                {event.title}
              </h4>
              <div className="flex items-center gap-2.5 mt-1.5">
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
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-3 pt-1 flex-1 flex flex-col">
          {/* Candidate list with ranks */}
          <div className="flex-1">
            {event.markets.slice(0, 6).map((m, i) => (
              <CandidatePreviewRow
                key={m.condition_id}
                label={m.question}
                price={m.outcomePrices?.[0]}
                tokenId={m.clobTokenIds?.[0]}
                conditionId={m.condition_id}
                eventSlug={event.slug}
                showTrade
                rank={i + 1}
              />
            ))}
            {event.markets.length > 6 && (
              <div className="text-center py-1">
                <span className="text-[10px] text-muted-foreground">
                  +{event.markets.length - 6} more
                </span>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="mt-2 pt-2 border-t border-border flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yes opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-yes" />
            </span>
            <span className="text-[10px] font-semibold text-yes">LIVE</span>
            <div className="ml-auto flex items-center gap-1">
              <BarChart3 className="h-3 w-3 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground font-mono">
                {formatVol(event.liquidity)} liq
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
