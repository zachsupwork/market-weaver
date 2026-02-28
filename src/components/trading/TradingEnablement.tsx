import { useState } from "react";
import { Loader2, Check, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAccount, useSignTypedData } from "wagmi";
import { useTradingReadiness } from "@/hooks/useTradingReadiness";
import { deriveApiCreds } from "@/lib/polymarket-api";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface TradingEnablementProps {
  orderAmount?: number;
  readiness?: ReturnType<typeof useTradingReadiness>;
  compact?: boolean;
}

export function TradingEnablement({ orderAmount = 0, readiness: externalReadiness, compact = false }: TradingEnablementProps) {
  const internalReadiness = useTradingReadiness(orderAmount);
  const readiness = externalReadiness || internalReadiness;
  const { address } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();
  const [derivingCreds, setDerivingCreds] = useState(false);

  async function handleDeployProxy() {
    readiness.proxy.deploy();
  }

  async function handleDeriveCreds() {
    if (!address) return;
    setDerivingCreds(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Please sign in first to enable trading");
        setDerivingCreds(false);
        return;
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

  function handleApproveUsdc() {
    readiness.usdc.approve();
  }

  if (readiness.allReady) {
    return (
      <div className="rounded-md border border-yes/20 bg-yes/5 p-2 flex items-center gap-2">
        <Check className="h-3.5 w-3.5 text-yes shrink-0" />
        <span className="text-[10px] text-yes font-medium">Trading enabled — all steps complete</span>
      </div>
    );
  }

  const steps = [
    {
      key: "proxy" as const,
      label: "Deploy Proxy Wallet",
      description: "Deploy a smart contract wallet to enable trading.",
      done: readiness.proxyReady,
      action: handleDeployProxy,
      loading: false,
      buttonLabel: "Deploy",
    },
    {
      key: "usdc" as const,
      label: "Approve Tokens",
      description: "Approve token spending for trading.",
      done: readiness.usdcReady,
      action: handleApproveUsdc,
      loading: readiness.usdc.isApproving,
      buttonLabel: "Approve",
    },
    {
      key: "creds" as const,
      label: "Enable Trading",
      description: "Sign a message to generate your API keys.",
      done: readiness.credsReady,
      action: handleDeriveCreds,
      loading: derivingCreds || readiness.credsLoading,
      buttonLabel: "Sign",
    },
  ];

  return (
    <div className="rounded-md border border-border bg-muted/30 p-3 space-y-3">
      <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
        <Shield className="h-3.5 w-3.5" /> Setup Required
      </p>
      {steps.map((step, i) => {
        const isCurrent = readiness.currentStep === step.key;
        const isDisabled = !isCurrent && !step.done;
        return (
          <div key={step.key} className="flex items-start gap-2.5">
            {step.done ? (
              <div className="mt-0.5 h-5 w-5 rounded-full bg-yes/20 flex items-center justify-center shrink-0">
                <Check className="h-3 w-3 text-yes" />
              </div>
            ) : (
              <div className={cn(
                "mt-0.5 h-5 w-5 rounded-full border-2 shrink-0 flex items-center justify-center",
                isCurrent ? "border-primary" : "border-muted-foreground/30"
              )}>
                <span className={cn("text-[10px] font-bold", isCurrent ? "text-primary" : "text-muted-foreground/30")}>
                  {i + 1}
                </span>
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className={cn(
                  "text-xs font-medium",
                  step.done ? "text-muted-foreground line-through" : isCurrent ? "text-foreground" : "text-muted-foreground/50"
                )}>
                  {step.label}
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
              {!compact && (
                <p className={cn(
                  "text-[10px] mt-0.5",
                  step.done ? "text-muted-foreground/50" : isCurrent ? "text-muted-foreground" : "text-muted-foreground/30"
                )}>
                  {step.description}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
