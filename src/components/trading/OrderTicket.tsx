import { useState } from "react";
import { cn } from "@/lib/utils";
import { postSignedOrder } from "@/lib/polymarket-api";
import { toast } from "sonner";
import { Loader2, Wallet, Shield, ChevronDown, ChevronUp, AlertTriangle } from "lucide-react";
import { useAccount, useSignTypedData } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useUsdcApproval } from "@/hooks/useUsdcApproval";
import { supabase } from "@/integrations/supabase/client";

interface OrderTicketProps {
  tokenId: string;
  outcome: string;
  currentPrice: number;
  conditionId?: string;
  isTradable?: boolean;
}

const TRADING_AGE_KEY = "polyview_trading_age_confirmed";

export function OrderTicket({ tokenId, outcome, currentPrice, conditionId, isTradable = true }: OrderTicketProps) {
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [price, setPrice] = useState(currentPrice.toFixed(2));
  const [size, setSize] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [orderType, setOrderType] = useState<"GTC" | "FOK" | "GTD">("GTC");
  const { isConnected, address } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();

  const totalUsdc = parseFloat(price || "0") * parseFloat(size || "0");
  const { needsApproval, approve, isApproving, usdcBalance } = useUsdcApproval(
    side === "BUY" ? totalUsdc : 0
  );

  const isYes = outcome === "Yes";
  const total = totalUsdc.toFixed(2);
  const potentialReturn = side === "BUY"
    ? (parseFloat(size || "0") * (1 - parseFloat(price || "0"))).toFixed(2)
    : (parseFloat(size || "0") * parseFloat(price || "0")).toFixed(2);

  const hasInsufficientBalance = side === "BUY" && totalUsdc > usdcBalance && usdcBalance > 0;
  const ageConfirmed = localStorage.getItem(TRADING_AGE_KEY) === "true";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isConnected || !address) {
      toast.error("Connect your wallet first");
      return;
    }
    if (!isTradable) {
      toast.error("This market is not currently tradable");
      return;
    }
    if (!ageConfirmed) {
      toast.error("Please confirm age & jurisdiction in Settings before trading");
      return;
    }
    if (!size || parseFloat(size) <= 0) {
      toast.error("Enter a valid size");
      return;
    }
    if (hasInsufficientBalance) {
      toast.error("Insufficient USDC balance");
      return;
    }

    // Check if user is logged in — attempt auto anonymous sign-in
    let { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      const { error: anonErr } = await supabase.auth.signInAnonymously();
      if (anonErr) {
        toast.error("Sign in (guest is fine) to trade", {
          description: "Go to Trading Settings to authenticate",
          action: { label: "Settings", onClick: () => window.location.href = "/settings/polymarket" },
        });
        return;
      }
      const refreshed = await supabase.auth.getSession();
      session = refreshed.data.session;
      if (!session) {
        toast.error("Session issue — visit Trading Settings to sign in");
        return;
      }
    }

    if (!showConfirm) {
      setShowConfirm(true);
      return;
    }

    setSubmitting(true);
    try {
      // Build order object for signing
      const orderData = {
        tokenID: tokenId,
        side: side.toUpperCase(),
        price: parseFloat(price).toFixed(2),
        size: parseFloat(size).toFixed(2),
        type: orderType,
        feeRateBps: "0",
        nonce: Math.floor(Math.random() * 1e15).toString(),
        expiration: "0",
      };

      // Submit signed order to backend (backend adds L2 HMAC headers)
      const result = await postSignedOrder(orderData);

      if (result.ok) {
        toast.success(`${side} ${outcome} order placed successfully`);
        setSize("");
        setShowConfirm(false);
      } else if (result.code === "GEOBLOCKED") {
        toast.error("Trading is not available in your jurisdiction");
      } else if (result.code === "NO_CREDS") {
        toast.error("Enable trading in Settings → Trading Settings first");
      } else {
        toast.error(result.error || "Order failed");
      }
    } catch (err: any) {
      toast.error(err.message || "Order failed");
    } finally {
      setSubmitting(false);
    }
  }

  function handleCancel() {
    setShowConfirm(false);
  }

  const quickSizes = [10, 25, 50, 100];

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-border bg-card p-4">
      <h3 className="text-sm font-semibold mb-3">
        Trade <span className={isYes ? "text-yes" : "text-no"}>{outcome}</span>
      </h3>

      {!isConnected && (
        <div className="mb-4 rounded-md border border-primary/20 bg-primary/5 p-3 text-center">
          <Wallet className="h-5 w-5 text-primary mx-auto mb-2" />
          <p className="text-xs text-muted-foreground mb-2">Connect wallet to trade</p>
          <ConnectButton.Custom>
            {({ openConnectModal }) => (
              <button
                type="button"
                onClick={openConnectModal}
                className="rounded-md bg-primary text-primary-foreground px-4 py-1.5 text-xs font-semibold hover:bg-primary/90 transition-all"
              >
                Connect Wallet
              </button>
            )}
          </ConnectButton.Custom>
        </div>
      )}

      {isConnected && !ageConfirmed && (
        <div className="mb-3 rounded-md border border-warning/30 bg-warning/5 p-2 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
          <p className="text-[10px] text-warning">
            Confirm age & jurisdiction in <a href="/settings/polymarket" className="underline font-semibold">Trading Settings</a> to trade.
          </p>
        </div>
      )}

      {/* USDC Balance */}
      {isConnected && (
        <div className="flex justify-between text-xs mb-3 px-1">
          <span className="text-muted-foreground">USDC Balance</span>
          <span className="font-mono text-foreground">${usdcBalance.toFixed(2)}</span>
        </div>
      )}

      {/* Side toggle */}
      <div className="flex gap-1 mb-3">
        <button
          type="button"
          onClick={() => { setSide("BUY"); setShowConfirm(false); }}
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
          onClick={() => { setSide("SELL"); setShowConfirm(false); }}
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
          onChange={(e) => { setPrice(e.target.value); setShowConfirm(false); }}
          disabled={!isConnected}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
        />
      </div>

      {/* Size input */}
      <div className="mb-2">
        <label className="text-[10px] text-muted-foreground mb-1 block">Shares</label>
        <input
          type="number"
          step="1"
          min="1"
          value={size}
          onChange={(e) => { setSize(e.target.value); setShowConfirm(false); }}
          placeholder="0"
          disabled={!isConnected}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
        />
      </div>

      {/* Quick size buttons */}
      {isConnected && (
        <div className="flex gap-1 mb-3">
          {quickSizes.map((qs) => (
            <button
              key={qs}
              type="button"
              onClick={() => { setSize(String(qs)); setShowConfirm(false); }}
              className="flex-1 rounded-md border border-border bg-muted py-1 text-[10px] font-mono text-muted-foreground hover:bg-accent hover:text-foreground transition-all"
            >
              {qs}
            </button>
          ))}
          {usdcBalance > 0 && (
            <button
              type="button"
              onClick={() => {
                const maxShares = Math.floor(usdcBalance / parseFloat(price || "0.5"));
                setSize(String(maxShares));
                setShowConfirm(false);
              }}
              className="flex-1 rounded-md border border-primary/30 bg-primary/5 py-1 text-[10px] font-mono text-primary hover:bg-primary/10 transition-all"
            >
              MAX
            </button>
          )}
        </div>
      )}

      {/* Advanced options */}
      <button
        type="button"
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground mb-2 transition-all"
      >
        {showAdvanced ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        Advanced
      </button>
      {showAdvanced && (
        <div className="mb-3 rounded-md border border-border bg-muted/50 p-2">
          <label className="text-[10px] text-muted-foreground mb-1 block">Order Type</label>
          <select
            value={orderType}
            onChange={(e) => setOrderType(e.target.value as any)}
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="GTC">Good Till Cancel (GTC)</option>
            <option value="FOK">Fill or Kill (FOK)</option>
            <option value="GTD">Good Till Date (GTD)</option>
          </select>
        </div>
      )}

      {/* Order summary */}
      <div className="space-y-1 mb-3 px-1">
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Est. Cost</span>
          <span className="font-mono text-foreground">${total}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Potential Return</span>
          <span className="font-mono text-yes">+${potentialReturn}</span>
        </div>
        {hasInsufficientBalance && (
          <p className="text-[10px] text-destructive font-medium">Insufficient USDC balance</p>
        )}
      </div>

      {/* Confirmation state */}
      {showConfirm && (
        <div className="rounded-md border border-warning/30 bg-warning/5 p-3 mb-3">
          <div className="flex items-center gap-2 mb-2">
            <Shield className="h-4 w-4 text-warning" />
            <span className="text-xs font-semibold text-warning">Confirm Order</span>
          </div>
          <div className="text-xs text-muted-foreground space-y-1">
            <p>{side} <strong className="text-foreground">{size}</strong> shares of <strong className={isYes ? "text-yes" : "text-no"}>{outcome}</strong></p>
            <p>at <strong className="text-foreground">{price}¢</strong> per share</p>
            <p>Total: <strong className="text-foreground">${total}</strong> USDC</p>
          </div>
          <button
            type="button"
            onClick={handleCancel}
            className="mt-2 text-[10px] text-muted-foreground hover:text-foreground underline"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Approval button */}
      {isConnected && needsApproval && side === "BUY" && parseFloat(size || "0") > 0 && (
        <button
          type="button"
          onClick={approve}
          disabled={isApproving}
          className="w-full rounded-md py-2 text-sm font-bold bg-primary text-primary-foreground hover:bg-primary/90 transition-all disabled:opacity-50 mb-2"
        >
          {isApproving ? (
            <Loader2 className="h-4 w-4 animate-spin mx-auto" />
          ) : (
            "Approve USDC"
          )}
        </button>
      )}

      {/* Submit button */}
      <button
        type="submit"
        disabled={submitting || !size || !isConnected || !isTradable || hasInsufficientBalance || (needsApproval && side === "BUY") || !ageConfirmed}
        className={cn(
          "w-full rounded-md py-2.5 text-sm font-bold transition-all disabled:opacity-50",
          side === "BUY"
            ? "bg-yes text-yes-foreground hover:bg-yes/90"
            : "bg-no text-no-foreground hover:bg-no/90"
        )}
      >
        {submitting ? (
          <Loader2 className="h-4 w-4 animate-spin mx-auto" />
        ) : !isConnected ? (
          "Connect Wallet"
        ) : showConfirm ? (
          `Confirm ${side} ${outcome}`
        ) : (
          `${side} ${outcome}`
        )}
      </button>
    </form>
  );
}
