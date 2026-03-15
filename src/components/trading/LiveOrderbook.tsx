import { cn } from "@/lib/utils";
import { useOrderbookWs } from "@/hooks/useOrderbookWs";
import { Wifi, WifiOff } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface LiveOrderbookProps {
  tokenId: string | undefined;
  outcome: string;
}

const rowVariants = {
  initial: { opacity: 0, x: -8 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: 8 },
};

export function LiveOrderbook({ tokenId, outcome }: LiveOrderbookProps) {
  const { book, connected, error, changedPrices } = useOrderbookWs(tokenId);

  if (!book) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          Orderbook — {outcome}
          <Wifi className="h-3 w-3 text-muted-foreground animate-pulse" />
        </h3>
        <div className="space-y-1">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-5 rounded bg-muted animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const asks = (book.asks || []).slice(0, 8).reverse();
  const bids = (book.bids || []).slice(0, 8);
  const maxSize = Math.max(
    ...asks.map((a) => parseFloat(a.size)),
    ...bids.map((b) => parseFloat(b.size)),
    1
  );

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
        Orderbook — {outcome}
        {connected ? (
          <span className="flex items-center gap-1 text-[10px] text-yes">
            <Wifi className="h-3 w-3" /> Live
          </span>
        ) : (
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <WifiOff className="h-3 w-3" /> Polling
          </span>
        )}
      </h3>

      {error && (
        <p className="text-[10px] text-destructive mb-2">{error}</p>
      )}

      <div className="grid grid-cols-2 text-[10px] text-muted-foreground font-mono mb-1 px-1">
        <span>Price</span>
        <span className="text-right">Size</span>
      </div>

      {/* Asks */}
      <div className="space-y-px mb-1">
        <AnimatePresence initial={false}>
          {asks.map((level) => {
            const pct = (parseFloat(level.size) / maxSize) * 100;
            const isChanged = changedPrices.has(`ask-${level.price}`);
            return (
              <motion.div
                key={`ask-${level.price}`}
                variants={rowVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ duration: 0.2 }}
                layout
                className={cn(
                  "relative flex justify-between px-1 py-0.5 text-xs font-mono rounded-sm",
                  isChanged && "ring-1 ring-no/40"
                )}
              >
                <motion.div
                  className="absolute inset-y-0 right-0 bg-no/10 rounded-sm"
                  animate={{ width: `${pct}%` }}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                />
                <motion.span
                  className="relative text-no"
                  animate={isChanged ? { scale: [1, 1.15, 1] } : {}}
                  transition={{ duration: 0.3 }}
                >
                  {parseFloat(level.price).toFixed(2)}
                </motion.span>
                <motion.span
                  className="relative text-muted-foreground"
                  animate={isChanged ? { scale: [1, 1.15, 1], color: ["hsl(var(--muted-foreground))", "hsl(var(--no))", "hsl(var(--muted-foreground))"] } : {}}
                  transition={{ duration: 0.4 }}
                >
                  {parseFloat(level.size).toFixed(1)}
                </motion.span>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Spread */}
      {asks.length > 0 && bids.length > 0 && (
        <motion.div
          className="text-center text-[10px] text-muted-foreground py-1 border-y border-border my-1"
          key={`spread-${asks[asks.length - 1]?.price}-${bids[0]?.price}`}
          initial={{ opacity: 0.5 }}
          animate={{ opacity: 1 }}
        >
          Spread: {(parseFloat(asks[asks.length - 1]?.price || "0") - parseFloat(bids[0]?.price || "0")).toFixed(3)}
        </motion.div>
      )}

      {/* Bids */}
      <div className="space-y-px">
        <AnimatePresence mode="popLayout">
          {bids.map((level) => {
            const pct = (parseFloat(level.size) / maxSize) * 100;
            const isChanged = changedPrices.has(`bid-${level.price}`);
            return (
              <motion.div
                key={`bid-${level.price}`}
                variants={rowVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ duration: 0.2 }}
                layout
                className={cn(
                  "relative flex justify-between px-1 py-0.5 text-xs font-mono rounded-sm",
                  isChanged && "ring-1 ring-yes/40"
                )}
              >
                <motion.div
                  className="absolute inset-y-0 right-0 bg-yes/10 rounded-sm"
                  animate={{ width: `${pct}%` }}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                />
                <motion.span
                  className="relative text-yes"
                  animate={isChanged ? { scale: [1, 1.15, 1] } : {}}
                  transition={{ duration: 0.3 }}
                >
                  {parseFloat(level.price).toFixed(2)}
                </motion.span>
                <motion.span
                  className="relative text-muted-foreground"
                  animate={isChanged ? { scale: [1, 1.15, 1], color: ["hsl(var(--muted-foreground))", "hsl(var(--yes))", "hsl(var(--muted-foreground))"] } : {}}
                  transition={{ duration: 0.4 }}
                >
                  {parseFloat(level.size).toFixed(1)}
                </motion.span>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
