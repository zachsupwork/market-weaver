import { useOrderbook } from "@/hooks/useOrderbook";
import { cn } from "@/lib/utils";

interface OrderbookViewProps {
  tokenId: string | undefined;
  outcome: string;
}

export function OrderbookView({ tokenId, outcome }: OrderbookViewProps) {
  const { data: book, isLoading } = useOrderbook(tokenId);

  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <h3 className="text-sm font-semibold mb-3">Orderbook — {outcome}</h3>
        <div className="space-y-1">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-5 rounded bg-muted animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!book) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <h3 className="text-sm font-semibold mb-3">Orderbook — {outcome}</h3>
        <p className="text-xs text-muted-foreground">No orderbook data available</p>
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
      <h3 className="text-sm font-semibold mb-3">Orderbook — {outcome}</h3>
      <div className="grid grid-cols-2 text-[10px] text-muted-foreground font-mono mb-1 px-1">
        <span>Price</span>
        <span className="text-right">Size</span>
      </div>

      {/* Asks (sells) - red */}
      <div className="space-y-px mb-1">
        {asks.map((level, i) => {
          const pct = (parseFloat(level.size) / maxSize) * 100;
          return (
            <div key={`ask-${i}`} className="relative flex justify-between px-1 py-0.5 text-xs font-mono">
              <div
                className="absolute inset-y-0 right-0 bg-no/10 rounded-sm"
                style={{ width: `${pct}%` }}
              />
              <span className="relative text-no">{parseFloat(level.price).toFixed(2)}</span>
              <span className="relative text-muted-foreground">{parseFloat(level.size).toFixed(1)}</span>
            </div>
          );
        })}
      </div>

      {/* Spread */}
      {asks.length > 0 && bids.length > 0 && (
        <div className="text-center text-[10px] text-muted-foreground py-1 border-y border-border my-1">
          Spread: {(parseFloat(asks[asks.length - 1]?.price || "0") - parseFloat(bids[0]?.price || "0")).toFixed(3)}
        </div>
      )}

      {/* Bids (buys) - green */}
      <div className="space-y-px">
        {bids.map((level, i) => {
          const pct = (parseFloat(level.size) / maxSize) * 100;
          return (
            <div key={`bid-${i}`} className="relative flex justify-between px-1 py-0.5 text-xs font-mono">
              <div
                className="absolute inset-y-0 right-0 bg-yes/10 rounded-sm"
                style={{ width: `${pct}%` }}
              />
              <span className="relative text-yes">{parseFloat(level.price).toFixed(2)}</span>
              <span className="relative text-muted-foreground">{parseFloat(level.size).toFixed(1)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
