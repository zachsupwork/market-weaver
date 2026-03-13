import { useOrderbookWs } from "@/hooks/useOrderbookWs";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface MiniOrderbookProps {
  tokenId: string | undefined;
  className?: string;
}

/**
 * Compact 3-row orderbook preview for market cards.
 * Shows top 3 bids and asks with animated size bars.
 */
export function MiniOrderbook({ tokenId, className }: MiniOrderbookProps) {
  const { book, connected, changedPrices } = useOrderbookWs(tokenId);

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

      {/* Spread line */}
      <div className="h-px bg-border my-px" />

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

      {/* Live dot */}
      {connected && (
        <div className="flex items-center gap-1 mt-0.5 justify-end">
          <div className="h-1 w-1 rounded-full bg-yes animate-pulse" />
          <span className="text-[8px] text-muted-foreground">live</span>
        </div>
      )}
    </div>
  );
}
