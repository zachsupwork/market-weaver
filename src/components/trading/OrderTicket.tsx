import { useState } from "react";
import { cn } from "@/lib/utils";
import { placeOrder } from "@/lib/polymarket-api";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface OrderTicketProps {
  tokenId: string;
  outcome: string; // "Yes" or "No"
  currentPrice: number;
}

export function OrderTicket({ tokenId, outcome, currentPrice }: OrderTicketProps) {
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [price, setPrice] = useState(currentPrice.toFixed(2));
  const [size, setSize] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isYes = outcome === "Yes";
  const total = (parseFloat(price || "0") * parseFloat(size || "0")).toFixed(2);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!size || parseFloat(size) <= 0) {
      toast.error("Enter a valid size");
      return;
    }
    setSubmitting(true);
    try {
      const result = await placeOrder({
        tokenId,
        side,
        price: parseFloat(price),
        size: parseFloat(size),
      });
      if (result.ok) {
        toast.success(`${side} ${outcome} order placed`);
        setSize("");
      } else {
        toast.error(result.error || "Order failed");
      }
    } catch (err: any) {
      toast.error(err.message || "Order failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border border-border bg-card p-4"
    >
      <h3 className="text-sm font-semibold mb-3">
        Trade <span className={isYes ? "text-yes" : "text-no"}>{outcome}</span>
      </h3>

      {/* Side toggle */}
      <div className="flex gap-1 mb-3">
        <button
          type="button"
          onClick={() => setSide("BUY")}
          className={cn(
            "flex-1 rounded-md py-1.5 text-xs font-semibold transition-all",
            side === "BUY"
              ? "bg-yes/20 text-yes border border-yes/40"
              : "bg-muted text-muted-foreground border border-transparent"
          )}
        >
          Buy
        </button>
        <button
          type="button"
          onClick={() => setSide("SELL")}
          className={cn(
            "flex-1 rounded-md py-1.5 text-xs font-semibold transition-all",
            side === "SELL"
              ? "bg-no/20 text-no border border-no/40"
              : "bg-muted text-muted-foreground border border-transparent"
          )}
        >
          Sell
        </button>
      </div>

      {/* Price input */}
      <div className="mb-2">
        <label className="text-[10px] text-muted-foreground mb-1 block">Limit Price (¢)</label>
        <input
          type="number"
          step="0.01"
          min="0.01"
          max="0.99"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      {/* Size input */}
      <div className="mb-3">
        <label className="text-[10px] text-muted-foreground mb-1 block">Shares</label>
        <input
          type="number"
          step="1"
          min="1"
          value={size}
          onChange={(e) => setSize(e.target.value)}
          placeholder="0"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      {/* Total */}
      <div className="flex justify-between text-xs mb-3 px-1">
        <span className="text-muted-foreground">Est. Total</span>
        <span className="font-mono text-foreground">${total}</span>
      </div>

      <button
        type="submit"
        disabled={submitting || !size}
        className={cn(
          "w-full rounded-md py-2.5 text-sm font-bold transition-all disabled:opacity-50",
          side === "BUY"
            ? "bg-yes text-yes-foreground hover:bg-yes/90"
            : "bg-no text-no-foreground hover:bg-no/90"
        )}
      >
        {submitting ? (
          <Loader2 className="h-4 w-4 animate-spin mx-auto" />
        ) : (
          `${side} ${outcome}`
        )}
      </button>
    </form>
  );
}
