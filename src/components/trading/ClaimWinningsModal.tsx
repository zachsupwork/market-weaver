import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Trophy, PartyPopper, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useAccount } from "wagmi";
import { useProxyWallet } from "@/hooks/useProxyWallet";
import { redeemFromSafe } from "@/lib/safe";
import { ethers } from "ethers";

export interface ClaimablePosition {
  asset: string;
  condition_id: string;
  size: string;
  avgPrice?: string;
  currentValue?: string;
  market?: string;
  outcome?: string;
  cashPnl?: string;
  percentPnl?: string;
  marketImage?: string;
  eventSlug?: string;
}

interface ClaimWinningsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  position: ClaimablePosition | null;
  onClaimComplete?: () => void;
}

export function ClaimWinningsModal({ open, onOpenChange, position, onClaimComplete }: ClaimWinningsModalProps) {
  const { address } = useAccount();
  const { proxyAddress } = useProxyWallet();
  const [claiming, setClaiming] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);

  if (!position) return null;

  const size = parseFloat(position.size || "0");
  const winnings = parseFloat(position.currentValue || "0") || size; // Winning shares redeem 1:1
  const costBasis = size * parseFloat(position.avgPrice || "0");
  const profit = winnings - costBasis;
  const profitPct = costBasis > 0 ? ((profit / costBasis) * 100) : 0;

  async function handleClaim() {
    if (!address || !proxyAddress) {
      toast.error("Wallet or trading wallet not connected");
      return;
    }

    const conditionId = position?.condition_id;
    if (!conditionId || conditionId.length < 10 || !conditionId.startsWith("0x")) {
      console.error("[ClaimWinnings] Invalid condition_id:", conditionId, "position:", JSON.stringify(position));
      toast.error("Missing or invalid condition ID for this market. Please refresh your positions and try again.");
      return;
    }

    const size = parseFloat(position?.size || "0");
    if (size <= 0) {
      toast.error("No shares to redeem.");
      return;
    }

    if (!(window as any).ethereum) {
      toast.error("Wallet provider not found");
      return;
    }

    setClaiming(true);
    setTxHash(null);

    try {
      const provider = new ethers.providers.Web3Provider((window as any).ethereum, "any");

      // Ensure user is on Polygon
      const network = await provider.getNetwork();
      if (network.chainId !== 137) {
        toast.error("Please switch to Polygon network to claim winnings.");
        setClaiming(false);
        return;
      }

      const signer = provider.getSigner();

      console.log("[ClaimWinnings] Starting redemption:", {
        safeAddress: proxyAddress,
        conditionId,
        shares: size,
        chainId: network.chainId,
      });

      toast.info("Preparing redemption transaction…");

      const receipt = await redeemFromSafe({
        safeAddress: proxyAddress,
        conditionId,
        signer,
        chainId: 137,
      });

      setTxHash(receipt.transactionHash);
      toast.success(`Winnings claimed! $${winnings.toFixed(2)} redeemed to your trading wallet.`);
      onClaimComplete?.();
    } catch (err: any) {
      const msg = err.message || "Redemption failed";
      console.error("[ClaimWinnings] Error:", err);
      console.error("[ClaimWinnings] Position data:", JSON.stringify(position));

      if (err?.code === 4001 || err?.code === "ACTION_REJECTED") {
        toast.error("Transaction rejected by user.");
      } else if (msg.includes("GS026") || msg.includes("Invalid owner")) {
        toast.error("Safe signature error. Make sure you're connected with the correct wallet.");
      } else if (msg.includes("BigNumber") || msg.includes("invalid")) {
        toast.error("Invalid redemption data. The market condition ID may be malformed. Please refresh and try again.");
      } else {
        toast.error(`Claim failed: ${msg}`);
      }
    } finally {
      setClaiming(false);
    }
  }

  const handleClose = (v: boolean) => {
    if (!claiming) {
      setTxHash(null);
      onOpenChange(v);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Trophy className="h-5 w-5 text-yes" />
            Claim Winnings
          </DialogTitle>
          <DialogDescription className="sr-only">Redeem your winning position</DialogDescription>
        </DialogHeader>

        {/* Success state */}
        {txHash ? (
          <div className="text-center py-6 space-y-4">
            <PartyPopper className="h-12 w-12 text-yes mx-auto" />
            <div>
              <p className="text-lg font-bold text-yes">Winnings Claimed!</p>
              <p className="text-sm text-muted-foreground mt-1">
                ${winnings.toFixed(2)} USDC.e has been redeemed to your trading wallet.
              </p>
            </div>
            <a
              href={`https://polygonscan.com/tx/${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <ExternalLink className="h-3 w-3" /> View on Polygonscan
            </a>
            <Button onClick={() => handleClose(false)} className="w-full mt-2">
              Done
            </Button>
          </div>
        ) : (
          <>
            {/* Market info */}
            <div className="flex items-start gap-3 pb-3 border-b border-border">
              {position.marketImage && (
                <img src={position.marketImage} alt="" className="h-10 w-10 rounded-md object-cover shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold leading-tight line-clamp-2">
                  {position.market || "Resolved Market"}
                </p>
                <div className="flex items-center gap-1.5 mt-1">
                  <Badge variant="default" className="text-[10px] h-5 bg-yes text-yes-foreground">
                    <Trophy className="h-3 w-3 mr-0.5" /> Winner
                  </Badge>
                  <Badge variant="secondary" className="text-[10px] h-5">
                    {position.outcome || "Unknown"}
                  </Badge>
                </div>
              </div>
            </div>

            {/* Winnings breakdown */}
            <div className="rounded-lg border border-yes/20 bg-yes/5 p-4 space-y-3">
              <div className="text-center">
                <p className="text-xs text-muted-foreground">You won</p>
                <p className="text-3xl font-bold text-yes">${winnings.toFixed(2)}</p>
              </div>

              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Shares held</span>
                  <span className="font-mono">{size.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Avg entry price</span>
                  <span className="font-mono">{(parseFloat(position.avgPrice || "0") * 100).toFixed(1)}¢</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Cost basis</span>
                  <span className="font-mono">${costBasis.toFixed(2)}</span>
                </div>
                <div className="flex justify-between border-t border-border pt-1.5">
                  <span className="font-medium">Profit</span>
                  <span className={cn("font-mono font-bold", profit >= 0 ? "text-yes" : "text-no")}>
                    {profit >= 0 ? "+" : ""}{profit.toFixed(2)}
                    <span className="text-[10px] ml-1 opacity-70">
                      ({profitPct >= 0 ? "+" : ""}{profitPct.toFixed(0)}%)
                    </span>
                  </span>
                </div>
              </div>
            </div>

            {/* Gas note */}
            <p className="text-[10px] text-muted-foreground text-center">
              This transaction requires a small amount of POL for gas, paid from your personal wallet.
            </p>

            {/* Claim button */}
            <Button
              onClick={handleClaim}
              disabled={claiming || !proxyAddress}
              className="w-full bg-yes hover:bg-yes/90 text-yes-foreground"
            >
              {claiming ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Claiming…
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Trophy className="h-4 w-4" />
                  Claim ${winnings.toFixed(2)}
                </span>
              )}
            </Button>

            {!proxyAddress && (
              <p className="text-[11px] text-destructive text-center">
                Trading wallet not detected. Connect your wallet and enable trading first.
              </p>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
