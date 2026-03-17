import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { TrendingUp } from "lucide-react";
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
      <Card className="w-72 hover:border-primary/40 transition-all group cursor-pointer h-full">
        <CardHeader className="p-3 pb-1">
          <div className="flex items-start gap-2">
            {event.image && (
              <img
                src={event.image}
                alt=""
                className="h-8 w-8 rounded-md bg-muted shrink-0 object-cover"
                loading="lazy"
              />
            )}
            <div className="min-w-0 flex-1">
              <h4 className="text-sm font-semibold leading-snug line-clamp-2 group-hover:text-primary transition-colors">
                {event.title}
              </h4>
              <div className="flex items-center gap-1.5 mt-0.5">
                <TrendingUp className="h-3 w-3 text-primary" />
                <span className="text-[10px] text-muted-foreground font-mono">
                  {formatVol(event.volume)} vol
                </span>
                <span className="h-1 w-1 rounded-full bg-border" />
                <span className="text-[10px] text-muted-foreground">
                  {event.markets.length} markets
                </span>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-3 pt-1">
          <div className="space-y-0.5">
            {event.markets.map((m) => (
              <CandidatePreviewRow
                key={m.condition_id}
                label={m.question}
                price={m.outcomePrices?.[0] ?? 0.5}
                tokenId={m.clobTokenIds?.[0]}
              />
            ))}
          </div>
          <div className="mt-2 flex items-center gap-1">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
            </span>
            <span className="text-[10px] text-muted-foreground">Live</span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
