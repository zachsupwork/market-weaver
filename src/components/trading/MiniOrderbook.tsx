import { useOrderbookWs } from "@/hooks/useOrderbookWs";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface MiniOrderbookProps {
  tokenId: string | undefined;
  className?: string;
  /** Set false on homepage to avoid opening dozens of WebSockets */
  wsEnabled?: boolean;
}

/**
 * Compact 3-row orderbook preview for market cards.
 * Shows top 3 bids and asks with animated size bars.
 */
export function MiniOrderbook({ tokenId, className, wsEnabled = false }: MiniOrderbookProps) {
  const { book, connected, changedPrices } = useOrderbookWs(tokenId, {
    wsEnabled,
    pollInterval: 5_000,
  });

  if (!book) {
    return (
      <div className={cn("space-y-px", className)}>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-3.5 rounded bg-muted/50 animate-pulse" />
        ))}
      </div>
    );
  }

  const asks = (book.asks || []).slice(0, 3).reverse();
  const bids = (book.bids || []).slice(0, 3);
  const maxSize = Math.max(
    ...asks.map(a => parseFloat(a.size)),
    ...bids.map(b => parseFloat(b.size)),
    1
  );

  // Last trade price from orderbook data
  const lastPrice = (book as any).last_trade_price;

  return (
    <div className={cn("font-mono", className)}>
      {/* Asks (reversed so lowest ask is near spread) */}
      <AnimatePresence mode="popLayout">
        {asks.map((level) => {
          const pct = (parseFloat(level.size) / maxSize) * 100;
          const flash = changedPrices.has(`ask-${level.price}`);
          return (
            <motion.div
              key={`a-${level.price}`}
              layout
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className={cn(
                "relative flex justify-between text-[9px] px-1 py-px rounded-sm",
                flash && "bg-no/10"
              )}
            >
              <motion.div
                className="absolute inset-y-0 right-0 bg-no/8 rounded-sm"
                animate={{ width: `${pct}%` }}
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              />
              <span className="relative text-no">{parseFloat(level.price).toFixed(2)}</span>
              <motion.span
                className="relative text-muted-foreground"
                animate={flash ? { scale: [1, 1.2, 1] } : {}}
                transition={{ duration: 0.3 }}
              >
                {parseFloat(level.size).toFixed(0)}
              </motion.span>
            </motion.div>
          );
        })}
      </AnimatePresence>

      {/* Spread line with last price */}
      <div className="flex items-center gap-1 my-px">
        <div className="flex-1 h-px bg-border" />
        {lastPrice && (
          <span className="text-[8px] text-primary font-semibold">
            {(parseFloat(lastPrice) * 100).toFixed(0)}¢
          </span>
        )}
        <div className="flex-1 h-px bg-border" />
      </div>

      {/* Bids */}
      <AnimatePresence mode="popLayout">
        {bids.map((level) => {
          const pct = (parseFloat(level.size) / maxSize) * 100;
          const flash = changedPrices.has(`bid-${level.price}`);
          return (
            <motion.div
              key={`b-${level.price}`}
              layout
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className={cn(
                "relative flex justify-between text-[9px] px-1 py-px rounded-sm",
                flash && "bg-yes/10"
              )}
            >
              <motion.div
                className="absolute inset-y-0 right-0 bg-yes/8 rounded-sm"
                animate={{ width: `${pct}%` }}
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              />
              <span className="relative text-yes">{parseFloat(level.price).toFixed(2)}</span>
              <motion.span
                className="relative text-muted-foreground"
                animate={flash ? { scale: [1, 1.2, 1] } : {}}
                transition={{ duration: 0.3 }}
              >
                {parseFloat(level.size).toFixed(0)}
              </motion.span>
            </motion.div>
          );
        })}
      </AnimatePresence>

      {/* Status indicator */}
      <div className="flex items-center gap-1 mt-0.5 justify-end">
        <div className={cn("h-1 w-1 rounded-full", connected ? "bg-yes animate-pulse" : "bg-primary")} />
        <span className="text-[8px] text-muted-foreground">{connected ? "live" : "polling"}</span>
      </div>
    </div>
  );
}
