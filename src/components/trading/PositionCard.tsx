import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, X } from "lucide-react";
import { cancelOrder } from "@/lib/polymarket-api";
import { toast } from "sonner";
import { useState } from "react";
import { Loader2 } from "lucide-react";

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
  };
  showCancel?: boolean;
  orderId?: string;
  compact?: boolean;
}

export function PositionCard({ position, showCancel, orderId, compact }: PositionCardProps) {
  const [cancelling, setCancelling] = useState(false);
  const size = parseFloat(position.size || "0");
  const pnl = parseFloat(position.pnl || "0");
  const isProfitable = pnl >= 0;

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
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1 min-w-0">
          <p className={cn("font-semibold truncate", compact ? "text-xs" : "text-sm")}>
            {position.market || position.condition_id?.substring(0, 16) + "..."}
          </p>
          <p className="text-xs text-muted-foreground">
            {position.outcome || "Unknown outcome"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className={cn("flex items-center gap-1 font-mono font-bold", compact ? "text-xs" : "text-sm", isProfitable ? "text-yes" : "text-no")}>
            {isProfitable ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
            {pnl >= 0 ? "+" : ""}{pnl.toFixed(2)}
          </div>
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

      <div className={cn("grid gap-2 text-xs", compact ? "grid-cols-2" : "grid-cols-3")}>
        <div>
          <span className="text-muted-foreground block">Size</span>
          <span className="font-mono">{size.toFixed(2)}</span>
        </div>
        <div>
          <span className="text-muted-foreground block">Avg Entry</span>
          <span className="font-mono">{parseFloat(position.avgPrice || "0").toFixed(2)}¢</span>
        </div>
        {!compact && (
          <div>
            <span className="text-muted-foreground block">Mark</span>
            <span className="font-mono">{parseFloat(position.currentPrice || "0").toFixed(2)}¢</span>
          </div>
        )}
      </div>
    </div>
  );
}
