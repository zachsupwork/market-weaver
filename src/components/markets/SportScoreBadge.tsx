import { useLiveDataStore } from "@/stores/useLiveDataStore";
import { memo } from "react";

interface Props {
  /** The sports event slug from Polymarket (e.g. "nfl-buf-kc-2025-01-26") */
  sportsSlug?: string;
  /** Fallback: try to extract from tags or market question */
  tags?: string[];
}

/** Shows live score badge for a sports market/event */
export const SportScoreBadge = memo(function SportScoreBadge({ sportsSlug, tags }: Props) {
  const score = useLiveDataStore((s) => {
    if (sportsSlug) return s.findScoreBySlug(sportsSlug);
    // Try to find by tag-based slug
    if (tags) {
      for (const tag of tags) {
        const found = s.sportsScores[tag];
        if (found) return found;
      }
    }
    return undefined;
  });

  if (!score) return null;

  const isLive = score.live && !score.ended;
  const statusColor = isLive
    ? "text-yes"
    : score.ended
    ? "text-muted-foreground"
    : "text-warning";

  const statusLabel = score.ended
    ? score.status
    : isLive
    ? score.period || "LIVE"
    : score.status;

  return (
    <div className="flex items-center gap-1.5 rounded-md bg-card border border-border px-2 py-1">
      {isLive && (
        <span className="relative flex h-1.5 w-1.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yes opacity-75" />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-yes" />
        </span>
      )}
      <span className="font-mono text-[10px] font-bold text-foreground">
        {score.score}
      </span>
      <span className={`text-[9px] font-semibold ${statusColor}`}>
        {statusLabel}
      </span>
      {score.elapsed && isLive && (
        <span className="text-[9px] text-muted-foreground font-mono">
          {score.elapsed}
        </span>
      )}
    </div>
  );
});
