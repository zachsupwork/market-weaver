import { useMarketStore } from "@/stores/useMarketStore";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

interface Props {
  label: string;
  price: number;
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
  const pct = Math.round(currentPrice * 100);

  const [flash, setFlash] = useState(false);
  const prevPrice = useRef(currentPrice);

  useEffect(() => {
    if (Math.abs(currentPrice - prevPrice.current) > 0.001) {
      setFlash(true);
      prevPrice.current = currentPrice;
      const t = setTimeout(() => setFlash(false), 600);
      return () => clearTimeout(t);
    }
  }, [currentPrice]);

  const tradeUrl = conditionId
    ? `/trade/${encodeURIComponent(conditionId)}`
    : eventSlug
    ? `/event/${encodeURIComponent(eventSlug)}`
    : "#";

  return (
    <div className="flex items-center gap-2.5 py-1 group/row rounded-md px-1.5 hover:bg-accent/50 transition-colors">
      {rank !== undefined && (
        <span className="text-[10px] font-mono text-muted-foreground w-4 text-right shrink-0">
          {rank}
        </span>
      )}
      <span className="text-xs font-medium text-foreground truncate flex-1 min-w-0">
        {label}
      </span>

      {/* Probability bar */}
      <div className="w-20 shrink-0">
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-500",
              pct >= 50 ? "bg-yes" : "bg-no"
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* YES/NO prices */}
      <div className="flex items-center gap-1.5 shrink-0">
        <AnimatePresence mode="popLayout">
          <motion.span
            key={pct}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.2 }}
            className={cn(
              "text-sm font-mono font-bold tabular-nums",
              flash ? "text-primary" : "text-yes"
            )}
          >
            {pct}¢
          </motion.span>
        </AnimatePresence>
        <span className="text-[10px] font-mono text-muted-foreground">
          / {100 - pct}¢
        </span>
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
