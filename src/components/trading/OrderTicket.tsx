import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { checkUserCredsStatus, postSignedOrder } from "@/lib/polymarket-api";
import { toast } from "sonner";
import { Loader2, Wallet, Shield, ChevronDown, ChevronUp, AlertTriangle, Check, Minus, Plus } from "lucide-react";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useTradingReadiness } from "@/hooks/useTradingReadiness";
import { TradingEnablement } from "@/components/trading/TradingEnablement";
import { supabase } from "@/integrations/supabase/client";
import { ClobClient, Side as ClobSide, SignatureType } from "@polymarket/clob-client";
import { ethers } from "ethers";
import { useProxyWallet } from "@/hooks/useProxyWallet";

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
  const [amount, setAmount] = useState(0); // Dollar amount
  const [submitting, setSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [orderType, setOrderType] = useState<"GTC" | "FOK" | "GTD">("GTC");
  const { isConnected, address } = useAccount();
  const { proxyAddress } = useProxyWallet();

  const readiness = useTradingReadiness(side === "BUY" ? amount : 0);

  const isYes = outcome === "Yes" || outcome.toLowerCase() === "yes";
  const price = currentPrice;
  const shares = useMemo(() => price > 0 ? amount / price : 0, [amount, price]);
  const potentialReturn = side === "BUY"
    ? (shares * (1 - price)).toFixed(2)
    : (shares * price).toFixed(2);

  const hasInsufficientBalance = side === "BUY" && amount > readiness.usdc.usdcBalance && readiness.usdc.usdcBalance > 0;
  const ageConfirmed = localStorage.getItem(TRADING_AGE_KEY) === "true";

  const quickAmounts = [1, 5, 10, 100];

  function adjustAmount(delta: number) {
    setAmount((prev) => Math.max(0, Math.round((prev + delta) * 100) / 100));
    setShowConfirm(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isConnected || !address) { toast.error("Connect your wallet first"); return; }
    if (!isTradable) { toast.error("This market is not currently tradable"); return; }
    if (!ageConfirmed) { toast.error("Confirm age & jurisdiction in Settings"); return; }
    if (!readiness.allReady) { toast.error("Complete all setup steps below before trading"); return; }
    if (amount <= 0) { toast.error("Enter an amount"); return; }
    if (hasInsufficientBalance) { toast.error("Insufficient USDC.e balance"); return; }

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      toast.error("Please sign in first to place orders");
      return;
    }

    if (!showConfirm) { setShowConfirm(true); return; }

    setSubmitting(true);
    try {
      const credsStatus = await checkUserCredsStatus();
      if (!credsStatus.hasCreds || !credsStatus.address) {
        toast.error("Trading credentials missing. Re-enable trading in Setup below.");
        await readiness.refreshCreds();
        return;
      }

      if (!proxyAddress) {
        toast.error("Proxy wallet not found. Deploy it in Setup below.");
        return;
      }

      if (!(window as any).ethereum) {
        throw new Error("Wallet provider not found");
      }

      const provider = new ethers.providers.Web3Provider((window as any).ethereum, "any");
      const signer = provider.getSigner();

      // funderAddress must be the proxy/Safe address (maker), not the EOA
      const clobClient = new ClobClient(
        "https://clob.polymarket.com",
        137,
        signer,
        undefined,
        SignatureType.POLY_PROXY,
        proxyAddress
      );

      const signedOrder = await clobClient.createOrder({
        tokenID: tokenId,
        side: side === "BUY" ? ClobSide.BUY : ClobSide.SELL,
        price,
        size: Number(shares.toFixed(6)),
        feeRateBps: 0,
        nonce: Math.floor(Math.random() * 1e15),
        expiration: 0,
      });

      const result = await postSignedOrder(signedOrder, orderType);

      if (result.ok) {
        toast.success(`${side} ${outcome} order placed — $${amount.toFixed(2)}`);
        setAmount(0);
        setShowConfirm(false);
      } else if (result.code === "GEOBLOCKED") {
        toast.error("Trading is not available in your jurisdiction");
      } else if (result.code === "NO_CREDS" || result.code === "INVALID_API_KEY") {
        toast.error("Trading credentials expired. Re-enable trading in Setup below.");
        await readiness.refreshCreds();
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
            Confirm age & jurisdiction in <a href="/settings/polymarket" className="underline font-semibold">Trading Settings</a>.
          </p>
        </div>
      )}

      {isConnected && ageConfirmed && !readiness.allReady && (
        <div className="mb-4">
          <TradingEnablement orderAmount={side === "BUY" ? amount : 0} readiness={readiness} compact />
        </div>
      )}

      {isConnected && ageConfirmed && readiness.allReady && (
        <div className="mb-3 rounded-md border border-yes/20 bg-yes/5 p-2 flex items-center gap-2">
          <Check className="h-3.5 w-3.5 text-yes shrink-0" />
          <span className="text-[10px] text-yes font-medium">Trading enabled — all steps complete</span>
        </div>
      )}

      {isConnected && (
        <div className="flex justify-between text-xs mb-3 px-1">
          <span className="text-muted-foreground">Bal.</span>
          <span className="font-mono text-foreground">${readiness.usdc.usdcBalance.toFixed(2)}</span>
        </div>
      )}

      {/* Side toggle */}
      <div className="flex gap-1 mb-4">
        <button type="button" onClick={() => { setSide("BUY"); setShowConfirm(false); }}
          className={cn("flex-1 rounded-md py-1.5 text-xs font-semibold transition-all",
            side === "BUY" ? "bg-yes/20 text-yes border border-yes/40" : "bg-muted text-muted-foreground border border-transparent"
          )}>Buy</button>
        <button type="button" onClick={() => { setSide("SELL"); setShowConfirm(false); }}
          className={cn("flex-1 rounded-md py-1.5 text-xs font-semibold transition-all",
            side === "SELL" ? "bg-no/20 text-no border border-no/40" : "bg-muted text-muted-foreground border border-transparent"
          )}>Sell</button>
      </div>

      {/* Dollar amount input - Polymarket style */}
      <div className="mb-4">
        <div className="flex items-center justify-center gap-4 py-3">
          <button type="button" onClick={() => adjustAmount(-1)} disabled={amount <= 0 || !isConnected}
            className="h-10 w-10 rounded-full border border-border bg-muted flex items-center justify-center hover:bg-accent transition-all disabled:opacity-30">
            <Minus className="h-4 w-4" />
          </button>
          <span className="font-mono text-4xl font-bold text-foreground min-w-[120px] text-center">
            ${amount}
          </span>
          <button type="button" onClick={() => adjustAmount(1)} disabled={!isConnected}
            className="h-10 w-10 rounded-full border border-border bg-muted flex items-center justify-center hover:bg-accent transition-all disabled:opacity-30">
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Quick amount buttons */}
      {isConnected && (
        <div className="flex gap-2 mb-4">
          {quickAmounts.map((qa) => (
            <button key={qa} type="button" onClick={() => { setAmount((prev) => prev + qa); setShowConfirm(false); }}
              className="flex-1 rounded-lg border border-border bg-muted py-2 text-xs font-mono font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-all">
              +${qa}
            </button>
          ))}
          {readiness.usdc.usdcBalance > 0 && (
            <button type="button" onClick={() => {
              setAmount(Math.floor(readiness.usdc.usdcBalance * 100) / 100);
              setShowConfirm(false);
            }} className="flex-1 rounded-lg border border-primary/30 bg-primary/5 py-2 text-xs font-mono font-medium text-primary hover:bg-primary/10 transition-all">
              Max
            </button>
          )}
        </div>
      )}

      {/* Advanced options */}
      <button type="button" onClick={() => setShowAdvanced(!showAdvanced)}
        className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground mb-2 transition-all">
        {showAdvanced ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />} Advanced
      </button>
      {showAdvanced && (
        <div className="mb-3 rounded-md border border-border bg-muted/50 p-2 space-y-2">
          <div>
            <label className="text-[10px] text-muted-foreground mb-1 block">Order Type</label>
            <select value={orderType} onChange={(e) => setOrderType(e.target.value as any)}
              className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-ring">
              <option value="GTC">Good Till Cancel (GTC)</option>
              <option value="FOK">Fill or Kill (FOK)</option>
              <option value="GTD">Good Till Date (GTD)</option>
            </select>
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>Price</span>
            <span className="font-mono">{Math.round(price * 100)}¢</span>
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>Shares</span>
            <span className="font-mono">{shares.toFixed(2)}</span>
          </div>
        </div>
      )}

      {/* Order summary */}
      {amount > 0 && (
        <div className="space-y-1 mb-3 px-1">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Avg Price</span>
            <span className="font-mono text-foreground">{Math.round(price * 100)}¢</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Est. Shares</span>
            <span className="font-mono text-foreground">{shares.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Potential Return</span>
            <span className="font-mono text-yes">+${potentialReturn}</span>
          </div>
          {hasInsufficientBalance && (
            <p className="text-[10px] text-destructive font-medium">Insufficient USDC.e balance</p>
          )}
        </div>
      )}

      {/* Confirmation state */}
      {showConfirm && (
        <div className="rounded-md border border-warning/30 bg-warning/5 p-3 mb-3">
          <div className="flex items-center gap-2 mb-2">
            <Shield className="h-4 w-4 text-warning" />
            <span className="text-xs font-semibold text-warning">Confirm Order</span>
          </div>
          <div className="text-xs text-muted-foreground space-y-1">
            <p>{side} <strong className={isYes ? "text-yes" : "text-no"}>{outcome}</strong></p>
            <p>at <strong className="text-foreground">{Math.round(price * 100)}¢</strong> per share</p>
            <p>Total: <strong className="text-foreground">${amount.toFixed(2)}</strong> USDC.e</p>
          </div>
          <button type="button" onClick={() => setShowConfirm(false)} className="mt-2 text-[10px] text-muted-foreground hover:text-foreground underline">Cancel</button>
        </div>
      )}

      {/* Submit button */}
      <button
        type="submit"
        disabled={submitting || amount <= 0 || !isConnected || !isTradable || hasInsufficientBalance || !readiness.allReady || !ageConfirmed}
        className={cn(
          "w-full rounded-lg py-3 text-sm font-bold transition-all disabled:opacity-50",
          side === "BUY" ? "bg-yes text-yes-foreground hover:bg-yes/90" : "bg-no text-no-foreground hover:bg-no/90"
        )}
      >
        {submitting ? (
          <Loader2 className="h-4 w-4 animate-spin mx-auto" />
        ) : !isConnected ? (
          "Connect Wallet"
        ) : !readiness.allReady ? (
          "Complete Setup Above"
        ) : showConfirm ? (
          `Confirm ${side} ${outcome}`
        ) : amount > 0 ? (
          `${side === "BUY" ? "Buy" : "Sell"} $${amount.toFixed(2)}`
        ) : (
          "Enter Amount"
        )}
      </button>
    </form>
  );
}