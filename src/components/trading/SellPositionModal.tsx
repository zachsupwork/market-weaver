import { useState, useMemo, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Loader2, DollarSign, TrendingDown, TrendingUp, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { postSignedOrder, checkUserCredsStatus } from "@/lib/polymarket-api";
import { calculatePlatformFee, isFeeEnabled, FEE_WALLET_ADDRESS, ERC20_TRANSFER_ABI, PLATFORM_FEE_BPS } from "@/lib/platform-fee";
import { POLYGON_USDCE_ADDRESS } from "@/lib/constants/tokens";
import { supabase } from "@/integrations/supabase/client";
import { useAccount } from "wagmi";
import { useProxyWallet } from "@/hooks/useProxyWallet";
import { ClobClient, Side as ClobSide } from "@polymarket/clob-client";
import { ethers } from "ethers";

export interface SellPositionData {
  asset: string;
  condition_id: string;
  size: string;
  avgPrice?: string;
  currentPrice?: string;
  currentValue?: string;
  market?: string;
  outcome?: string;
  cashPnl?: string;
  percentPnl?: string;
  marketImage?: string;
  /** The token ID for this specific outcome (YES or NO) */
  tokenId?: string;
}

interface SellPositionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  position: SellPositionData | null;
  onSellComplete?: () => void;
}

export function SellPositionModal({ open, onOpenChange, position, onSellComplete }: SellPositionModalProps) {
  const { address } = useAccount();
  const { proxyAddress } = useProxyWallet();
  const [sharesToSell, setSharesToSell] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState<"idle" | "fee" | "signing" | "placing">("idle");

  const size = parseFloat(position?.size || "0");
  const avgPrice = parseFloat(position?.avgPrice || "0");
  const currentPrice = parseFloat(position?.currentPrice || "0");
  const tokenId = position?.asset || position?.tokenId || "";

  const feeEnabled = isFeeEnabled();

  const estimatedProceeds = useMemo(() => sharesToSell * currentPrice, [sharesToSell, currentPrice]);
  const { fee: platformFee, netAmount } = useMemo(() => calculatePlatformFee(estimatedProceeds), [estimatedProceeds]);
  const costBasis = sharesToSell * avgPrice;
  const realizedPnl = estimatedProceeds - costBasis;

  // Reset shares when position changes
  const handleOpenChange = useCallback((v: boolean) => {
    if (!v) {
      setSharesToSell(0);
      setStep("idle");
    }
    onOpenChange(v);
  }, [onOpenChange]);

  async function handleSell() {
    if (!address || !position || sharesToSell <= 0) return;
    if (!tokenId) {
      toast.error("Missing token ID for this position. Cannot place sell order.");
      return;
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      toast.error("Please sign in first to place orders");
      return;
    }

    const credsStatus = await checkUserCredsStatus();
    if (!credsStatus.hasCreds || !credsStatus.address) {
      toast.error("Trading credentials missing. Re-enable trading in Settings.");
      return;
    }

    if (!(window as any).ethereum) {
      toast.error("Wallet provider not found");
      return;
    }

    setSubmitting(true);

    try {
      // Step 1: Platform fee transfer
      let feeTxHash: string | null = null;
      if (feeEnabled && platformFee > 0 && estimatedProceeds > 0) {
        setStep("fee");
        try {
          toast.info(`Requesting platform fee transfer ($${platformFee.toFixed(2)})…`);
          const provider = new ethers.providers.Web3Provider((window as any).ethereum, "any");
          const feeSigner = provider.getSigner();
          const usdcContract = new ethers.Contract(POLYGON_USDCE_ADDRESS, ERC20_TRANSFER_ABI as any, feeSigner);
          const feeAmountWei = ethers.utils.parseUnits(platformFee.toFixed(6), 6);
          const feeTx = await usdcContract.transfer(FEE_WALLET_ADDRESS, feeAmountWei);
          await feeTx.wait();
          feeTxHash = feeTx.hash;
          toast.success("Platform fee paid ✓");

          // Record fee
          try {
            await supabase.from("platform_fees").insert({
              user_address: address.toLowerCase(),
              order_condition_id: position.condition_id ?? null,
              fee_amount: platformFee,
              fee_bps: PLATFORM_FEE_BPS,
              tx_hash: feeTxHash,
            } as any);
          } catch (dbErr) {
            console.warn("[SellModal] Failed to record fee:", dbErr);
          }
        } catch (feeErr: any) {
          if (feeErr?.code === 4001 || feeErr?.code === "ACTION_REJECTED") {
            toast.error("Fee transfer rejected. Sell cancelled.");
          } else {
            toast.error(`Fee transfer failed: ${feeErr.message}`);
          }
          setSubmitting(false);
          setStep("idle");
          return;
        }
      }

      // Step 2: Sign the sell order
      setStep("signing");
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

      const sellPrice = Math.round(currentPrice * 100) / 100;
      const sellSize = Number(sharesToSell.toFixed(6));

      console.log("[SellModal] Creating sell order:", { tokenId, price: sellPrice, size: sellSize });

      const signedOrder = await clobClient.createOrder({
        tokenID: tokenId,
        side: ClobSide.SELL,
        price: sellPrice,
        size: sellSize,
        feeRateBps: 0,
        expiration: 0,
      });

      // Step 3: Post the order
      setStep("placing");
      const result = await postSignedOrder(signedOrder, "GTC");

      if (result.ok) {
        toast.success(`Sold ${sellSize} ${position.outcome || ""} shares for ~$${estimatedProceeds.toFixed(2)}`);
        handleOpenChange(false);
        onSellComplete?.();
      } else {
        const errMsg = result.error || "Sell order failed";
        const errLower = errMsg.toLowerCase();
        if (errLower.includes("not enough balance") || errLower.includes("insufficient") || errLower.includes("allowance")) {
          toast.error("Insufficient token balance or allowance. You may need to re-approve tokens in Settings.");
        } else {
          toast.error(errMsg);
        }
      }
    } catch (err: any) {
      toast.error(err.message || "Sell order failed");
    } finally {
      setSubmitting(false);
      setStep("idle");
    }
  }

  if (!position) return null;

  const stepLabel = step === "fee" ? "Paying fee…" : step === "signing" ? "Sign in wallet…" : step === "placing" ? "Placing order…" : "Sell";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg">Sell Position</DialogTitle>
          <DialogDescription className="sr-only">Sell shares from your position</DialogDescription>
        </DialogHeader>

        {/* Market info */}
        <div className="flex items-start gap-3 pb-3 border-b border-border">
          {position.marketImage && (
            <img src={position.marketImage} alt="" className="h-10 w-10 rounded-md object-cover shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold leading-tight line-clamp-2">
              {position.market || "Unknown Market"}
            </p>
            <div className="flex items-center gap-1.5 mt-1">
              <Badge
                variant={position.outcome === "Yes" ? "default" : "destructive"}
                className="text-[10px] h-5"
              >
                {position.outcome || "Unknown"}
              </Badge>
              <span className="text-xs text-muted-foreground font-mono">{size.toFixed(2)} shares</span>
            </div>
          </div>
        </div>

        {/* Price info */}
        <div className="grid grid-cols-2 gap-3 py-2">
          <div>
            <span className="text-xs text-muted-foreground block">Avg Entry</span>
            <span className="font-mono text-sm font-semibold">{(avgPrice * 100).toFixed(1)}¢</span>
          </div>
          <div>
            <span className="text-xs text-muted-foreground block">Current Price</span>
            <span className={cn("font-mono text-sm font-semibold", currentPrice > avgPrice ? "text-yes" : "text-no")}>
              {(currentPrice * 100).toFixed(1)}¢
            </span>
          </div>
        </div>

        {/* Quantity selector */}
        <div className="space-y-3 py-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Shares to sell</span>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={size}
                step={0.01}
                value={sharesToSell || ""}
                onChange={(e) => setSharesToSell(Math.min(size, Math.max(0, parseFloat(e.target.value) || 0)))}
                className="w-20 rounded-md border border-border bg-background px-2 py-1 text-sm font-mono text-right"
              />
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setSharesToSell(size)}
              >
                Max
              </Button>
            </div>
          </div>

          <Slider
            value={[sharesToSell]}
            onValueChange={([v]) => setSharesToSell(Math.round(v * 100) / 100)}
            min={0}
            max={size}
            step={0.01}
            className="py-2"
          />

          {/* Quick presets */}
          <div className="flex gap-1.5">
            {[0.25, 0.5, 0.75, 1].map((pct) => (
              <Button
                key={pct}
                variant="outline"
                size="sm"
                className="h-7 text-xs flex-1"
                onClick={() => setSharesToSell(Math.round(size * pct * 100) / 100)}
              >
                {pct === 1 ? "100%" : `${pct * 100}%`}
              </Button>
            ))}
          </div>
        </div>

        {/* Proceeds breakdown */}
        {sharesToSell > 0 && (
          <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Estimated proceeds</span>
              <span className="font-mono font-semibold">${estimatedProceeds.toFixed(2)}</span>
            </div>
            {feeEnabled && platformFee > 0 && (
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Platform fee ({PLATFORM_FEE_BPS / 100}%)</span>
                <span className="font-mono text-muted-foreground">-${platformFee.toFixed(2)}</span>
              </div>
            )}
            {feeEnabled && platformFee > 0 && (
              <div className="flex justify-between text-sm border-t border-border pt-2">
                <span className="font-medium">You receive</span>
                <span className="font-mono font-bold">${netAmount.toFixed(2)}</span>
              </div>
            )}
            <div className={cn("flex justify-between text-xs pt-1", realizedPnl >= 0 ? "text-yes" : "text-no")}>
              <span className="flex items-center gap-1">
                {realizedPnl >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                Realized P&L
              </span>
              <span className="font-mono font-semibold">
                {realizedPnl >= 0 ? "+" : ""}{realizedPnl.toFixed(2)}
              </span>
            </div>
          </div>
        )}

        {/* Warning for full sell */}
        {sharesToSell === size && size > 0 && (
          <div className="flex items-center gap-2 rounded-md border border-warning/30 bg-warning/5 p-2">
            <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
            <p className="text-[11px] text-warning">You are selling your entire position.</p>
          </div>
        )}

        {/* Sell button */}
        <Button
          onClick={handleSell}
          disabled={submitting || sharesToSell <= 0 || currentPrice <= 0}
          className="w-full mt-2"
          variant="destructive"
        >
          {submitting ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              {stepLabel}
            </span>
          ) : sharesToSell > 0 ? (
            <span className="flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Sell {sharesToSell.toFixed(2)} shares · Receive ~${(feeEnabled ? netAmount : estimatedProceeds).toFixed(2)}
            </span>
          ) : (
            "Select shares to sell"
          )}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
