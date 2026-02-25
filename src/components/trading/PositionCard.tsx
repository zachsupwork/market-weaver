import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown } from "lucide-react";

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
}

export function PositionCard({ position }: PositionCardProps) {
  const size = parseFloat(position.size || "0");
  const pnl = parseFloat(position.pnl || "0");
  const isProfitable = pnl >= 0;

  return (
    <div className="rounded-lg border border-border bg-card p-4 transition-all hover:border-primary/20">
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">
            {position.market || position.condition_id?.substring(0, 16) + "..."}
          </p>
          <p className="text-xs text-muted-foreground">
            {position.outcome || "Unknown outcome"}
          </p>
        </div>
        <div className={cn("flex items-center gap-1 text-sm font-mono font-bold", isProfitable ? "text-yes" : "text-no")}>
          {isProfitable ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
          {pnl >= 0 ? "+" : ""}{pnl.toFixed(2)}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs">
        <div>
          <span className="text-muted-foreground block">Size</span>
          <span className="font-mono">{size.toFixed(2)}</span>
        </div>
        <div>
          <span className="text-muted-foreground block">Avg Entry</span>
          <span className="font-mono">{parseFloat(position.avgPrice || "0").toFixed(2)}¢</span>
        </div>
        <div>
          <span className="text-muted-foreground block">Mark</span>
          <span className="font-mono">{parseFloat(position.currentPrice || "0").toFixed(2)}¢</span>
        </div>
      </div>
    </div>
  );
}
