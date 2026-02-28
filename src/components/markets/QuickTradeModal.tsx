import { useState } from "react";
import { cn } from "@/lib/utils";
import { X, Minus, Plus, Loader2 } from "lucide-react";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useNavigate } from "react-router-dom";
import type { NormalizedMarket } from "@/lib/polymarket-api";

interface QuickTradeModalProps {
  market: NormalizedMarket;
  initialOutcome: number;
  onClose: () => void;
}

export function QuickTradeModal({ market, initialOutcome, onClose }: QuickTradeModalProps) {
  const [selectedOutcome, setSelectedOutcome] = useState(initialOutcome);
  const [amount, setAmount] = useState(0);
  const { isConnected } = useAccount();
  const navigate = useNavigate();

  const outcomes = market.outcomes || ["Yes", "No"];
  const prices = market.outcomePrices || [];
  const price = prices[selectedOutcome] ?? 0.5;
  const shares = price > 0 ? amount / price : 0;
  const potentialReturn = shares * (1 - price);

  const quickAmounts = [1, 5, 10, 100];

  function goToFullTrade() {
    navigate(`/trade/${encodeURIComponent(market.condition_id)}`);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-t-2xl sm:rounded-2xl border border-border bg-card p-5 animate-slide-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {market.icon && (
              <img src={market.icon} alt="" className="h-10 w-10 rounded-lg bg-muted shrink-0" />
            )}
            <div className="min-w-0">
              <h3 className="text-sm font-semibold leading-snug line-clamp-2">{market.question}</h3>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-muted transition-all shrink-0 ml-2">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {/* Outcome selector */}
        <div className="flex gap-2 mb-4">
          {outcomes.map((outcome: string, i: number) => {
            const p = prices[i] ?? 0;
            const isYes = outcome === "Yes" || i === 0;
            return (
              <button
                key={i}
                onClick={() => setSelectedOutcome(i)}
                className={cn(
                  "flex-1 rounded-lg border p-3 transition-all text-center",
                  selectedOutcome === i
                    ? isYes
                      ? "border-yes/40 bg-yes/10"
                      : "border-no/40 bg-no/10"
                    : "border-border bg-muted hover:border-primary/20"
                )}
              >
                <span className={cn("text-xs font-semibold", isYes ? "text-yes" : "text-no")}>
                  {outcome}
                </span>
                <span className="block font-mono text-lg font-bold mt-0.5">
                  {Math.round(p * 100)}¢
                </span>
              </button>
            );
          })}
        </div>

        {!isConnected ? (
          <div className="text-center py-4">
            <p className="text-xs text-muted-foreground mb-3">Connect wallet to trade</p>
            <ConnectButton />
          </div>
        ) : (
          <>
            {/* Amount input */}
            <div className="flex items-center justify-center gap-4 py-3">
              <button onClick={() => setAmount(Math.max(0, amount - 1))} disabled={amount <= 0}
                className="h-10 w-10 rounded-full border border-border bg-muted flex items-center justify-center hover:bg-accent transition-all disabled:opacity-30">
                <Minus className="h-4 w-4" />
              </button>
              <span className="font-mono text-4xl font-bold min-w-[120px] text-center">${amount}</span>
              <button onClick={() => setAmount(amount + 1)}
                className="h-10 w-10 rounded-full border border-border bg-muted flex items-center justify-center hover:bg-accent transition-all">
                <Plus className="h-4 w-4" />
              </button>
            </div>

            {/* Quick amounts */}
            <div className="flex gap-2 mb-4">
              {quickAmounts.map((qa) => (
                <button key={qa} onClick={() => setAmount((prev) => prev + qa)}
                  className="flex-1 rounded-lg border border-border bg-muted py-2 text-xs font-mono font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-all">
                  +${qa}
                </button>
              ))}
              <button onClick={() => setAmount(0)}
                className="rounded-lg border border-border bg-muted px-3 py-2 text-xs font-mono text-muted-foreground hover:bg-accent transition-all">
                Clear
              </button>
            </div>

            {/* Summary */}
            {amount > 0 && (
              <div className="space-y-1 mb-3 text-xs px-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Est. Shares</span>
                  <span className="font-mono">{shares.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Potential Return</span>
                  <span className="font-mono text-yes">+${potentialReturn.toFixed(2)}</span>
                </div>
              </div>
            )}

            {/* CTA - goes to full trade page */}
            <button
              onClick={goToFullTrade}
              className={cn(
                "w-full rounded-lg py-3 text-sm font-bold transition-all",
                selectedOutcome === 0
                  ? "bg-yes text-yes-foreground hover:bg-yes/90"
                  : "bg-no text-no-foreground hover:bg-no/90"
              )}
            >
              {amount > 0
                ? `Buy ${outcomes[selectedOutcome]} — $${amount}`
                : `Trade ${outcomes[selectedOutcome]}`}
            </button>
          </>
        )}

        {/* Link to full page */}
        <button
          onClick={goToFullTrade}
          className="w-full text-center text-xs text-primary hover:underline mt-3 py-1"
        >
          Open full trading view →
        </button>
      </div>
    </div>
  );
}