import { useMarketStore } from "@/stores/useMarketStore";
import { Progress } from "@/components/ui/progress";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useRef } from "react";

interface Props {
  label: string;
  price: number;
  tokenId?: string;
}

export function CandidatePreviewRow({ label, price, tokenId }: Props) {
  const wsPrice = useMarketStore((s) =>
    tokenId ? s.assets[tokenId]?.lastTradePrice : null
  );

  const currentPrice = wsPrice ?? price;
  const pct = Math.round(currentPrice * 100);

  const [flash, setFlash] = useState(false);
  const prevPrice = useRef(currentPrice);

  useEffect(() => {
    if (Math.abs(currentPrice - prevPrice.current) > 0.001) {
      setFlash(true);
      prevPrice.current = currentPrice;
      const t = setTimeout(() => setFlash(false), 600);
      return () => clearTimeout(t);
    }
  }, [currentPrice]);

  return (
    <div className="flex items-center gap-2 py-0.5">
      <span className="text-xs text-foreground truncate flex-1 min-w-0">
        {label}
      </span>
      <div className="w-16 shrink-0">
        <Progress value={pct} className="h-1.5" />
      </div>
      <AnimatePresence mode="popLayout">
        <motion.span
          key={pct}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 4 }}
          transition={{ duration: 0.2 }}
          className={`text-xs font-mono font-semibold w-8 text-right shrink-0 ${
            flash ? "text-primary" : "text-muted-foreground"
          }`}
        >
          {pct}%
        </motion.span>
      </AnimatePresence>
    </div>
  );
}
