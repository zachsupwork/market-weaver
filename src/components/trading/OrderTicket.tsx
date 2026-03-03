import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { checkUserCredsStatus, postSignedOrder } from "@/lib/polymarket-api";
import { toast } from "sonner";
import { Loader2, Wallet, Shield, ChevronDown, ChevronUp, AlertTriangle, Check, Minus, Plus, Copy, ArrowRightLeft, ExternalLink } from "lucide-react";
import { useAccount, useSwitchChain } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useTradingReadiness } from "@/hooks/useTradingReadiness";
import { TradingEnablement } from "@/components/trading/TradingEnablement";
import { supabase } from "@/integrations/supabase/client";
import { ClobClient, Side as ClobSide } from "@polymarket/clob-client";
import { ethers } from "ethers";
import { useProxyWallet } from "@/hooks/useProxyWallet";
import { USDC_TO_USDC_E_SWAP_URL } from "@/lib/tokens";

export type TradeAction = "BUY_YES" | "BUY_NO" | "SELL_YES" | "SELL_NO";

interface OrderTicketProps {
  /** YES token id */
  yesTokenId: string;
  /** NO token id */
  noTokenId: string;
  /** Current YES price (0-1) */
  yesPrice: number;
  /** Current NO price (0-1) */
  noPrice: number;
  conditionId?: string;
  isTradable?: boolean;
  /** Initial action to pre-select */
  initialAction?: TradeAction;
  /** User's YES position size (shares) */
  yesPositionSize?: number;
  /** User's NO position size (shares) */
  noPositionSize?: number;
}

const TRADING_AGE_KEY = "polyview_trading_age_confirmed";

const ACTION_LABELS: Record<TradeAction, { label: string; side: "BUY" | "SELL"; outcome: "Yes" | "No" }> = {
  BUY_YES:  { label: "Buy Yes",  side: "BUY",  outcome: "Yes" },
  BUY_NO:   { label: "Buy No",   side: "BUY",  outcome: "No" },
  SELL_YES:  { label: "Sell Yes",  side: "SELL", outcome: "Yes" },
  SELL_NO:   { label: "Sell No",   side: "SELL", outcome: "No" },
};

export function OrderTicket({
  yesTokenId,
  noTokenId,
  yesPrice,
  noPrice,
  conditionId,
  isTradable = true,
  initialAction = "BUY_YES",
  yesPositionSize = 0,
  noPositionSize = 0,
}: OrderTicketProps) {
  const [action, setAction] = useState<TradeAction>(initialAction);
  const [amount, setAmount] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [orderType, setOrderType] = useState<"GTC" | "FOK" | "GTD">("GTC");
  const { isConnected, address, chainId } = useAccount();
  const { proxyAddress } = useProxyWallet();
  const { switchChain } = useSwitchChain();
  const isPolygon = chainId === 137;

  const { side, outcome } = ACTION_LABELS[action];
  const isBuy = side === "BUY";
  const isYes = outcome === "Yes";
  const tokenId = isYes ? yesTokenId : noTokenId;
  const price = isYes ? yesPrice : noPrice;
  const availableShares = isYes ? yesPositionSize : noPositionSize;

  const readiness = useTradingReadiness(isBuy ? amount : 0);

  const shares = useMemo(() => price > 0 ? amount / price : 0, [amount, price]);
  const potentialReturn = isBuy
    ? (shares * (1 - price)).toFixed(2)
    : (shares * price).toFixed(2);

  const hasInsufficientBalance = isBuy && amount > readiness.usdc.usdcBalance;
  const hasInsufficientShares = !isBuy && shares > availableShares;
  const hasNativeUsdcButNoE = readiness.usdc.usdcNativeBalance > 0 && readiness.usdc.usdcBalance < amount;
  const ageConfirmed = localStorage.getItem(TRADING_AGE_KEY) === "true";

  const quickAmounts = isBuy ? [1, 5, 10, 100] : [1, 5, 10];

  // Can the user sell this outcome?
  const canSellYes = yesPositionSize > 0;
  const canSellNo = noPositionSize > 0;

  function adjustAmount(delta: number) {
    setAmount((prev) => Math.max(0, Math.round((prev + delta) * 100) / 100));
    setShowConfirm(false);
  }

  function switchAction(newAction: TradeAction) {
    setAction(newAction);
    setAmount(0);
    setShowConfirm(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isConnected || !address) { toast.error("Connect your wallet first"); return; }
    if (!isTradable) { toast.error("This market is not currently tradable"); return; }
    if (!ageConfirmed) { toast.error("Confirm age & jurisdiction in Settings"); return; }
    if (!readiness.allReady) { toast.error("Complete all setup steps below before trading"); return; }
    if (amount <= 0) { toast.error("Enter an amount"); return; }

    if (isBuy && hasInsufficientBalance) {
      if (hasNativeUsdcButNoE) {
        toast.error(`You have $${readiness.usdc.usdcNativeBalance.toFixed(2)} USDC but trading requires USDC.e. Convert USDC → USDC.e first.`);
      } else {
        toast.error(`Not enough USDC.e. You have $${readiness.usdc.usdcBalance.toFixed(2)} USDC.e on Polygon.`);
      }
      return;
    }

    if (!isBuy && hasInsufficientShares) {
      toast.error(`Not enough ${outcome} shares. You have ${availableShares.toFixed(2)} shares available to sell.`);
      return;
    }

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

      if (!(window as any).ethereum) {
        throw new Error("Wallet provider not found");
      }

      const provider = new ethers.providers.Web3Provider((window as any).ethereum, "any");
      const signer = provider.getSigner();

      const useProxy = !!proxyAddress;
      const clobClient = new ClobClient(
        "https://clob.polymarket.com",
        137,
        signer,
        undefined,
        useProxy ? 2 : 0,
        useProxy ? proxyAddress : undefined,
      );

      const eoaAddr = (await signer.getAddress()).toLowerCase();
      console.log("[OrderTicket] Creating order:", {
        action,
        signerAddress: eoaAddr,
        tokenId,
        side,
        price,
        size: Number(shares.toFixed(6)),
      });

      const signedOrder = await clobClient.createOrder({
        tokenID: tokenId,
        side: side === "BUY" ? ClobSide.BUY : ClobSide.SELL,
        price,
        size: Number(shares.toFixed(6)),
        feeRateBps: 0,
        expiration: 0,
      });

      const orderSigner = ((signedOrder as any)?.order?.signer ?? (signedOrder as any)?.signer ?? "").toLowerCase();
      if (orderSigner && orderSigner !== eoaAddr) {
        throw new Error(`Signer mismatch: order signed by ${orderSigner} but your wallet is ${eoaAddr}. Re-enable trading with the same wallet.`);
      }

      const result = await postSignedOrder(signedOrder, orderType);

      if (result.ok) {
        toast.success(`${ACTION_LABELS[action].label} order placed — $${amount.toFixed(2)}`);
        setAmount(0);
        setShowConfirm(false);
      } else {
        const errMsg = result.error || "Order failed";
        const errLower = errMsg.toLowerCase();
        const isAuthError = result.code === "GEOBLOCKED" || result.code === "NO_CREDS" || result.code === "INVALID_API_KEY"
          || errLower.includes("expired") || errLower.includes("unauthorized") || errLower.includes("invalid api key")
          || errLower.includes("signer") || errLower.includes("not match");
        const isBalanceError = errLower.includes("not enough balance") || errLower.includes("balance/allowance")
          || errLower.includes("insufficient") || errLower.includes("allowance");

        if (result.code === "GEOBLOCKED") {
          toast.error("Trading is not available in your jurisdiction.");
        } else if (isBalanceError) {
          if (!isBuy) {
            toast.error("Token approvals may be stale. Re-approving now…", { duration: 6000 });
            try {
              await readiness.usdc.approve(true);
              toast.success("Tokens re-approved! Please try your sell order again.");
            } catch (approveErr) {
              toast.error("Re-approval failed. Try manually in Setup below.", { duration: 8000 });
            }
          } else {
            toast.error(
              `Insufficient balance or allowance. You have $${readiness.usdc.usdcBalance.toFixed(2)} USDC.e.`,
              { duration: 8000 }
            );
          }
          readiness.usdc.recheckBalances();
        } else if (isAuthError) {
          toast.error("Order failed: Please check your Polymarket credentials in Settings and re-derive if needed.", { duration: 6000 });
          await readiness.refreshCreds();
        } else if (errLower.includes("invalid signature")) {
          toast.error("Order signature invalid. Re-derive credentials in Settings.", { duration: 8000 });
          await readiness.refreshCreds();
        } else if (errLower.includes("nonce")) {
          toast.error("Order failed due to a nonce error. Please try again.", { duration: 5000 });
        } else {
          toast.error(errMsg);
        }
      }
    } catch (err: any) {
      const msg = err.message || "Order failed";
      const msgLower = msg.toLowerCase();
      if (msgLower.includes("signer") || msgLower.includes("credential") || msgLower.includes("unauthorized")) {
        toast.error("Order failed: Please check your Polymarket credentials in Settings.", { duration: 6000 });
      } else {
        toast.error(msg);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-border bg-card p-4">
      {/* Action selector: 4 buttons */}
      <div className="grid grid-cols-2 gap-1 mb-4">
        <button type="button" onClick={() => switchAction("BUY_YES")}
          className={cn("rounded-md py-2 text-xs font-semibold transition-all",
            action === "BUY_YES" ? "bg-yes/20 text-yes border border-yes/40" : "bg-muted text-muted-foreground border border-transparent hover:border-border"
          )}>
          Buy Yes <span className="font-mono ml-1">{Math.round(yesPrice * 100)}¢</span>
        </button>
        <button type="button" onClick={() => switchAction("BUY_NO")}
          className={cn("rounded-md py-2 text-xs font-semibold transition-all",
            action === "BUY_NO" ? "bg-no/20 text-no border border-no/40" : "bg-muted text-muted-foreground border border-transparent hover:border-border"
          )}>
          Buy No <span className="font-mono ml-1">{Math.round(noPrice * 100)}¢</span>
        </button>
        <button type="button" onClick={() => switchAction("SELL_YES")}
          disabled={!canSellYes}
          className={cn("rounded-md py-2 text-xs font-semibold transition-all",
            action === "SELL_YES" ? "bg-yes/10 text-yes border border-yes/30" : "bg-muted text-muted-foreground border border-transparent hover:border-border",
            !canSellYes && "opacity-40 cursor-not-allowed"
          )}>
          Sell Yes {canSellYes && <span className="font-mono ml-1">({yesPositionSize.toFixed(1)})</span>}
        </button>
        <button type="button" onClick={() => switchAction("SELL_NO")}
          disabled={!canSellNo}
          className={cn("rounded-md py-2 text-xs font-semibold transition-all",
            action === "SELL_NO" ? "bg-no/10 text-no border border-no/30" : "bg-muted text-muted-foreground border border-transparent hover:border-border",
            !canSellNo && "opacity-40 cursor-not-allowed"
          )}>
          Sell No {canSellNo && <span className="font-mono ml-1">({noPositionSize.toFixed(1)})</span>}
        </button>
      </div>

      {/* Header */}
      <h3 className="text-sm font-semibold mb-3">
        {ACTION_LABELS[action].label}{" "}
        <span className={isYes ? "text-yes" : "text-no"}>{outcome}</span>
      </h3>

      {!isConnected && (
        <div className="mb-4 rounded-md border border-primary/20 bg-primary/5 p-3 text-center">
          <Wallet className="h-5 w-5 text-primary mx-auto mb-2" />
          <p className="text-xs text-muted-foreground mb-2">Connect wallet to trade</p>
          <ConnectButton.Custom>
            {({ openConnectModal }) => (
              <button type="button" onClick={openConnectModal}
                className="rounded-md bg-primary text-primary-foreground px-4 py-1.5 text-xs font-semibold hover:bg-primary/90 transition-all">
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
          <TradingEnablement orderAmount={isBuy ? amount : 0} readiness={readiness} compact />
        </div>
      )}

      {/* Balance display: context-aware */}
      {isConnected && (
        <div className="mb-3 space-y-1 px-1">
          {isBuy ? (
            <>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">USDC.e <span className="text-[9px] opacity-60">(tradeable)</span></span>
                <span className="font-mono text-foreground">${readiness.usdc.usdcBalance.toFixed(2)}</span>
              </div>
              {readiness.usdc.usdcNativeBalance > 0 && (
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">USDC <span className="text-[9px] opacity-60">(not tradeable)</span></span>
                  <span className="font-mono text-muted-foreground">${readiness.usdc.usdcNativeBalance.toFixed(2)}</span>
                </div>
              )}
            </>
          ) : (
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Available {outcome} Shares</span>
              <span className={cn("font-mono font-semibold", availableShares > 0 ? "text-foreground" : "text-muted-foreground")}>
                {availableShares.toFixed(2)}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Convert USDC → USDC.e CTA */}
      {isConnected && hasNativeUsdcButNoE && isBuy && (
        <div className="mb-3 rounded-md border border-warning/30 bg-warning/5 p-2.5 space-y-1.5">
          <p className="text-[10px] text-warning font-medium flex items-center gap-1">
            <ArrowRightLeft className="h-3 w-3" />
            You have USDC, but trading requires USDC.e
          </p>
          <a href={USDC_TO_USDC_E_SWAP_URL} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-md bg-primary text-primary-foreground px-3 py-1 text-[10px] font-semibold hover:bg-primary/90 transition-all">
            Convert USDC → USDC.e <ExternalLink className="h-2.5 w-2.5" />
          </a>
        </div>
      )}

      {/* Wallet ready banner */}
      {isConnected && ageConfirmed && readiness.allReady && (
        <div className={cn(
          "mb-3 rounded-md p-2 flex items-center gap-2",
          readiness.usdc.usdcBalance > 0 || availableShares > 0
            ? "border border-yes/20 bg-yes/5"
            : "border border-primary/20 bg-primary/5"
        )}>
          <Check className="h-3.5 w-3.5 shrink-0 text-yes" />
          <div className="text-[10px]">
            <span className="text-yes font-medium">Wallet ready</span>
            {isBuy && readiness.usdc.usdcBalance === 0 && (
              <span className="text-muted-foreground ml-1">— Fund your wallet with USDC.e to trade</span>
            )}
          </div>
        </div>
      )}

      {/* Fund & Approve helper panel */}
      {isConnected && ageConfirmed && readiness.allReady && isBuy && (readiness.usdc.usdcBalance === 0 || readiness.usdc.needsApproval || !isPolygon) && (
        <div className="mb-3 rounded-md border border-primary/20 bg-primary/5 p-3 space-y-2">
          <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <ArrowRightLeft className="h-3.5 w-3.5 text-primary" /> Fund & Approve
          </p>
          {!isPolygon && (
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">Switch to Polygon network</span>
              <button type="button" onClick={() => switchChain?.({ chainId: 137 })}
                className="rounded-md bg-primary text-primary-foreground px-3 py-1 text-[10px] font-semibold hover:bg-primary/90 transition-all">
                Switch to Polygon
              </button>
            </div>
          )}
          {readiness.usdc.usdcBalance === 0 && (
            <div className="space-y-1">
              <p className="text-[10px] text-muted-foreground">
                Send <span className="font-semibold text-foreground">USDC.e</span> on Polygon to your <span className="font-semibold text-foreground">Trading Wallet</span>:
              </p>
              <div className="flex items-center gap-1.5">
                <code className="text-[9px] font-mono bg-muted rounded px-1.5 py-0.5 text-foreground break-all flex-1">
                  {proxyAddress || address}
                </code>
                <button type="button" onClick={() => {
                  navigator.clipboard.writeText(proxyAddress || address || "");
                  toast.success("Address copied!");
                }} className="shrink-0 rounded-md bg-muted hover:bg-accent p-1 transition-all">
                  <Copy className="h-3 w-3 text-muted-foreground" />
                </button>
              </div>
            </div>
          )}
          {readiness.usdc.needsApproval && isPolygon && (
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">Approve USDC.e for trading</span>
              <button type="button" onClick={() => readiness.usdc.approve()}
                disabled={readiness.usdc.isApproving}
                className="rounded-md bg-primary text-primary-foreground px-3 py-1 text-[10px] font-semibold hover:bg-primary/90 transition-all disabled:opacity-50">
                {readiness.usdc.isApproving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Approve USDC.e"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Dollar amount input */}
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
          {isBuy && readiness.usdc.usdcBalance > 0 && (
            <button type="button" onClick={() => {
              setAmount(Math.floor(readiness.usdc.usdcBalance * 100) / 100);
              setShowConfirm(false);
            }} className="flex-1 rounded-lg border border-primary/30 bg-primary/5 py-2 text-xs font-mono font-medium text-primary hover:bg-primary/10 transition-all">
              Max
            </button>
          )}
          {!isBuy && availableShares > 0 && (
            <button type="button" onClick={() => {
              // For sell, "Max" sets amount = shares * price (dollar value of all shares)
              setAmount(Math.floor(availableShares * price * 100) / 100);
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
            <span>Token</span>
            <span className="font-mono">{outcome} ({tokenId.slice(0, 8)}…)</span>
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
            <span className="text-muted-foreground">Action</span>
            <span className={cn("font-semibold", isYes ? "text-yes" : "text-no")}>{ACTION_LABELS[action].label}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Price</span>
            <span className="font-mono text-foreground">{Math.round(price * 100)}¢</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Est. Shares</span>
            <span className="font-mono text-foreground">{shares.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">{isBuy ? "Potential Return" : "Est. Proceeds"}</span>
            <span className="font-mono text-yes">+${potentialReturn}</span>
          </div>
          {isBuy && hasInsufficientBalance && (
            <p className="text-[10px] text-destructive font-medium">
              {hasNativeUsdcButNoE ? "You have USDC but need USDC.e — convert above" : "Insufficient USDC.e balance"}
            </p>
          )}
          {!isBuy && hasInsufficientShares && (
            <p className="text-[10px] text-destructive font-medium">
              Not enough {outcome} shares ({availableShares.toFixed(2)} available)
            </p>
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
            <p><strong className={isYes ? "text-yes" : "text-no"}>{ACTION_LABELS[action].label}</strong></p>
            <p>at <strong className="text-foreground">{Math.round(price * 100)}¢</strong> per share</p>
            <p>{isBuy ? "Cost" : "Proceeds"}: <strong className="text-foreground">${amount.toFixed(2)}</strong></p>
            <p>Shares: <strong className="text-foreground">{shares.toFixed(2)}</strong></p>
          </div>
          <button type="button" onClick={() => setShowConfirm(false)} className="mt-2 text-[10px] text-muted-foreground hover:text-foreground underline">Cancel</button>
        </div>
      )}

      {/* Submit button */}
      <button
        type="submit"
        disabled={submitting || amount <= 0 || !isConnected || !isTradable || (isBuy && hasInsufficientBalance) || (!isBuy && hasInsufficientShares) || !readiness.allReady || !ageConfirmed}
        className={cn(
          "w-full rounded-lg py-3 text-sm font-bold transition-all disabled:opacity-50",
          isBuy
            ? (isYes ? "bg-yes text-yes-foreground hover:bg-yes/90" : "bg-no text-no-foreground hover:bg-no/90")
            : (isYes ? "bg-yes/80 text-yes-foreground hover:bg-yes/70" : "bg-no/80 text-no-foreground hover:bg-no/70")
        )}
      >
        {submitting ? (
          <Loader2 className="h-4 w-4 animate-spin mx-auto" />
        ) : !isConnected ? (
          "Connect Wallet"
        ) : !readiness.allReady ? (
          "Complete Setup Above"
        ) : showConfirm ? (
          `Confirm ${ACTION_LABELS[action].label}`
        ) : amount > 0 ? (
          `${ACTION_LABELS[action].label} — $${amount.toFixed(2)}`
        ) : (
          "Enter Amount"
        )}
      </button>
    </form>
  );
}
