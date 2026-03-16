import { useEffect, useRef, useState } from "react";
import { useOrderbookWs } from "@/hooks/useOrderbookWs";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface MiniOrderbookProps {
  tokenId: string | undefined;
  className?: string;
  wsEnabled?: boolean;
}

interface FlightTick {
  id: string;
  label: string;
  tone: "yes" | "no";
  xOffset: number; // random horizontal offset in %
}

const FLIGHT_DURATION_MS = 1800;
const MAX_VISIBLE_PER_SIDE = 3;

/**
 * Compact 3-row orderbook preview for market cards.
 * Includes an animated micro-ticker for incremental line-by-line updates.
 */
export function MiniOrderbook({ tokenId, className, wsEnabled = true }: MiniOrderbookProps) {
  const { book, connected, changedPrices } = useOrderbookWs(tokenId, {
    wsEnabled,
    pollInterval: 1_000,
  });
  const [flights, setFlights] = useState<FlightTick[]>([]);
  const seenFlightIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!book || changedPrices.size === 0) return;

    const nextFlights: FlightTick[] = [];
    [...changedPrices].slice(0, 2).forEach((key, idx) => {
      const [side, price] = key.split("-");
      const level = side === "bid"
        ? (book.bids || []).find((b) => b.price === price)
        : (book.asks || []).find((a) => a.price === price);
      if (!level) return;

      const id = `${key}-${book.timestamp}-${idx}`;
      if (seenFlightIds.current.has(id)) return;
      seenFlightIds.current.add(id);

      nextFlights.push({
        id,
        label: `${side === "bid" ? "YES" : "NO"} ${(+price * 100).toFixed(0)}¢ · ${(+level.size).toFixed(0)}`,
        tone: side === "bid" ? "yes" : "no",
        xOffset: Math.random() * 40 + 5, // 5-45% offset from side edge
      });
    });

    if (!nextFlights.length) return;

    setFlights((prev) => {
      const combined = [...nextFlights, ...prev];
      // Enforce per-side limit
      const yesTrades = combined.filter(f => f.tone === "yes").slice(0, MAX_VISIBLE_PER_SIDE);
      const noTrades = combined.filter(f => f.tone === "no").slice(0, MAX_VISIBLE_PER_SIDE);
      return [...yesTrades, ...noTrades];
    });

    const timers = nextFlights.map((flight) =>
      setTimeout(() => {
        setFlights((prev) => prev.filter((item) => item.id !== flight.id));
      }, FLIGHT_DURATION_MS)
    );

    return () => timers.forEach(clearTimeout);
  }, [book, changedPrices]);

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
    ...asks.map((a) => parseFloat(a.size)),
    ...bids.map((b) => parseFloat(b.size)),
    1
  );

  // Last trade price from orderbook data
  const lastPrice = (book as any).last_trade_price;

  return (
    <div className={cn("font-mono", className)}>
      {/* Asks (reversed so lowest ask is near spread) */}
      <AnimatePresence initial={false}>
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
      <AnimatePresence initial={false}>
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

      {/* Vertical bubble-rising trade ticker */}
      <div className="relative mt-1 h-14 overflow-hidden rounded border border-border/50 bg-card/60">
        {/* Live indicator */}
        <div className="absolute top-1 left-1 z-10 flex items-center gap-1">
          <span className={cn(
            "h-1.5 w-1.5 rounded-full",
            connected ? "bg-yes animate-pulse" : "bg-muted-foreground"
          )} />
          <span className="text-[7px] font-medium text-muted-foreground uppercase tracking-wider">
            {connected ? "live" : "poll"}
          </span>
        </div>

        <AnimatePresence initial={false}>
          {flights.map((flight) => (
            <motion.span
              key={flight.id}
              initial={{
                opacity: 0.95,
                y: 4,
                scale: 0.9,
              }}
              animate={{
                opacity: [0.95, 1, 0.6, 0],
                y: -48,
                scale: 1,
              }}
              exit={{ opacity: 0 }}
              transition={{ duration: FLIGHT_DURATION_MS / 1000, ease: "easeOut" }}
              className={cn(
                "absolute bottom-1 text-[8px] font-semibold whitespace-nowrap px-1.5 py-0.5 rounded-sm backdrop-blur-sm",
                flight.tone === "yes"
                  ? "text-yes bg-yes/15 border border-yes/20"
                  : "text-no bg-no/15 border border-no/20"
              )}
              style={{
                [flight.tone === "yes" ? "right" : "left"]: `${flight.xOffset}%`,
              }}
            >
              {flight.label}
            </motion.span>
          ))}
        </AnimatePresence>

        {flights.length === 0 && (
          <div className="flex h-full items-center justify-center text-[8px] text-muted-foreground/60">
            {connected ? "waiting for trades…" : "connecting…"}
          </div>
        )}
      </div>
    </div>
  );
}
