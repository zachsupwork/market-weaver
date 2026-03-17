import { memo, useMemo } from "react";
import { useMarketStore } from "@/stores/useMarketStore";
import { motion, AnimatePresence } from "framer-motion";

interface Props {
  tokenId?: string;
  maxRows?: number;
}

/** Compact 3-row order book preview for event cards – driven by the global store (WS). */
export const OrderBookPreview = memo(function OrderBookPreview({
  tokenId,
  maxRows = 3,
}: Props) {
  const asset = useMarketStore((s) =>
    tokenId ? s.assets[tokenId] : undefined
  );

  const bids = useMemo(() => {
    if (!asset?.bids?.length) return [];
    return [...asset.bids]
      .sort((a, b) => parseFloat(b.price) - parseFloat(a.price))
      .slice(0, maxRows);
  }, [asset?.bids, maxRows]);

  const asks = useMemo(() => {
    if (!asset?.asks?.length) return [];
    return [...asset.asks]
      .sort((a, b) => parseFloat(a.price) - parseFloat(b.price))
      .slice(0, maxRows);
  }, [asset?.asks, maxRows]);

  if (!bids.length && !asks.length) return null;

  const maxSize = Math.max(
    ...bids.map((l) => parseFloat(l.size)),
    ...asks.map((l) => parseFloat(l.size)),
    1
  );

  return (
    <div className="mt-1.5 rounded-md border border-border/50 bg-muted/30 px-2 py-1.5">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
          Order Book
        </span>
        <span className="relative flex h-1.5 w-1.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-60" />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-primary" />
        </span>
      </div>

      <div className="grid grid-cols-2 gap-x-2">
        {/* Bids (left) */}
        <div className="space-y-px">
          <AnimatePresence mode="popLayout">
            {bids.map((level) => {
              const priceCents = Math.round(parseFloat(level.price) * 100);
              const pct = (parseFloat(level.size) / maxSize) * 100;
              return (
                <motion.div
                  key={`bid-${level.price}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  className="relative flex items-center justify-between h-4 text-[10px] font-mono rounded-sm overflow-hidden"
                >
                  <div
                    className="absolute inset-y-0 left-0 bg-yes/15 rounded-sm transition-all duration-300"
                    style={{ width: `${pct}%` }}
                  />
                  <span className="relative z-10 text-yes font-semibold pl-1">
                    {priceCents}¢
                  </span>
                  <span className="relative z-10 text-muted-foreground pr-1">
                    {parseFloat(level.size).toFixed(0)}
                  </span>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>

        {/* Asks (right) */}
        <div className="space-y-px">
          <AnimatePresence mode="popLayout">
            {asks.map((level) => {
              const priceCents = Math.round(parseFloat(level.price) * 100);
              const pct = (parseFloat(level.size) / maxSize) * 100;
              return (
                <motion.div
                  key={`ask-${level.price}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  className="relative flex items-center justify-between h-4 text-[10px] font-mono rounded-sm overflow-hidden"
                >
                  <div
                    className="absolute inset-y-0 right-0 bg-no/15 rounded-sm transition-all duration-300"
                    style={{ width: `${pct}%` }}
                  />
                  <span className="relative z-10 text-muted-foreground pl-1">
                    {parseFloat(level.size).toFixed(0)}
                  </span>
                  <span className="relative z-10 text-no font-semibold pr-1">
                    {priceCents}¢
                  </span>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
});
