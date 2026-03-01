import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, X, ExternalLink } from "lucide-react";
import { cancelOrder } from "@/lib/polymarket-api";
import { toast } from "sonner";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface PositionCardProps {
  position: {
    asset: string;
    condition_id: string;
    size: string;
    avgPrice?: string;
    currentPrice?: string;
    market?: string;
    outcome?: string;
    pnl?: string;
    marketSlug?: string;
    marketImage?: string;
    marketEndDate?: string;
    eventSlug?: string;
    category?: string;
  };
  showCancel?: boolean;
  orderId?: string;
  compact?: boolean;
}

export function PositionCard({ position, showCancel, orderId, compact }: PositionCardProps) {
  const [cancelling, setCancelling] = useState(false);
  const size = parseFloat(position.size || "0");
  const avgPrice = parseFloat(position.avgPrice || "0");
  const currentPrice = parseFloat(position.currentPrice || "0");
  const pnl = parseFloat(position.pnl || "0");
  const isProfitable = pnl >= 0;
  const pnlPct = avgPrice > 0 ? ((currentPrice - avgPrice) / avgPrice) * 100 : 0;

  const marketValue = size * currentPrice;

  const polymarketUrl = position.eventSlug
    ? `https://polymarket.com/event/${position.eventSlug}`
    : position.marketSlug
    ? `https://polymarket.com/event/${position.marketSlug}`
    : null;

  const handleCancel = async () => {
    if (!orderId) return;
    setCancelling(true);
    try {
      const result = await cancelOrder(orderId);
      if (result.ok) {
        toast.success("Order cancelled");
      } else {
        toast.error(result.error || "Cancel failed");
      }
    } catch (err: any) {
      toast.error(err.message || "Cancel failed");
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className={cn(
      "rounded-lg border border-border bg-card transition-all hover:border-primary/20",
      compact ? "p-3" : "p-4"
    )}>
      {/* Header: Market name + outcome badge */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          {position.marketImage && (
            <img
              src={position.marketImage}
              alt=""
              className="h-10 w-10 rounded-md object-cover shrink-0 mt-0.5"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          )}
          <div className="flex-1 min-w-0">
            <p className={cn("font-semibold leading-tight", compact ? "text-xs" : "text-sm")}>
              {position.market || position.condition_id?.substring(0, 20) + "…"}
            </p>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              <Badge
                variant={position.outcome === "Yes" ? "default" : position.outcome === "No" ? "destructive" : "secondary"}
                className="text-[10px] h-5"
              >
                {position.outcome || "Unknown"}
              </Badge>
              {position.category && (
                <span className="text-[10px] text-muted-foreground">{position.category}</span>
              )}
              {position.marketEndDate && (
                <span className="text-[10px] text-muted-foreground">
                  Ends {new Date(position.marketEndDate).toLocaleDateString()}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {showCancel && orderId && (
            <button
              onClick={handleCancel}
              disabled={cancelling}
              className="rounded-md border border-destructive/30 p-1 hover:bg-destructive/10 transition-all disabled:opacity-50"
              title="Cancel order"
            >
              {cancelling ? (
                <Loader2 className="h-3 w-3 animate-spin text-destructive" />
              ) : (
                <X className="h-3 w-3 text-destructive" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Stats grid */}
      <div className={cn("grid gap-3 text-xs", compact ? "grid-cols-3" : "grid-cols-5")}>
        <div>
          <span className="text-muted-foreground block">Shares</span>
          <span className="font-mono font-semibold">{size.toFixed(2)}</span>
        </div>
        <div>
          <span className="text-muted-foreground block">Avg Entry</span>
          <span className="font-mono">{(avgPrice * 100).toFixed(1)}¢</span>
        </div>
        <div>
          <span className="text-muted-foreground block">Current</span>
          <span className="font-mono">{(currentPrice * 100).toFixed(1)}¢</span>
        </div>
        {!compact && (
          <>
            <div>
              <span className="text-muted-foreground block">Value</span>
              <span className="font-mono">${marketValue.toFixed(2)}</span>
            </div>
            <div>
              <span className="text-muted-foreground block">P&L</span>
              <div className={cn("flex items-center gap-1 font-mono font-bold", isProfitable ? "text-yes" : "text-no")}>
                {isProfitable ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                <span>{pnl >= 0 ? "+" : ""}{pnl.toFixed(2)}</span>
                <span className="text-[10px] font-normal opacity-70">
                  ({pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(1)}%)
                </span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* External links */}
      {polymarketUrl && (
        <div className="mt-3 pt-2 border-t border-border flex gap-3">
          <a
            href={polymarketUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
          >
            <ExternalLink className="h-3 w-3" /> View on Polymarket
          </a>
          {position.asset && (
            <a
              href={`https://polygonscan.com/token/0x4D97DCd97eC945f40cF65F87097ACe5EA0476045#inventory`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
            >
              <ExternalLink className="h-3 w-3" /> Polygonscan
            </a>
          )}
        </div>
      )}
    </div>
  );
}
