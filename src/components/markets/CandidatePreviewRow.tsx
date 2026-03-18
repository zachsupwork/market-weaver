import { useMarketStore } from "@/stores/useMarketStore";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { extractEventMarketLabel } from "@/lib/event-market-display";

interface Props {
  label: string;
  price?: number;
  tokenId?: string;
  conditionId?: string;
  eventSlug?: string;
  showTrade?: boolean;
  rank?: number;
}

export function CandidatePreviewRow({
  label,
  price,
  tokenId,
  conditionId,
  eventSlug,
  showTrade = false,
  rank,
}: Props) {
  const wsPrice = useMarketStore((s) =>
    tokenId ? s.assets[tokenId]?.lastTradePrice : null
  );

  const currentPrice = wsPrice ?? price;
  const pct = currentPrice !== undefined && currentPrice !== null
    ? Math.round(currentPrice * 1000) / 10
    : null;
  const displayLabel = extractEventMarketLabel(label);

  const [flash, setFlash] = useState(false);
  const prevPrice = useRef<number | undefined>(currentPrice ?? undefined);

  useEffect(() => {
    if (
      currentPrice === undefined ||
      currentPrice === null ||
      prevPrice.current === undefined ||
      prevPrice.current === null
    ) {
      prevPrice.current = currentPrice ?? undefined;
      return;
    }

    if (Math.abs(currentPrice - prevPrice.current) > 0.001) {
      setFlash(true);
      prevPrice.current = currentPrice;
      const t = setTimeout(() => setFlash(false), 600);
      return () => clearTimeout(t);
    }
  }, [currentPrice]);

  const tradeUrl = eventSlug
    ? `/events/${encodeURIComponent(eventSlug)}${conditionId ? `?market=${encodeURIComponent(conditionId)}` : ""}`
    : conditionId
    ? `/trade/${encodeURIComponent(conditionId)}`
    : "#";

  return (
    <div className="flex items-center gap-2.5 py-1 group/row rounded-md px-1.5 hover:bg-accent/50 transition-colors">
      {rank !== undefined && (
        <span className="text-[10px] font-mono text-muted-foreground w-4 text-right shrink-0">
          {rank}
        </span>
      )}
      <span className="text-xs font-medium text-foreground truncate flex-1 min-w-0">
        {displayLabel}
      </span>

      <div className="w-20 shrink-0">
        {pct !== null ? (
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500",
                pct >= 50 ? "bg-yes" : "bg-no"
              )}
              style={{ width: `${pct}%` }}
            />
          </div>
        ) : (
          <div className="h-2 rounded-full bg-muted animate-pulse" />
        )}
      </div>

      <div className="flex items-center gap-1.5 shrink-0 min-w-[64px] justify-end">
        {pct !== null ? (
          <>
            <AnimatePresence mode="popLayout">
              <motion.span
                key={pct}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                transition={{ duration: 0.2 }}
                className={cn(
                  "text-sm font-mono font-bold tabular-nums",
                  flash ? "text-primary" : "text-foreground"
                )}
              >
                {pct}%
              </motion.span>
            </AnimatePresence>
            <span className="text-[10px] font-mono text-muted-foreground">
              YES
            </span>
          </>
        ) : (
          <div className="h-4 w-10 rounded bg-muted animate-pulse" />
        )}
      </div>

      {showTrade && (
        <Link
          to={tradeUrl}
          onClick={(e) => e.stopPropagation()}
          className="shrink-0 rounded-md bg-primary/10 border border-primary/20 px-2 py-0.5 text-[10px] font-semibold text-primary hover:bg-primary/20 transition-all opacity-0 group-hover/row:opacity-100"
        >
          Trade
        </Link>
      )}
    </div>
  );
}
