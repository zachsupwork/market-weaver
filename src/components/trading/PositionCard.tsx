import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, X, ExternalLink, ShoppingCart, Trophy, Loader2 } from "lucide-react";
import { cancelOrder } from "@/lib/polymarket-api";
import { toast } from "sonner";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

interface PositionCardProps {
  position: {
    asset: string;
    condition_id: string;
    size: string;
    avgPrice?: string;
    currentPrice?: string;
    currentValue?: string;
    market?: string;
    outcome?: string;
    pnl?: string;
    cashPnl?: string;
    percentPnl?: string;
    marketSlug?: string;
    marketImage?: string;
    marketEndDate?: string;
    eventSlug?: string;
    category?: string;
    redeemable?: boolean;
    resolved?: boolean;
    isWinner?: boolean;
    marketActive?: boolean;
  };
  showCancel?: boolean;
  orderId?: string;
  compact?: boolean;
  onSell?: (position: PositionCardProps["position"]) => void;
  onClaim?: (position: PositionCardProps["position"]) => void;
}

export function PositionCard({ position, showCancel, orderId, compact, onSell, onClaim }: PositionCardProps) {
  const [cancelling, setCancelling] = useState(false);
  const navigate = useNavigate();
  const size = parseFloat(position.size || "0");
  const avgPrice = parseFloat(position.avgPrice || "0");
  const currentPrice = parseFloat(position.currentPrice || "0");
  const cashPnl = parseFloat(position.cashPnl || position.pnl || "0");
  const percentPnl = parseFloat(position.percentPnl || "0");
  const isProfitable = cashPnl >= 0;
  const pnlPct = percentPnl !== 0 ? percentPnl : (avgPrice > 0 ? ((currentPrice - avgPrice) / avgPrice) * 100 : 0);

  const marketValue = parseFloat(position.currentValue || "0") || size * currentPrice;

  const polymarketUrl = position.eventSlug
    ? `https://polymarket.com/event/${position.eventSlug}`
    : position.marketSlug
    ? `https://polymarket.com/market/${position.marketSlug}`
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

  const handleSellClick = () => {
    if (onSell) {
      onSell(position);
    } else if (position.condition_id) {
      navigate(`/trade/${position.condition_id}`);
    }
  };

  // Probability bar width (current price as %)
  const probPct = Math.round(currentPrice * 100);

  return (
    <div className={cn(
      "rounded-lg border border-border bg-card transition-all hover:border-primary/20",
      position.redeemable && position.isWinner && "border-yes/30 bg-yes/5",
      position.resolved && !position.isWinner && "opacity-60",
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
              {position.redeemable && position.isWinner && (
                <Badge variant="default" className="text-[10px] h-5 bg-yes text-yes-foreground">
                  <Trophy className="h-3 w-3 mr-0.5" /> Winner
                </Badge>
              )}
              {position.resolved && !position.isWinner && (
                <Badge variant="secondary" className="text-[10px] h-5">
                  Resolved
                </Badge>
              )}
              {position.category && (
                <span className="text-[10px] text-muted-foreground">{position.category}</span>
              )}
              {position.marketEndDate && (
                <span className="text-[10px] text-muted-foreground">
                  {position.resolved ? "Ended" : "Ends"} {new Date(position.marketEndDate).toLocaleDateString()}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* Sell button */}
          {!position.resolved && size > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={handleSellClick}
            >
              <ShoppingCart className="h-3 w-3" /> Sell
            </Button>
          )}
          {/* Redeem button for winners */}
          {position.redeemable && position.isWinner && (
            <Button
              variant="default"
              size="sm"
              className="h-7 text-xs gap-1 bg-yes hover:bg-yes/90 text-yes-foreground"
              onClick={() => toast.info("Redemption coming soon — redeem on Polymarket directly for now.")}
            >
              <Trophy className="h-3 w-3" /> Redeem
            </Button>
          )}
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

      {/* Probability bar */}
      {!compact && currentPrice > 0 && !position.resolved && (
        <div className="mb-3">
          <div className="flex justify-between text-[10px] text-muted-foreground mb-0.5">
            <span>Probability</span>
            <span className="font-mono">{probPct}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all", position.outcome === "Yes" ? "bg-yes" : "bg-no")}
              style={{ width: `${probPct}%` }}
            />
          </div>
        </div>
      )}

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
          <span className={cn("font-mono", currentPrice > 0 ? "text-foreground" : "text-muted-foreground")}>
            {currentPrice > 0 ? `${(currentPrice * 100).toFixed(1)}¢` : "—"}
          </span>
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
                <span>{cashPnl >= 0 ? "+" : ""}{cashPnl.toFixed(2)}</span>
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
