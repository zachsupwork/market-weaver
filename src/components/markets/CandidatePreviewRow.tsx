import { useMarketStore } from "@/stores/useMarketStore";
import { Progress } from "@/components/ui/progress";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";

interface Props {
  label: string;
  price: number;
  tokenId?: string;
  conditionId?: string;
  eventSlug?: string;
  /** If true, show a compact Trade button */
  showTrade?: boolean;
}

export function CandidatePreviewRow({
  label,
  price,
  tokenId,
  conditionId,
  eventSlug,
  showTrade = false,
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
    <div className="flex items-center gap-2 py-0.5 group/row">
      <span className="text-xs text-foreground truncate flex-1 min-w-0">
        {label}
      </span>
      <div className="w-14 shrink-0">
        <Progress value={pct} className="h-1.5" />
      </div>
      <AnimatePresence mode="popLayout">
        <motion.span
          key={pct}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 4 }}
          transition={{ duration: 0.2 }}
          className={`text-xs font-mono font-semibold w-8 text-right shrink-0 ${
            flash ? "text-primary" : "text-muted-foreground"
          }`}
        >
          {pct}%
        </motion.span>
      </AnimatePresence>
      {showTrade && (
        <Link
          to={tradeUrl}
          onClick={(e) => e.stopPropagation()}
          className="shrink-0 rounded bg-yes/15 border border-yes/25 px-1.5 py-0.5 text-[10px] font-semibold text-yes hover:bg-yes/25 transition-all opacity-70 group-hover/row:opacity-100"
        >
          Trade
        </Link>
      )}
    </div>
  );
}
