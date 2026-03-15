import { useRecentTrades, type BitqueryTrade } from "@/hooks/useRecentTrades";
import { Loader2, ArrowUpRight, ArrowDownRight, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

function truncateAddress(addr: string): string {
  if (!addr || addr.length < 10) return addr || "—";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function formatSize(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toFixed(2);
}

function formatRelativeTime(isoTimestamp: string, tick: number): string {
  void tick;
  const d = new Date(isoTimestamp);
  if (Number.isNaN(d.getTime())) return "just now";
  return formatDistanceToNow(d, { addSuffix: true, includeSeconds: true });
}

function TradeRow({ trade, isNew, nowTick }: { trade: BitqueryTrade; isNew: boolean; nowTick: number }) {
  const isBuy = trade.side === "BUY";
  const timeAgo = trade.timestamp ? formatRelativeTime(trade.timestamp, nowTick) : "just now";

  return (
    <div
      className={cn(
        "flex items-center gap-3 px-4 py-2.5 border-b border-border last:border-0 hover:bg-accent/30 transition-all text-xs",
        isNew && "animate-trade-flash"
      )}
    >
      <div className="shrink-0">
        {isBuy ? (
          <ArrowUpRight className="h-3.5 w-3.5 text-yes" />
        ) : (
          <ArrowDownRight className="h-3.5 w-3.5 text-no" />
        )}
      </div>
      <span className={cn("font-mono font-semibold w-12", isBuy ? "text-yes" : "text-no")}>
        {isBuy ? "BUY" : "SELL"}
      </span>
      <span className="font-mono text-foreground w-16 text-right">
        {trade.priceUsd > 0 ? `$${trade.priceUsd.toFixed(2)}` : `${(trade.price * 100).toFixed(0)}¢`}
      </span>
      <span className="font-mono text-muted-foreground w-16 text-right">
        {formatSize(trade.sideAmount)}
      </span>
      <span className="text-muted-foreground flex-1 truncate" title={trade.tokenName}>
        {trade.tokenName || truncateAddress(trade.tokenAddress)}
      </span>
      <span className="text-muted-foreground shrink-0">{timeAgo}</span>
      {trade.txHash && (
        <a
          href={`https://polygonscan.com/tx/${trade.txHash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground hover:text-primary transition-colors shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </div>
  );
}

interface RecentTradesPanelProps {
  conditionId?: string;
  tokenId?: string;
  limit?: number;
  pollMs?: number;
  className?: string;
}

export function RecentTradesPanel({ conditionId, tokenId, limit = 30, pollMs = 1_000, className }: RecentTradesPanelProps) {
  const { data: trades, isLoading, error } = useRecentTrades({ conditionId, tokenId, limit, pollMs });
  const [displayedTrades, setDisplayedTrades] = useState<BitqueryTrade[]>([]);
  const [newTradeIds, setNewTradeIds] = useState<Set<string>>(new Set());
  const [nowTick, setNowTick] = useState(0);

  const isFirstLoad = useRef(true);
  const displayedIdsRef = useRef<Set<string>>(new Set());
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const interval = setInterval(() => setNowTick((t) => t + 1), 1_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    return () => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
    };
  }, []);

  const markAsNew = useCallback((id: string) => {
    setNewTradeIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });

    const timer = setTimeout(() => {
      setNewTradeIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, 700);

    timersRef.current.push(timer);
  }, []);

  const insertTrade = useCallback((trade: BitqueryTrade) => {
    setDisplayedTrades((prev) => {
      const next = [trade, ...prev.filter((t) => t.id !== trade.id)].slice(0, limit);
      displayedIdsRef.current = new Set(next.map((t) => t.id));
      return next;
    });
    markAsNew(trade.id);
  }, [limit, markAsNew]);

  useEffect(() => {
    if (!trades || trades.length === 0) return;

    if (isFirstLoad.current) {
      isFirstLoad.current = false;
      const seeded = trades.slice(0, limit);
      setDisplayedTrades(seeded);
      displayedIdsRef.current = new Set(seeded.map((t) => t.id));
      return;
    }

    const unseen = trades.filter((trade) => !displayedIdsRef.current.has(trade.id));
    if (unseen.length === 0) return;

    const staged = [...unseen].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    if (import.meta.env.DEV) {
      console.debug("[TradesStream] new rows", {
        count: staged.length,
        scope: tokenId ?? conditionId ?? "global",
      });
    }

    staged.forEach((trade, idx) => {
      const timer = setTimeout(() => insertTrade(trade), idx * 110);
      timersRef.current.push(timer);
    });
  }, [trades, limit, insertTrade, tokenId, conditionId]);

  useEffect(() => {
    setDisplayedTrades((prev) => prev.slice(0, limit));
  }, [limit]);

  const rows = displayedTrades;

  return (
    <div className={cn("rounded-xl border border-border bg-card overflow-hidden", className)}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-foreground">Recent Trades</h3>
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yes opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-yes"></span>
          </span>
        </div>
        <span className="text-[10px] font-mono text-muted-foreground">LIVE stream</span>
      </div>

      {/* Header row */}
      <div className="flex items-center gap-3 px-4 py-2 text-[10px] font-medium text-muted-foreground uppercase tracking-wider border-b border-border bg-muted/10">
        <span className="w-3.5" />
        <span className="w-12">Side</span>
        <span className="w-16 text-right">Price</span>
        <span className="w-16 text-right">Size</span>
        <span className="flex-1">Token</span>
        <span className="shrink-0">Time</span>
        <span className="w-3 shrink-0" />
      </div>

      {isLoading && rows.length === 0 && (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {error && rows.length === 0 && (
        <div className="px-4 py-6 text-center text-xs text-destructive">
          Failed to load trades: {(error as Error).message}
        </div>
      )}

      {!isLoading && !error && rows.length === 0 && (
        <div className="px-4 py-8 text-center text-xs text-muted-foreground">
          No recent trades found.
        </div>
      )}

      {rows.length > 0 && (
        <div className="max-h-[400px] overflow-y-auto">
          <AnimatePresence initial={false}>
            {rows.map((trade) => (
              <motion.div
                key={trade.id}
                initial={{ opacity: 0, y: -20, height: 0 }}
                animate={{ opacity: 1, y: 0, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
              >
                <TradeRow trade={trade} isNew={newTradeIds.has(trade.id)} nowTick={nowTick} />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
