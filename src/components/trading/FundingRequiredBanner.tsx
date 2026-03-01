import { useState } from "react";
import { AlertTriangle, Copy, Check, RefreshCw, Loader2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { useChainId, useSwitchChain } from "wagmi";
import { polygon } from "wagmi/chains";
import { FundUsdcModal } from "./FundUsdcModal";

interface FundingRequiredBannerProps {
  traderAddress: string;
  requiredUsdc: number;
  usdcBalance: number;
  needsApproval: boolean;
  isApproving: boolean;
  onApprove: () => Promise<void>;
  onRefresh: () => void;
}

export function FundingRequiredBanner({
  traderAddress,
  requiredUsdc,
  usdcBalance,
  needsApproval,
  isApproving,
  onApprove,
  onRefresh,
}: FundingRequiredBannerProps) {
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const [fundModalOpen, setFundModalOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const isPolygon = chainId === polygon.id;
  const hasSufficientBalance = usdcBalance >= requiredUsdc && requiredUsdc > 0;

  function copyAddress() {
    navigator.clipboard.writeText(traderAddress);
    setCopied(true);
    toast.success("Address copied");
    setTimeout(() => setCopied(false), 2000);
  }

  // Wrong chain
  if (!isPolygon) {
    return (
      <div className="rounded-md border border-warning/30 bg-warning/5 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
          <span className="text-xs font-medium text-warning">Switch to Polygon to trade</span>
        </div>
        <button type="button" onClick={() => switchChain?.({ chainId: polygon.id })}
          className="w-full rounded-md bg-primary text-primary-foreground py-1.5 text-xs font-semibold hover:bg-primary/90 transition-all">
          Switch to Polygon
        </button>
      </div>
    );
  }

  // Insufficient balance
  if (!hasSufficientBalance && requiredUsdc > 0) {
    return (
      <>
        <div className="rounded-md border border-warning/30 bg-warning/5 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Wallet className="h-4 w-4 text-warning shrink-0" />
            <span className="text-xs font-medium text-warning">
              Insufficient USDC.e
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Need <strong className="text-foreground">${requiredUsdc.toFixed(2)}</strong> USDC.e — Balance: <strong className="text-foreground">${usdcBalance.toFixed(2)}</strong>
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setFundModalOpen(true)}
              className="flex-1 rounded-md bg-primary text-primary-foreground py-1.5 text-xs font-semibold hover:bg-primary/90 transition-all">
              Fund USDC.e
            </button>
            <button type="button" onClick={copyAddress}
              className="shrink-0 rounded-md border border-border px-2.5 py-1.5 text-xs hover:bg-accent transition-all">
              {copied ? <Check className="h-3.5 w-3.5 text-yes" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
            <button type="button" onClick={onRefresh}
              className="shrink-0 rounded-md border border-border px-2.5 py-1.5 text-xs hover:bg-accent transition-all">
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <FundUsdcModal open={fundModalOpen} onOpenChange={setFundModalOpen} traderAddress={traderAddress} onRefresh={onRefresh} />
      </>
    );
  }

  // Needs approval
  if (needsApproval) {
    return (
      <div className="rounded-md border border-primary/20 bg-primary/5 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-primary shrink-0" />
          <span className="text-xs font-medium text-foreground">One-time approval required to trade</span>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onApprove} disabled={isApproving}
            className="flex-1 rounded-md bg-primary text-primary-foreground py-1.5 text-xs font-semibold hover:bg-primary/90 transition-all disabled:opacity-50">
            {isApproving ? <Loader2 className="h-3.5 w-3.5 animate-spin mx-auto" /> : "Approve USDC.e"}
          </button>
          <button type="button" onClick={onRefresh}
            className="shrink-0 rounded-md border border-border px-2.5 py-1.5 text-xs hover:bg-accent transition-all">
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    );
  }

  return null;
}
