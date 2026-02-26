import { usePositions } from "@/hooks/usePositions";
import { PositionCard } from "@/components/trading/PositionCard";
import { Wallet, AlertCircle, Loader2, History, PieChart } from "lucide-react";
import { useAccount, useBalance, useReadContract } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { DepositWithdraw } from "@/components/wallet/DepositWithdraw";
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

type Tab = "positions" | "history" | "wallet";

const Portfolio = () => {
  const { isConnected, address } = useAccount();
  const { data: positions, isLoading, error } = usePositions();
  const [tab, setTab] = useState<Tab>("positions");

  const { data: maticBalance } = useBalance({ address });
  const { data: usdcRaw } = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
  });

  const usdcFormatted = usdcRaw ? parseFloat(formatUnits(usdcRaw as bigint, 6)).toFixed(2) : "0.00";
  const maticFormatted = maticBalance ? parseFloat(formatUnits(maticBalance.value, maticBalance.decimals)).toFixed(4) : "0";

  const totalPositionValue = positions
    ? positions.reduce((sum: number, p: any) => sum + parseFloat(p.size || "0") * parseFloat(p.currentPrice || "0"), 0)
    : 0;

  const totalPnl = positions
    ? positions.reduce((sum: number, p: any) => sum + parseFloat(p.pnl || "0"), 0)
    : 0;

  const tabs: { id: Tab; label: string; icon: any }[] = [
    { id: "positions", label: "Positions", icon: PieChart },
    { id: "history", label: "Trade History", icon: History },
    { id: "wallet", label: "Wallet", icon: Wallet },
  ];

  return (
    <div className="min-h-screen">
      <div className="container py-8 max-w-4xl">
        <div className="flex items-center gap-3 mb-6">
          <Wallet className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Portfolio</h1>
          {address && (
            <span className="text-xs font-mono text-muted-foreground bg-secondary px-2 py-0.5 rounded">
              {address.slice(0, 6)}...{address.slice(-4)}
            </span>
          )}
        </div>

        {!isConnected && (
          <div className="text-center py-16">
            <Wallet className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-sm text-muted-foreground mb-4">Connect your wallet to view positions</p>
            <ConnectButton />
          </div>
        )}

        {isConnected && (
          <>
            {/* Stats row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              <div className="rounded-lg border border-border bg-card p-3">
                <span className="text-xs text-muted-foreground block">USDC Balance</span>
                <span className="font-mono text-lg font-bold">${usdcFormatted}</span>
              </div>
              <div className="rounded-lg border border-border bg-card p-3">
                <span className="text-xs text-muted-foreground block">MATIC</span>
                <span className="font-mono text-lg font-bold">{maticFormatted}</span>
              </div>
              <div className="rounded-lg border border-border bg-card p-3">
                <span className="text-xs text-muted-foreground block">Positions Value</span>
                <span className="font-mono text-lg font-bold">${totalPositionValue.toFixed(2)}</span>
              </div>
              <div className="rounded-lg border border-border bg-card p-3">
                <span className="text-xs text-muted-foreground block">Total P&L</span>
                <span className={cn("font-mono text-lg font-bold", totalPnl >= 0 ? "text-yes" : "text-no")}>
                  {totalPnl >= 0 ? "+" : ""}{totalPnl.toFixed(2)}
                </span>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 border-b border-border mb-6">
              {tabs.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  className={cn(
                    "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-all border-b-2 -mb-px",
                    tab === id
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              ))}
            </div>

            {/* Positions tab */}
            {tab === "positions" && (
              <>
                {isLoading && (
                  <div className="flex items-center justify-center py-16">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                )}
                {error && (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-destructive">Failed to load positions</p>
                      <p className="text-xs text-muted-foreground mt-1">{(error as Error).message}</p>
                    </div>
                  </div>
                )}
                {positions && positions.length === 0 && (
                  <div className="text-center py-16">
                    <PieChart className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">No open positions</p>
                  </div>
                )}
                {positions && positions.length > 0 && (
                  <div className="grid gap-3">
                    {positions.map((pos: any, i: number) => (
                      <PositionCard key={pos.condition_id || i} position={pos} />
                    ))}
                  </div>
                )}
              </>
            )}

            {/* Trade History tab */}
            {tab === "history" && (
              <div className="text-center py-16">
                <History className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">
                  Trade history is fetched from Polymarket's data API.
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Coming soon — historical trades by wallet address.
                </p>
              </div>
            )}

            {/* Wallet tab */}
            {tab === "wallet" && <DepositWithdraw />}
          </>
        )}
      </div>
    </div>
  );
};

export default Portfolio;
