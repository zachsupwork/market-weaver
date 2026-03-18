import { useMarketStore } from "@/stores/useMarketStore";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import type { NormalizedMarket } from "@/lib/normalizePolymarket";

function formatVol(n: number): string {
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

interface Props {
  market: NormalizedMarket;
  selected: boolean;
  onSelect: () => void;
}

/** Compact market card for event page grid — shows question + YES/NO prices */
export function EventMarketCard({ market, selected, onSelect }: Props) {
  const yesTokenId = market.clobTokenIds?.[0];
  const noTokenId = market.clobTokenIds?.[1];

  const wsYes = useMarketStore((s) => (yesTokenId ? s.assets[yesTokenId]?.lastTradePrice : null));
  const wsNo = useMarketStore((s) => (noTokenId ? s.assets[noTokenId]?.lastTradePrice : null));

  const yesPrice = wsYes ?? market.outcomePrices?.[0] ?? 0.5;
  const noPrice = wsNo ?? market.outcomePrices?.[1] ?? 0.5;
  const yesCents = Math.round(yesPrice * 100);
  const noCents = Math.round(noPrice * 100);

  return (
    <button
      onClick={onSelect}
      className={cn(
        "w-full rounded-xl border p-3 text-left transition-all",
        selected
          ? "border-primary/50 bg-primary/5 shadow-sm shadow-primary/10"
          : "border-border bg-card hover:border-primary/30 hover:bg-muted/30"
      )}
    >
      <p className="text-sm font-medium leading-snug line-clamp-2 mb-2">
        {market.question}
      </p>

      {/* Price row */}
      <div className="flex items-center gap-2">
        <AnimatePresence mode="popLayout">
          <motion.span
            key={`y-${yesCents}`}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-md bg-yes/15 border border-yes/25 px-2 py-0.5 text-xs font-mono font-semibold text-yes"
          >
            Yes {yesCents}¢
          </motion.span>
        </AnimatePresence>
        <AnimatePresence mode="popLayout">
          <motion.span
            key={`n-${noCents}`}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-md bg-no/15 border border-no/25 px-2 py-0.5 text-xs font-mono font-semibold text-no"
          >
            No {noCents}¢
          </motion.span>
        </AnimatePresence>
        <span className="ml-auto text-[10px] text-muted-foreground font-mono">
          {formatVol(market.volume24h)}
        </span>
      </div>
    </button>
  );
}
