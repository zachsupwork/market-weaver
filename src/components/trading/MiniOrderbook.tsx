import { useEffect, useRef, useState, useCallback } from "react";
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
  xOffset: number;
}

const FLIGHT_DURATION_MS = 1500;

/**
 * Compact 3-row orderbook preview for market cards.
 * Trades are queued per-side and shown one at a time to avoid clutter.
 */
export function MiniOrderbook({ tokenId, className, wsEnabled = true }: MiniOrderbookProps) {
  const { book, connected, changedPrices } = useOrderbookWs(tokenId, {
    wsEnabled,
    pollInterval: 1_000,
  });

  // Queues for pending trades per side
  const yesQueueRef = useRef<FlightTick[]>([]);
  const noQueueRef = useRef<FlightTick[]>([]);
  const [currentYes, setCurrentYes] = useState<FlightTick | null>(null);
  const [currentNo, setCurrentNo] = useState<FlightTick | null>(null);
  const [queueCount, setQueueCount] = useState(0);
  const seenFlightIds = useRef<Set<string>>(new Set());
  const yesTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Pop next from YES queue
  const popYes = useCallback(() => {
    if (yesQueueRef.current.length > 0) {
      const next = yesQueueRef.current.shift()!;
      setCurrentYes(next);
      setQueueCount(yesQueueRef.current.length + noQueueRef.current.length);
      yesTimerRef.current = setTimeout(() => {
        setCurrentYes(null);
        // Small gap before next
        yesTimerRef.current = setTimeout(popYes, 150);
      }, FLIGHT_DURATION_MS);
    } else {
      setQueueCount(noQueueRef.current.length);
    }
  }, []);

  // Pop next from NO queue
  const popNo = useCallback(() => {
    if (noQueueRef.current.length > 0) {
      const next = noQueueRef.current.shift()!;
      setCurrentNo(next);
      setQueueCount(yesQueueRef.current.length + noQueueRef.current.length);
      noTimerRef.current = setTimeout(() => {
        setCurrentNo(null);
        noTimerRef.current = setTimeout(popNo, 150);
      }, FLIGHT_DURATION_MS);
    } else {
      setQueueCount(yesQueueRef.current.length);
    }
  }, []);

  // Enqueue incoming trades
  useEffect(() => {
    if (!book || changedPrices.size === 0) return;

    let addedYes = false;
    let addedNo = false;

    [...changedPrices].slice(0, 3).forEach((key, idx) => {
      const [side, price] = key.split("-");
      const level = side === "bid"
        ? (book.bids || []).find((b) => b.price === price)
        : (book.asks || []).find((a) => a.price === price);
      if (!level) return;

      const id = `${key}-${book.timestamp}-${idx}`;
      if (seenFlightIds.current.has(id)) return;
      seenFlightIds.current.add(id);

      const tick: FlightTick = {
        id,
        label: `${side === "bid" ? "YES" : "NO"} ${(+price * 100).toFixed(0)}¢ · ${(+level.size).toFixed(0)}`,
        tone: side === "bid" ? "yes" : "no",
        xOffset: Math.random() * 15 + 3, // 3-18% tight to edge
      };

      if (tick.tone === "yes") {
        // Cap queue to prevent unbounded growth
        if (yesQueueRef.current.length < 8) yesQueueRef.current.push(tick);
        addedYes = true;
      } else {
        if (noQueueRef.current.length < 8) noQueueRef.current.push(tick);
        addedNo = true;
      }
    });

    setQueueCount(yesQueueRef.current.length + noQueueRef.current.length);

    // Kick off display if not already animating
    if (addedYes && !currentYes && !yesTimerRef.current) popYes();
    if (addedNo && !currentNo && !noTimerRef.current) popNo();
  }, [book, changedPrices, currentYes, currentNo, popYes, popNo]);

  // Cleanup timers
  useEffect(() => {
    return () => {
      if (yesTimerRef.current) clearTimeout(yesTimerRef.current);
      if (noTimerRef.current) clearTimeout(noTimerRef.current);
    };
  }, []);

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

      {/* Sequential one-at-a-time trade ticker */}
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

        {/* Queue counter */}
        {queueCount > 0 && (
          <div className="absolute top-1 right-1 z-10 text-[7px] font-mono text-muted-foreground/70">
            +{queueCount}
          </div>
        )}

        {/* YES side — one at a time, right-aligned */}
        <AnimatePresence>
          {currentYes && (
            <motion.span
              key={currentYes.id}
              initial={{ opacity: 0.95, y: 4, scale: 0.9 }}
              animate={{ opacity: [0.95, 1, 0.7, 0], y: -44, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: FLIGHT_DURATION_MS / 1000, ease: "easeOut" }}
              className="absolute bottom-1 text-[8px] font-semibold whitespace-nowrap px-1.5 py-0.5 rounded-sm backdrop-blur-sm text-yes bg-yes/15 border border-yes/20"
              style={{ right: `${currentYes.xOffset}%` }}
            >
              {currentYes.label}
            </motion.span>
          )}
        </AnimatePresence>

        {/* NO side — one at a time, left-aligned */}
        <AnimatePresence>
          {currentNo && (
            <motion.span
              key={currentNo.id}
              initial={{ opacity: 0.95, y: 4, scale: 0.9 }}
              animate={{ opacity: [0.95, 1, 0.7, 0], y: -44, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: FLIGHT_DURATION_MS / 1000, ease: "easeOut" }}
              className="absolute bottom-1 text-[8px] font-semibold whitespace-nowrap px-1.5 py-0.5 rounded-sm backdrop-blur-sm text-no bg-no/15 border border-no/20"
              style={{ left: `${currentNo.xOffset}%` }}
            >
              {currentNo.label}
            </motion.span>
          )}
        </AnimatePresence>

        {!currentYes && !currentNo && queueCount === 0 && (
          <div className="flex h-full items-center justify-center text-[8px] text-muted-foreground/60">
            {connected ? "waiting for trades…" : "connecting…"}
          </div>
        )}
      </div>
    </div>
  );
}
