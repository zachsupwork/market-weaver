import { useState } from "react";
import { useAccount, useBalance, useReadContract } from "wagmi";
import { ArrowDownToLine, ArrowUpFromLine, ExternalLink, Copy, Check } from "lucide-react";
import { formatUnits } from "viem";

const USDC_ADDRESS = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359" as const;

const erc20Abi = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export function DepositWithdraw() {
  const { address } = useAccount();
  const [copied, setCopied] = useState(false);

  const { data: maticBalance } = useBalance({ address });
  const { data: usdcRaw } = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
  });

  const usdcFormatted = usdcRaw ? formatUnits(usdcRaw as bigint, 6) : "0";
  const maticFormatted = maticBalance ? formatUnits(maticBalance.value, maticBalance.decimals) : "0";

  const copyAddress = () => {
    if (address) {
      navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="space-y-6">
      {/* Wallet address */}
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="text-xs text-muted-foreground mb-2">Your Polygon Wallet Address</p>
        <div className="flex items-center gap-2">
          <code className="text-sm font-mono text-foreground flex-1 truncate">{address}</code>
          <button
            onClick={copyAddress}
            className="shrink-0 rounded-md border border-border p-2 hover:bg-accent transition-all"
          >
            {copied ? <Check className="h-4 w-4 text-yes" /> : <Copy className="h-4 w-4 text-muted-foreground" />}
          </button>
        </div>
      </div>

      {/* Balances */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="h-6 w-6 rounded-full bg-primary flex items-center justify-center text-[10px] font-bold text-primary-foreground">$</div>
            <span className="text-sm font-semibold">USDC</span>
          </div>
          <p className="font-mono text-2xl font-bold">
            ${parseFloat(usdcFormatted).toFixed(2)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Polygon (PoS)</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="h-6 w-6 rounded-full bg-accent flex items-center justify-center text-[10px] font-bold text-accent-foreground">M</div>
            <span className="text-sm font-semibold">POL (MATIC)</span>
          </div>
          <p className="font-mono text-2xl font-bold">
            {parseFloat(maticFormatted).toFixed(4)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">For gas fees</p>
        </div>
      </div>

      {/* Deposit instructions */}
      <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
        <div className="flex items-center gap-2 mb-3">
          <ArrowDownToLine className="h-5 w-5 text-primary" />
          <h3 className="text-sm font-semibold">Deposit</h3>
        </div>
        <ol className="text-xs text-muted-foreground space-y-2 list-decimal list-inside">
          <li>Send <strong className="text-foreground">USDC</strong> to your wallet address above on <strong className="text-foreground">Polygon</strong> network</li>
          <li>You'll also need a small amount of <strong className="text-foreground">POL (MATIC)</strong> for gas fees</li>
          <li>Bridge from Ethereum using the <a href="https://portal.polygon.technology/bridge" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-0.5">Polygon Bridge <ExternalLink className="h-3 w-3" /></a></li>
          <li>Or buy USDC on Polygon directly via your wallet's swap feature</li>
        </ol>
      </div>

      {/* Withdraw instructions */}
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <ArrowUpFromLine className="h-5 w-5 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Withdraw</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Your wallet is non-custodial — you always control your funds. Send USDC from your connected wallet to any address using your wallet app (MetaMask, Rainbow, etc).
        </p>
      </div>

      {/* Useful links */}
      <div className="rounded-lg border border-border bg-card p-4">
        <h3 className="text-sm font-semibold mb-3">Useful Links</h3>
        <div className="space-y-2">
          <a href={`https://polygonscan.com/address/${address}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs text-primary hover:underline">
            <ExternalLink className="h-3 w-3" /> View on Polygonscan
          </a>
          <a href="https://portal.polygon.technology/bridge" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs text-primary hover:underline">
            <ExternalLink className="h-3 w-3" /> Polygon Bridge
          </a>
          <a href="https://polymarket.com" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs text-primary hover:underline">
            <ExternalLink className="h-3 w-3" /> Polymarket.com
          </a>
        </div>
      </div>
    </div>
  );
}
