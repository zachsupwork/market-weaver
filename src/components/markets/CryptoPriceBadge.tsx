import { useLiveDataStore } from "@/stores/useLiveDataStore";
import { memo, useRef, useState, useEffect } from "react";

interface Props {
  /** Base symbol like "btc", "eth", "sol" */
  symbol: string;
}

function formatCryptoPrice(price: number): string {
  if (price >= 1000) return `$${price.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  if (price >= 1) return `$${price.toFixed(2)}`;
  return `$${price.toFixed(4)}`;
}

/** Shows a live crypto price badge for crypto-related markets */
export const CryptoPriceBadge = memo(function CryptoPriceBadge({ symbol }: Props) {
  const data = useLiveDataStore((s) => s.getCryptoPrice(symbol));
  const [flash, setFlash] = useState(false);
  const prevPrice = useRef<number | null>(null);

  useEffect(() => {
    if (data && prevPrice.current !== null && data.price !== prevPrice.current) {
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 500);
      prevPrice.current = data.price;
      return () => clearTimeout(t);
    }
    if (data) prevPrice.current = data.price;
  }, [data?.price]);

  if (!data) return null;

  const direction =
    prevPrice.current !== null && data.price > prevPrice.current
      ? "up"
      : prevPrice.current !== null && data.price < prevPrice.current
      ? "down"
      : null;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md bg-card border border-border px-1.5 py-0.5 font-mono text-[10px] font-bold transition-colors ${
        flash
          ? direction === "up"
            ? "text-yes border-yes/30"
            : direction === "down"
            ? "text-no border-no/30"
            : "text-primary"
          : "text-foreground"
      }`}
    >
      {symbol.toUpperCase()}
      <span className="text-muted-foreground/70">
        {formatCryptoPrice(data.price)}
      </span>
    </span>
  );
});
