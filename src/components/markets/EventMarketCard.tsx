import { useMarketStore } from "@/stores/useMarketStore";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { Progress } from "@/components/ui/progress";
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

/** Polymarket-style market card with large probability, colored pills, and progress bar */
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
        "w-full rounded-xl border p-4 text-left transition-all group",
        selected
          ? "border-primary/50 bg-primary/5 shadow-md shadow-primary/10 ring-1 ring-primary/20"
          : "border-border bg-card hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 hover:scale-[1.01]"
      )}
    >
      {/* Question */}
      <p className="text-sm font-semibold leading-snug line-clamp-2 mb-3 group-hover:text-foreground transition-colors">
        {market.question}
      </p>

      {/* Large probability */}
      <div className="flex items-end justify-between mb-2">
        <AnimatePresence mode="popLayout">
          <motion.span
            key={yesCents}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-2xl font-bold font-mono text-yes"
          >
            {yesCents}%
          </motion.span>
        </AnimatePresence>
        <span className="text-[10px] text-muted-foreground font-mono mb-1">
          {formatVol(market.volume24h)} vol
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-2 rounded-full bg-muted overflow-hidden mb-3">
        <motion.div
          className={cn(
            "h-full rounded-full transition-all duration-500",
            yesCents >= 50 ? "bg-yes" : "bg-no"
          )}
          initial={false}
          animate={{ width: `${yesCents}%` }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        />
      </div>

      {/* YES / NO pills */}
      <div className="flex items-center gap-2">
        <span className="flex-1 rounded-lg bg-yes/15 border border-yes/25 px-2.5 py-1.5 text-center text-xs font-mono font-bold text-yes">
          YES {yesCents}¢
        </span>
        <span className="flex-1 rounded-lg bg-no/15 border border-no/25 px-2.5 py-1.5 text-center text-xs font-mono font-bold text-no">
          NO {noCents}¢
        </span>
      </div>
    </button>
  );
}
