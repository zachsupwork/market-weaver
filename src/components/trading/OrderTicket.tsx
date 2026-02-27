import { useState } from "react";
import { cn } from "@/lib/utils";
import { postSignedOrder } from "@/lib/polymarket-api";
import { toast } from "sonner";
import { Loader2, Wallet, Shield, ChevronDown, ChevronUp, AlertTriangle, Check, Circle } from "lucide-react";
import { useAccount, useSignTypedData } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useTradingReadiness } from "@/hooks/useTradingReadiness";
import { deriveApiCreds } from "@/lib/polymarket-api";
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
  const [derivingCreds, setDerivingCreds] = useState(false);
  const { isConnected, address } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();

  const totalUsdc = parseFloat(price || "0") * parseFloat(size || "0");
  const readiness = useTradingReadiness(side === "BUY" ? totalUsdc : 0);

  const isYes = outcome === "Yes" || outcome.toLowerCase() === "yes";
  const total = totalUsdc.toFixed(2);
  const potentialReturn = side === "BUY"
    ? (parseFloat(size || "0") * (1 - parseFloat(price || "0"))).toFixed(2)
    : (parseFloat(size || "0") * parseFloat(price || "0")).toFixed(2);

  const hasInsufficientBalance = side === "BUY" && totalUsdc > readiness.usdc.usdcBalance && readiness.usdc.usdcBalance > 0;
  const ageConfirmed = localStorage.getItem(TRADING_AGE_KEY) === "true";

  // ── Step 1: Deploy Proxy Wallet ─────────────────────────────────
  async function handleDeployProxy() {
    readiness.proxy.deploy();
  }

  // ── Step 2: Enable Trading (ClobAuth EIP-712 signature) ─────────
  async function handleDeriveCreds() {
    if (!address) return;
    setDerivingCreds(true);
    try {
      let { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        const { error } = await supabase.auth.signInAnonymously();
        if (error) { toast.error("Sign-in required"); setDerivingCreds(false); return; }
        session = (await supabase.auth.getSession()).data.session;
      }

      const timestamp = String(Math.floor(Date.now() / 1000));
      const nonce = "0";
      const domain = { name: "ClobAuthDomain", version: "1", chainId: 137 } as const;
      const types = {
        ClobAuth: [
          { name: "address", type: "address" },
          { name: "timestamp", type: "string" },
          { name: "nonce", type: "uint256" },
          { name: "message", type: "string" },
        ],
      } as const;
      const message = {
        address,
        timestamp,
        nonce: BigInt(nonce),
        message: "This message attests that I control the given wallet",
      } as const;

      const signature = await signTypedDataAsync({ account: address, domain, types, primaryType: "ClobAuth", message });
      const result = await deriveApiCreds({ address, signature, timestamp, nonce });

      if (result.ok) {
        toast.success("Trading enabled!");
        await readiness.refreshCreds();
      } else {
        toast.error(result.error || "Credential derivation failed");
      }
    } catch (err: any) {
      const msg = err.message || "Failed";
      if (msg.includes("rejected") || msg.includes("denied")) {
        toast.error("Signature cancelled");
      } else {
        toast.error(msg);
      }
    } finally {
      setDerivingCreds(false);
    }
  }

  // ── Step 3: Approve USDC.e ──────────────────────────────────────
  function handleApproveUsdc() {
    readiness.usdc.approve();
  }

  // ── Order submission ────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isConnected || !address) { toast.error("Connect your wallet first"); return; }
    if (!isTradable) { toast.error("This market is not currently tradable"); return; }
    if (!ageConfirmed) { toast.error("Confirm age & jurisdiction in Settings"); return; }
    if (!readiness.allReady) { toast.error("Complete all setup steps below before trading"); return; }
    if (!size || parseFloat(size) <= 0) { toast.error("Enter a valid size"); return; }
    if (hasInsufficientBalance) { toast.error("Insufficient USDC.e balance"); return; }

    let { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      const { error } = await supabase.auth.signInAnonymously();
      if (error) { toast.error("Sign in required"); return; }
      session = (await supabase.auth.getSession()).data.session;
      if (!session) { toast.error("Session issue"); return; }
    }

    if (!showConfirm) { setShowConfirm(true); return; }

    setSubmitting(true);
    try {
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

      const result = await postSignedOrder(orderData);

      if (result.ok) {
        toast.success(`${side} ${outcome} order placed successfully`);
        setSize("");
        setShowConfirm(false);
      } else if (result.code === "GEOBLOCKED") {
        toast.error("Trading is not available in your jurisdiction");
      } else if (result.code === "NO_CREDS") {
        toast.error("Enable trading first (Step 2 below)");
      } else {
        toast.error(result.error || "Order failed");
      }
    } catch (err: any) {
      toast.error(err.message || "Order failed");
    } finally {
      setSubmitting(false);
    }
  }

  const quickSizes = [10, 25, 50, 100];

  // ── 3-step checklist matching Polymarket ─────────────────────────
  const usdcSubLabel = readiness.usdc.needsApproval && readiness.usdc.approvalProgress > 0
    ? `Approved ${readiness.usdc.approvalProgress}/2 exchanges`
    : null;

  const steps = [
    {
      key: "proxy" as const,
      label: "Deploy Proxy Wallet",
      description: "Deploy a smart contract wallet to enable trading.",
      subLabel: null,
      done: readiness.proxyReady,
      action: handleDeployProxy,
      loading: false,
      buttonLabel: "Deploy",
    },
    {
      key: "creds" as const,
      label: "Enable Trading",
      description: "Sign a message to generate your API keys. No gas required.",
      subLabel: null,
      done: readiness.credsReady,
      action: handleDeriveCreds,
      loading: derivingCreds || readiness.credsLoading,
      buttonLabel: "Sign",
    },
    {
      key: "usdc" as const,
      label: "Approve Tokens",
      description: "Approve USDC.e token spending for trading.",
      subLabel: usdcSubLabel,
      done: readiness.usdcReady,
      action: handleApproveUsdc,
      loading: readiness.usdc.isApproving,
      buttonLabel: readiness.usdc.approvalProgress > 0 ? `Approve (${readiness.usdc.approvalProgress}/2)` : "Approve",
    },
  ];

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

      {/* 3-Step Setup Checklist */}
      {isConnected && ageConfirmed && !readiness.allReady && (
        <div className="mb-4 rounded-md border border-border bg-muted/30 p-3 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground">Setup Required</p>
          {steps.map((step, i) => {
            const isCurrent = readiness.currentStep === step.key;
            const isDisabled = !isCurrent && !step.done;
            return (
              <div key={step.key} className="flex items-start gap-2.5">
                {step.done ? (
                  <div className="mt-0.5 h-4 w-4 rounded-full bg-yes/20 flex items-center justify-center shrink-0">
                    <Check className="h-2.5 w-2.5 text-yes" />
                  </div>
                ) : (
                  <div className={cn(
                    "mt-0.5 h-4 w-4 rounded-full border-2 shrink-0",
                    isCurrent ? "border-primary" : "border-muted-foreground/30"
                  )} />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className={cn(
                      "text-xs font-medium",
                      step.done ? "text-muted-foreground line-through" : isCurrent ? "text-foreground" : "text-muted-foreground/50"
                    )}>
                      Step {i + 1}: {step.label}
                    </span>
                    {isCurrent && !step.done && (
                      <button
                        type="button"
                        onClick={step.action}
                        disabled={step.loading}
                        className="shrink-0 rounded-md bg-primary text-primary-foreground px-3 py-1 text-[10px] font-semibold hover:bg-primary/90 transition-all disabled:opacity-50"
                      >
                        {step.loading ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          step.buttonLabel
                        )}
                      </button>
                    )}
                    {step.done && (
                      <span className="text-[10px] text-yes font-medium">Done</span>
                    )}
                  </div>
                  <p className={cn(
                    "text-[10px] mt-0.5",
                    step.done ? "text-muted-foreground/50" : isCurrent ? "text-muted-foreground" : "text-muted-foreground/30"
                  )}>
                    {step.description}
                  </p>
                  {step.subLabel && !step.done && isCurrent && (
                    <p className="text-[10px] mt-0.5 text-primary font-medium">{step.subLabel}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* All ready badge */}
      {isConnected && ageConfirmed && readiness.allReady && (
        <div className="mb-3 rounded-md border border-yes/20 bg-yes/5 p-2 flex items-center gap-2">
          <Check className="h-3.5 w-3.5 text-yes shrink-0" />
          <span className="text-[10px] text-yes font-medium">Trading enabled — all steps complete</span>
        </div>
      )}

      {/* USDC.e Balance */}
      {isConnected && (
        <div className="flex justify-between text-xs mb-3 px-1">
          <span className="text-muted-foreground">USDC.e Balance</span>
          <span className="font-mono text-foreground">${readiness.usdc.usdcBalance.toFixed(2)}</span>
        </div>
      )}

      {/* Side toggle */}
      <div className="flex gap-1 mb-3">
        <button type="button" onClick={() => { setSide("BUY"); setShowConfirm(false); }}
          className={cn("flex-1 rounded-md py-1.5 text-xs font-semibold transition-all",
            side === "BUY" ? "bg-yes/20 text-yes border border-yes/40" : "bg-muted text-muted-foreground border border-transparent"
          )}>Buy</button>
        <button type="button" onClick={() => { setSide("SELL"); setShowConfirm(false); }}
          className={cn("flex-1 rounded-md py-1.5 text-xs font-semibold transition-all",
            side === "SELL" ? "bg-no/20 text-no border border-no/40" : "bg-muted text-muted-foreground border border-transparent"
          )}>Sell</button>
      </div>

      {/* Price input */}
      <div className="mb-2">
        <label className="text-[10px] text-muted-foreground mb-1 block">Limit Price (¢)</label>
        <input type="number" step="0.01" min="0.01" max="0.99" value={price}
          onChange={(e) => { setPrice(e.target.value); setShowConfirm(false); }}
          disabled={!isConnected}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50" />
      </div>

      {/* Size input */}
      <div className="mb-2">
        <label className="text-[10px] text-muted-foreground mb-1 block">Shares</label>
        <input type="number" step="1" min="1" value={size}
          onChange={(e) => { setSize(e.target.value); setShowConfirm(false); }}
          placeholder="0" disabled={!isConnected}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50" />
      </div>

      {/* Quick size buttons */}
      {isConnected && (
        <div className="flex gap-1 mb-3">
          {quickSizes.map((qs) => (
            <button key={qs} type="button" onClick={() => { setSize(String(qs)); setShowConfirm(false); }}
              className="flex-1 rounded-md border border-border bg-muted py-1 text-[10px] font-mono text-muted-foreground hover:bg-accent hover:text-foreground transition-all">
              {qs}
            </button>
          ))}
          {readiness.usdc.usdcBalance > 0 && (
            <button type="button" onClick={() => {
              const maxShares = Math.floor(readiness.usdc.usdcBalance / parseFloat(price || "0.5"));
              setSize(String(maxShares)); setShowConfirm(false);
            }} className="flex-1 rounded-md border border-primary/30 bg-primary/5 py-1 text-[10px] font-mono text-primary hover:bg-primary/10 transition-all">
              MAX
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
        <div className="mb-3 rounded-md border border-border bg-muted/50 p-2">
          <label className="text-[10px] text-muted-foreground mb-1 block">Order Type</label>
          <select value={orderType} onChange={(e) => setOrderType(e.target.value as any)}
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-ring">
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
          <p className="text-[10px] text-destructive font-medium">Insufficient USDC.e balance</p>
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
            <p>Total: <strong className="text-foreground">${total}</strong> USDC.e</p>
          </div>
          <button type="button" onClick={() => setShowConfirm(false)} className="mt-2 text-[10px] text-muted-foreground hover:text-foreground underline">Cancel</button>
        </div>
      )}

      {/* Submit button */}
      <button
        type="submit"
        disabled={submitting || !size || !isConnected || !isTradable || hasInsufficientBalance || !readiness.allReady || !ageConfirmed}
        className={cn(
          "w-full rounded-md py-2.5 text-sm font-bold transition-all disabled:opacity-50",
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
        ) : (
          `${side} ${outcome}`
        )}
      </button>
    </form>
  );
}
