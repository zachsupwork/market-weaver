import { useMarketStore } from "@/stores/useMarketStore";

interface Props {
  /** The YES token ID for the top candidate */
  tokenId?: string;
}

/** Compact bid/ask spread display for event preview cards */
export function MiniSpread({ tokenId }: Props) {
  const asset = useMarketStore((s) => (tokenId ? s.assets[tokenId] : undefined));

  if (!asset) return null;

  const bestBid = asset.bestBid ?? (asset.bids[0] ? parseFloat(asset.bids[0].price) : null);
  const bestAsk = asset.bestAsk ?? (asset.asks[0] ? parseFloat(asset.asks[0].price) : null);

  if (bestBid === null && bestAsk === null) return null;

  return (
    <div className="flex items-center gap-2 text-[10px] font-mono mt-1">
      {bestBid !== null && (
        <span className="text-yes">
          Bid {Math.round(bestBid * 100)}¢
        </span>
      )}
      {bestBid !== null && bestAsk !== null && (
        <span className="text-muted-foreground">·</span>
      )}
      {bestAsk !== null && (
        <span className="text-no">
          Ask {Math.round(bestAsk * 100)}¢
        </span>
      )}
    </div>
  );
}
