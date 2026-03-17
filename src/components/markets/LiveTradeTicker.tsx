import { useEffect, useState, useRef } from "react";
import { fetchTrades, type TradeRecord } from "@/lib/polymarket-api";
import { motion, AnimatePresence } from "framer-motion";

interface Props {
  /** All YES token IDs across the event's markets */
  tokenIds: string[];
  maxItems?: number;
}

export function LiveTradeTicker({ tokenIds, maxItems = 5 }: Props) {
  const [trades, setTrades] = useState<(TradeRecord & { _label?: string })[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    if (tokenIds.length === 0) return;

    const load = async () => {
      try {
        // Fetch 3 trades per candidate, merge & sort
        const results = await Promise.all(
          tokenIds.slice(0, 5).map((id) => fetchTrades(id, 3))
        );
        const all = results
          .flat()
          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
          .slice(0, maxItems);
        setTrades(all);
      } catch {
        /* noop */
      }
    };

    load();
    intervalRef.current = setInterval(load, 8000);
    return () => clearInterval(intervalRef.current);
  }, [tokenIds.join(","), maxItems]);

  if (trades.length === 0) return null;

  return (
    <div className="space-y-0.5 mt-1.5">
      <AnimatePresence initial={false}>
        {trades.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 8 }}
            transition={{ duration: 0.2 }}
            className="flex items-center gap-1.5 text-[10px] font-mono"
          >
            <span
              className={
                t.side === "BUY"
                  ? "text-yes"
                  : "text-no"
              }
            >
              {t.side === "BUY" ? "▲" : "▼"}
            </span>
            <span className="text-muted-foreground">
              {Math.round(t.price * 100)}¢
            </span>
            <span className="text-muted-foreground">×</span>
            <span className="text-foreground">
              ${t.size >= 1000 ? `${(t.size / 1000).toFixed(1)}K` : t.size.toFixed(0)}
            </span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
