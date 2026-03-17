import { usePositions } from "@/hooks/usePositions";
import { PositionCard } from "@/components/trading/PositionCard";
import { SellPositionModal, type SellPositionData } from "@/components/trading/SellPositionModal";
import { ClaimWinningsModal, type ClaimablePosition } from "@/components/trading/ClaimWinningsModal";
import {
  Wallet, AlertCircle, Loader2, History, PieChart, ClipboardList,
  ArrowUpDown, Filter, RefreshCw, TrendingUp, Trophy, PartyPopper,
} from "lucide-react";
import { useAccount, useBalance, useReadContract } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useState, useMemo, useCallback } from "react";
import { cn } from "@/lib/utils";
import { DepositWithdraw } from "@/components/wallet/DepositWithdraw";
import { OrdersPanel } from "@/components/orders/OrdersPanel";
import { formatUnits } from "viem";
import { Button } from "@/components/ui/button";
import { useProxyWallet } from "@/hooks/useProxyWallet";

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

type Tab = "positions" | "orders" | "history" | "wallet";
type SortKey = "value" | "pnl" | "pnlPct" | "name" | "endDate";
type PositionFilter = "all" | "active" | "resolved" | "winners";

const SORT_OPTIONS: { id: SortKey; label: string }[] = [
  { id: "value", label: "Value" },
  { id: "pnl", label: "P&L $" },
  { id: "pnlPct", label: "P&L %" },
  { id: "name", label: "Name" },
  { id: "endDate", label: "End Date" },
];

const FILTER_OPTIONS: { id: PositionFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "resolved", label: "Resolved" },
  { id: "winners", label: "Winners" },
];

const Portfolio = () => {
  const { isConnected, address } = useAccount();
  const { proxyAddress } = useProxyWallet();
  const { data: positions, isLoading, error, refetch } = usePositions();
  const [tab, setTab] = useState<Tab>("positions");
  const [sortKey, setSortKey] = useState<SortKey>("value");
  const [sortDesc, setSortDesc] = useState(true);
  const [posFilter, setPosFilter] = useState<PositionFilter>("all");
  const [sellPosition, setSellPosition] = useState<SellPositionData | null>(null);
  const [sellModalOpen, setSellModalOpen] = useState(false);
  const [claimPosition, setClaimPosition] = useState<ClaimablePosition | null>(null);
  const [claimModalOpen, setClaimModalOpen] = useState(false);

  const handleSellClick = useCallback((pos: any) => {
    setSellPosition(pos as SellPositionData);
    setSellModalOpen(true);
  }, []);

  const handleClaimClick = useCallback((pos: any) => {
    setClaimPosition(pos as ClaimablePosition);
    setClaimModalOpen(true);
  }, []);

  const handleSellComplete = useCallback(() => {
    refetch();
  }, [refetch]);

  const handleClaimComplete = useCallback(() => {
    refetch();
  }, [refetch]);

  const { data: maticBalance } = useBalance({ address });
  const { data: usdcRaw } = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
  });

  const usdcFormatted = usdcRaw ? parseFloat(formatUnits(usdcRaw as bigint, 6)).toFixed(2) : "0.00";
  const maticFormatted = maticBalance ? parseFloat(formatUnits(maticBalance.value, maticBalance.decimals)).toFixed(4) : "0";

  // Filter and sort positions
  const processedPositions = useMemo(() => {
    if (!positions) return [];
    let filtered = [...positions];

    // Apply filter
    switch (posFilter) {
      case "active":
        filtered = filtered.filter((p: any) => !p.resolved);
        break;
      case "resolved":
        filtered = filtered.filter((p: any) => p.resolved);
        break;
      case "winners":
        filtered = filtered.filter((p: any) => p.isWinner);
        break;
    }

    // Sort
    filtered.sort((a: any, b: any) => {
      let aVal = 0, bVal = 0;
      switch (sortKey) {
        case "value":
          aVal = parseFloat(a.currentValue || "0") || parseFloat(a.size || "0") * parseFloat(a.currentPrice || "0");
          bVal = parseFloat(b.currentValue || "0") || parseFloat(b.size || "0") * parseFloat(b.currentPrice || "0");
          break;
        case "pnl":
          aVal = parseFloat(a.cashPnl || a.pnl || "0");
          bVal = parseFloat(b.cashPnl || b.pnl || "0");
          break;
        case "pnlPct":
          aVal = parseFloat(a.percentPnl || "0");
          bVal = parseFloat(b.percentPnl || "0");
          break;
        case "name":
          return sortDesc
            ? (b.market || "").localeCompare(a.market || "")
            : (a.market || "").localeCompare(b.market || "");
        case "endDate":
          aVal = a.marketEndDate ? new Date(a.marketEndDate).getTime() : 0;
          bVal = b.marketEndDate ? new Date(b.marketEndDate).getTime() : 0;
          break;
      }
      return sortDesc ? bVal - aVal : aVal - bVal;
    });

    return filtered;
  }, [positions, posFilter, sortKey, sortDesc]);

  const totalPositionValue = positions
    ? positions.reduce((sum: number, p: any) => {
        const val = parseFloat(p.currentValue || "0") || parseFloat(p.size || "0") * parseFloat(p.currentPrice || "0");
        return sum + val;
      }, 0)
    : 0;

  const totalPnl = positions
    ? positions.reduce((sum: number, p: any) => sum + parseFloat(p.cashPnl || p.pnl || "0"), 0)
    : 0;

  const activeCount = positions?.filter((p: any) => !p.resolved).length || 0;
  const winnerCount = positions?.filter((p: any) => p.isWinner).length || 0;

  const tabs: { id: Tab; label: string; icon: any; count?: number }[] = [
    { id: "positions", label: "Positions", icon: PieChart, count: positions?.length },
    { id: "orders", label: "Orders", icon: ClipboardList },
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
          {proxyAddress && (
            <span className="text-[10px] font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded" title="Trading wallet (Safe)">
              Safe: {proxyAddress.slice(0, 6)}...{proxyAddress.slice(-4)}
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
                <span className="text-xs text-muted-foreground block">POL</span>
                <span className="font-mono text-lg font-bold">{maticFormatted}</span>
              </div>
              <div className="rounded-lg border border-border bg-card p-3">
                <span className="text-xs text-muted-foreground block">Positions ({activeCount} active)</span>
                <span className="font-mono text-lg font-bold">${totalPositionValue.toFixed(2)}</span>
              </div>
              <div className="rounded-lg border border-border bg-card p-3">
                <span className="text-xs text-muted-foreground block">Total P&L</span>
                <div className="flex items-center gap-1">
                  <span className={cn("font-mono text-lg font-bold", totalPnl >= 0 ? "text-yes" : "text-no")}>
                    {totalPnl >= 0 ? "+" : ""}{totalPnl.toFixed(2)}
                  </span>
                  {winnerCount > 0 && (
                    <span className="text-[10px] text-yes bg-yes/10 px-1.5 py-0.5 rounded">{winnerCount} won</span>
                  )}
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 border-b border-border mb-6">
              {tabs.map(({ id, label, icon: Icon, count }) => (
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
                  {count !== undefined && count > 0 && (
                    <span className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded">{count}</span>
                  )}
                </button>
              ))}
            </div>

            {/* Positions tab */}
            {tab === "positions" && (
              <>
                {/* Sort & filter toolbar */}
                {positions && positions.length > 0 && (
                  <div className="flex flex-col sm:flex-row gap-2 mb-4">
                    {/* Filters */}
                    <div className="flex gap-1">
                      {FILTER_OPTIONS.map(({ id, label }) => (
                        <button
                          key={id}
                          onClick={() => setPosFilter(id)}
                          className={cn(
                            "rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                            posFilter === id
                              ? "bg-primary/20 text-primary border border-primary/40"
                              : "bg-muted text-muted-foreground border border-transparent hover:bg-accent"
                          )}
                        >
                          {label}
                        </button>
                      ))}
                    </div>

                    {/* Sort */}
                    <div className="flex items-center gap-1.5 ml-auto">
                      <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
                      <select
                        value={sortKey}
                        onChange={(e) => setSortKey(e.target.value as SortKey)}
                        className="rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground"
                      >
                        {SORT_OPTIONS.map(({ id, label }) => (
                          <option key={id} value={id}>{label}</option>
                        ))}
                      </select>
                      <button
                        onClick={() => setSortDesc(!sortDesc)}
                        className="rounded-md border border-border p-1 hover:bg-accent text-xs"
                        title={sortDesc ? "Descending" : "Ascending"}
                      >
                        {sortDesc ? "↓" : "↑"}
                      </button>
                      <Button variant="ghost" size="sm" onClick={() => refetch()} className="h-7">
                        <RefreshCw className={cn("h-3 w-3", isLoading && "animate-spin")} />
                      </Button>
                    </div>
                  </div>
                )}

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
                    <p className="text-xs text-muted-foreground mt-1">Place your first trade to see positions here.</p>
                  </div>
                )}
                {processedPositions.length === 0 && positions && positions.length > 0 && (
                  <div className="text-center py-12">
                    <Filter className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No positions match this filter.</p>
                  </div>
                )}
                {processedPositions.length > 0 && (
                  <div className="grid gap-3">
                    {processedPositions.map((pos: any, i: number) => (
                      <PositionCard key={pos.asset || pos.condition_id || i} position={pos} onSell={handleSellClick} />
                    ))}
                  </div>
                )}
              </>
            )}

            {/* Orders tab */}
            {tab === "orders" && <OrdersPanel />}

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

      <SellPositionModal
        open={sellModalOpen}
        onOpenChange={setSellModalOpen}
        position={sellPosition}
        onSellComplete={handleSellComplete}
      />
    </div>
  );
};

export default Portfolio;
