import { useState, useCallback } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useBalance } from "wagmi";
import { polygon } from "wagmi/chains";
import { formatUnits, parseUnits, erc20Abi } from "viem";
import { ethers } from "ethers";
import {
  ArrowRightLeft, ArrowDownToLine, ArrowUpFromLine, Loader2, AlertCircle,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { POLYGON_USDCE_ADDRESS } from "@/lib/constants/tokens";
import { withdrawFromSafe } from "@/lib/safe";

type Direction = "deposit" | "withdraw";

interface WalletTransferProps {
  /** User's EOA (personal wallet) address */
  eoaAddress: `0x${string}`;
  /** User's Safe (trading wallet) address */
  safeAddress: string;
  /** EOA USDC.e balance (human-readable number) */
  eoaBalance: number;
  /** Safe USDC.e balance (human-readable number) */
  safeBalance: number;
  /** POL balance string for gas display */
  polBalance: string;
  /** Callback to refresh balances after transfer */
  onTransferComplete?: () => void;
}

export function WalletTransfer({
  eoaAddress,
  safeAddress,
  eoaBalance,
  safeBalance,
  polBalance,
  onTransferComplete,
}: WalletTransferProps) {
  const { toast } = useToast();
  const [direction, setDirection] = useState<Direction>("deposit");
  const [amount, setAmount] = useState("");
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);

  // ── Deposit (EOA → Safe) uses wagmi writeContract ──
  const { writeContract, data: depositTxHash, isPending: isDepositPending } = useWriteContract();
  const { isLoading: isDepositConfirming, isSuccess: isDepositConfirmed } = useWaitForTransactionReceipt({
    hash: depositTxHash,
  });

  // Reset after deposit confirmed
  if (isDepositConfirmed && depositTxHash) {
    // handled via useEffect in parent or here
  }

  const maxAmount = direction === "deposit" ? eoaBalance : safeBalance;
  const parsedAmount = parseFloat(amount);
  const isValidAmount = !isNaN(parsedAmount) && parsedAmount > 0 && parsedAmount <= maxAmount;
  const isBusy = isDepositPending || isDepositConfirming || isWithdrawing;

  const presets = [5, 10, 25];

  function setPreset(v: number) {
    if (v <= maxAmount) setAmount(String(v));
  }

  function setMax() {
    setAmount(String(Math.floor(maxAmount * 100) / 100));
  }

  // ── Deposit handler ──
  function handleDeposit() {
    if (!isValidAmount) return;
    writeContract({
      account: eoaAddress,
      chain: polygon,
      address: POLYGON_USDCE_ADDRESS,
      abi: erc20Abi,
      functionName: "transfer",
      args: [safeAddress as `0x${string}`, parseUnits(amount, 6)],
    });
    toast({ title: "Confirm the transfer in your wallet" });
  }

  // ── Withdraw handler (Safe → EOA) ──
  async function handleWithdraw() {
    if (!isValidAmount) return;
    setIsWithdrawing(true);
    setWithdrawError(null);
    try {
      // Get ethers signer from MetaMask
      const ethersProvider = new ethers.providers.Web3Provider(
        (window as any).ethereum,
        137
      );
      const signer = ethersProvider.getSigner();

      const amountWei = ethers.utils.parseUnits(amount, 6);

      toast({ title: "Sign the withdrawal in your wallet" });

      await withdrawFromSafe({
        safeAddress,
        tokenAddress: POLYGON_USDCE_ADDRESS,
        recipient: eoaAddress,
        amount: amountWei,
        signer,
        chainId: 137,
      });

      toast({ title: "Withdrawal confirmed!" });
      setAmount("");
      onTransferComplete?.();
    } catch (err: any) {
      console.error("[WalletTransfer] Withdraw failed:", err);
      const msg = err?.reason || err?.message || "Withdrawal failed";
      setWithdrawError(msg);
      toast({ title: "Withdrawal failed", description: msg, variant: "destructive" });
    } finally {
      setIsWithdrawing(false);
    }
  }

  function handleSubmit() {
    if (direction === "deposit") handleDeposit();
    else handleWithdraw();
  }

  return (
    <Card className="border-primary/20">
      <CardContent className="p-4 space-y-4">
        {/* Direction toggle */}
        <div className="flex rounded-lg border border-border overflow-hidden">
          <button
            onClick={() => { setDirection("deposit"); setAmount(""); setWithdrawError(null); }}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold transition-all",
              direction === "deposit"
                ? "bg-primary text-primary-foreground"
                : "bg-card text-muted-foreground hover:text-foreground"
            )}
          >
            <ArrowDownToLine className="h-3.5 w-3.5" />
            Deposit to Trading
          </button>
          <button
            onClick={() => { setDirection("withdraw"); setAmount(""); setWithdrawError(null); }}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold transition-all",
              direction === "withdraw"
                ? "bg-primary text-primary-foreground"
                : "bg-card text-muted-foreground hover:text-foreground"
            )}
          >
            <ArrowUpFromLine className="h-3.5 w-3.5" />
            Withdraw to Wallet
          </button>
        </div>

        {/* Info */}
        <div className="text-[10px] text-muted-foreground space-y-1">
          {direction === "deposit" ? (
            <p>Move <strong className="text-foreground">USDC.e</strong> from your personal wallet to your Trading Wallet.</p>
          ) : (
            <>
              <p>Move <strong className="text-foreground">USDC.e</strong> from your Trading Wallet back to your personal wallet.</p>
              <p className="flex items-center gap-1 text-warning">
                <AlertCircle className="h-3 w-3" />
                Requires POL in your personal wallet for gas ({polBalance} POL available)
              </p>
            </>
          )}
        </div>

        {/* Balance */}
        <div className="flex items-center justify-between rounded-md bg-muted/30 px-3 py-2">
          <span className="text-xs text-muted-foreground">
            {direction === "deposit" ? "My Wallet" : "Trading Wallet"} Balance
          </span>
          <span className="font-mono text-sm font-bold">${maxAmount.toFixed(2)}</span>
        </div>

        {/* Presets */}
        <div className="flex gap-2 flex-wrap">
          {presets.map((v) => (
            <Button
              key={v}
              type="button"
              variant="outline"
              size="sm"
              className="text-xs font-mono"
              disabled={maxAmount < v}
              onClick={() => setPreset(v)}
            >
              ${v}
            </Button>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="text-xs font-mono"
            onClick={setMax}
            disabled={maxAmount <= 0}
          >
            Max (${(Math.floor(maxAmount * 100) / 100).toFixed(2)})
          </Button>
        </div>

        {/* Input + Submit */}
        <div className="flex gap-2">
          <Input
            type="number"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="font-mono text-xs flex-1"
            step="0.01"
            min="0"
          />
          <Button
            onClick={handleSubmit}
            disabled={isBusy || !isValidAmount}
            className="gap-1.5"
          >
            {isBusy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowRightLeft className="h-4 w-4" />
            )}
            {isBusy
              ? direction === "deposit"
                ? "Transferring…"
                : "Withdrawing…"
              : direction === "deposit"
                ? "Deposit"
                : "Withdraw"}
          </Button>
        </div>

        {/* Withdraw error */}
        {withdrawError && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2">
            <p className="text-[10px] text-destructive">{withdrawError}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
