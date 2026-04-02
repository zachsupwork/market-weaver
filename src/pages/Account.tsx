import { useState, useEffect, useCallback } from "react";
import { useAccount, useBalance, useReadContract } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useSearchParams, Link } from "react-router-dom";
import { formatUnits } from "viem";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Wallet, RefreshCw, Loader2, PieChart, ClipboardList, History,
  ArrowDownToLine, ArrowUpFromLine, AlertCircle, Info, ChevronDown,
  DollarSign, ExternalLink, Banknote, Settings, Copy, Check, ArrowRightLeft,
  Trophy, PartyPopper,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { usePositions } from "@/hooks/usePositions";
import { WalletTransfer } from "@/components/wallet/WalletTransfer";
import { PositionCard } from "@/components/trading/PositionCard";
import { SellPositionModal, type SellPositionData } from "@/components/trading/SellPositionModal";
import { ClaimWinningsModal, type ClaimablePosition } from "@/components/trading/ClaimWinningsModal";
import { DepositAddressCard } from "@/components/polymarket/DepositAddressCard";
import { DepositStatusTracker } from "@/components/polymarket/DepositStatusTracker";
import { useProxyWallet } from "@/hooks/useProxyWallet";
import { OrdersPanel } from "@/components/orders/OrdersPanel";
import { QRCodeSVG } from "qrcode.react";
import { POLYGON_USDCE_ADDRESS, POLYGON_USDC_ADDRESS } from "@/lib/constants/tokens";
import { USDC_TO_USDC_E_SWAP_URL } from "@/lib/tokens";
import {
  createDepositAddress,
  fetchOpenOrders,
  fetchTradeHistory,
  initiateWithdrawal,
  cancelOrder,
} from "@/lib/polymarket-api";

const balanceOfAbi = [
  {
    name: "balanceOf",
    type: "function" as const,
    stateMutability: "view" as const,
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

type Tab = "balances" | "deposit" | "withdraw" | "positions" | "orders" | "trades";

const tabs: { id: Tab; label: string; icon: any }[] = [
  { id: "balances", label: "Balances", icon: DollarSign },
  { id: "deposit", label: "Deposit", icon: ArrowDownToLine },
  { id: "withdraw", label: "Withdraw", icon: ArrowUpFromLine },
  { id: "positions", label: "Positions", icon: PieChart },
  { id: "orders", label: "Orders", icon: ClipboardList },
  { id: "trades", label: "Trades", icon: History },
];

export default function Account() {
  const { isConnected, address } = useAccount();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = (searchParams.get("tab") as Tab) || "balances";
  const [tab, setTab] = useState<Tab>(initialTab);
  const { proxyAddress } = useProxyWallet();

  // ── Positions (must be before sell/claim callbacks) ────────
  const { data: positions, isLoading: posLoading, error: posError, refetch: refetchPositions } = usePositions();

  // ── Sell / Claim modals ──────────────────────────────────
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
    refetchPositions();
  }, [refetchPositions]);

  const handleClaimComplete = useCallback(() => {
    refetchPositions();
  }, [refetchPositions]);

  // ── Balances ──────────────────────────────────────────────
  const { data: maticBalance, refetch: refetchMatic } = useBalance({ address });

  // Trading Wallet (proxy) USDC.e
  const { data: proxyUsdcERaw, refetch: refetchProxyUsdcE } = useReadContract({
    address: POLYGON_USDCE_ADDRESS,
    abi: balanceOfAbi,
    functionName: "balanceOf",
    args: proxyAddress ? [proxyAddress as `0x${string}`] : undefined,
    query: { enabled: !!proxyAddress },
  });

  // My Wallet (EOA) USDC.e
  const { data: eoaUsdcERaw, refetch: refetchEoaUsdcE } = useReadContract({
    address: POLYGON_USDCE_ADDRESS,
    abi: balanceOfAbi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  // My Wallet (EOA) native USDC (for display)
  const { data: eoaUsdcRaw, refetch: refetchEoaUsdc } = useReadContract({
    address: POLYGON_USDC_ADDRESS,
    abi: balanceOfAbi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const [balanceUpdated, setBalanceUpdated] = useState<Date | null>(null);

  const proxyUsdcE = proxyUsdcERaw ? parseFloat(formatUnits(proxyUsdcERaw as bigint, 6)) : 0;
  const eoaUsdcE = eoaUsdcERaw ? parseFloat(formatUnits(eoaUsdcERaw as bigint, 6)) : 0;
  const eoaUsdc = eoaUsdcRaw ? parseFloat(formatUnits(eoaUsdcRaw as bigint, 6)) : 0;
  const maticFormatted = maticBalance ? parseFloat(formatUnits(maticBalance.value, maticBalance.decimals)).toFixed(4) : "0";



  // ── Deposit address (copied) ─────────────────────────────
  const [copied, setCopied] = useState(false);
  function copyAddress(addr: string) {
    navigator.clipboard.writeText(addr);
    setCopied(true);
    toast({ title: "Address copied!" });
    setTimeout(() => setCopied(false), 2000);
  }

  // ── Positions (declared above, before sell/claim callbacks) ──

  // ── Bridge Deposit (secondary) ───────────────────────────
  const [depositLoading, setDepositLoading] = useState(false);
  const [depositInfo, setDepositInfo] = useState<any>(null);
  const [depositError, setDepositError] = useState<any>(null);

  // ── Withdraw ─────────────────────────────────────────────
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawDest, setWithdrawDest] = useState("");
  const [withdrawChain, setWithdrawChain] = useState("polygon");
  const [withdrawLoading, setWithdrawLoading] = useState(false);
  const [withdrawResult, setWithdrawResult] = useState<any>(null);

  // ── Orders ───────────────────────────────────────────────
  const [orders, setOrders] = useState<any[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState<string | null>(null);

  // ── Trades ───────────────────────────────────────────────
  const [trades, setTrades] = useState<any[]>([]);
  const [tradesLoading, setTradesLoading] = useState(false);

  function changeTab(t: Tab) {
    setTab(t);
    setSearchParams({ tab: t });
  }

  const refreshBalances = useCallback(async () => {
    await Promise.all([refetchMatic(), refetchProxyUsdcE(), refetchEoaUsdcE(), refetchEoaUsdc()]);
    setBalanceUpdated(new Date());
  }, [refetchMatic, refetchProxyUsdcE, refetchEoaUsdcE, refetchEoaUsdc]);

  async function loadOrders() {
    setOrdersLoading(true);
    setOrdersError(null);
    try {
      const res = await fetchOpenOrders();
      if (res.ok) setOrders(res.orders || []);
      else setOrdersError(res.error || "Failed to load orders");
    } catch (err: any) {
      setOrdersError(err.message);
    } finally {
      setOrdersLoading(false);
    }
  }

  async function loadTrades() {
    if (!address) return;
    setTradesLoading(true);
    try {
      const data = await fetchTradeHistory(address);
      setTrades(data);
    } catch {
      setTrades([]);
    } finally {
      setTradesLoading(false);
    }
  }

  useEffect(() => {
    if (tab === "orders" && orders.length === 0 && !ordersLoading) loadOrders();
    if (tab === "trades" && trades.length === 0 && !tradesLoading) loadTrades();
    if (tab === "positions" && !posLoading) refetchPositions();
  }, [tab]);

  async function handleDeposit() {
    if (!address) return;
    setDepositLoading(true);
    setDepositError(null);
    try {
      const result = await createDepositAddress(address);
      if (result.ok) {
        setDepositInfo(result.deposit);
        toast({ title: "Bridge deposit address retrieved" });
      } else {
        setDepositError(result);
        toast({ title: "Deposit failed", description: result.error || "Unknown error", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setDepositLoading(false);
    }
  }

  async function handleWithdraw() {
    if (!withdrawAmount || !withdrawDest) {
      toast({ title: "Enter amount and destination", variant: "destructive" });
      return;
    }
    setWithdrawLoading(true);
    setWithdrawResult(null);
    try {
      const res = await initiateWithdrawal({ amount: withdrawAmount, destinationAddress: withdrawDest, chain: withdrawChain });
      if (res.ok) {
        setWithdrawResult(res.withdrawal);
        toast({ title: "Withdrawal initiated" });
      } else {
        toast({ title: "Withdraw failed", description: res.error || "Unknown error", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setWithdrawLoading(false);
    }
  }

  async function handleCancelOrder(orderId: string) {
    try {
      const res = await cancelOrder(orderId);
      if (res.ok) { toast({ title: "Order cancelled" }); loadOrders(); }
      else toast({ title: "Cancel failed", description: res.error, variant: "destructive" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  }

  const depositAddresses = depositInfo?.address || depositInfo?.addresses || null;
  const trackingAddress = depositAddresses?.evm || depositAddresses?.svm || "";

  const totalPositionValue = positions
    ? positions.reduce((sum: number, p: any) => sum + parseFloat(p.size || "0") * parseFloat(p.currentPrice || "0"), 0)
    : 0;

  if (!isConnected) {
    return (
      <div className="min-h-screen">
        <div className="container py-16 max-w-lg text-center">
          <Wallet className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">Account</h1>
          <p className="text-sm text-muted-foreground mb-6">Connect your wallet to access your dashboard</p>
          <ConnectButton />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="container py-6 max-w-5xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Account</h1>
            <p className="text-xs font-mono text-muted-foreground mt-0.5">
              {address?.slice(0, 8)}…{address?.slice(-6)}
            </p>
          </div>
          <Link to="/settings/polymarket">
            <Button variant="outline" size="sm" className="gap-1.5">
              <Settings className="h-3.5 w-3.5" /> Settings
            </Button>
          </Link>
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="p-3">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Trading USDC.e</span>
            <p className="font-mono text-lg font-bold">${proxyUsdcE.toFixed(2)}</p>
          </Card>
          <Card className="p-3">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">My Wallet USDC.e</span>
            <p className="font-mono text-lg font-bold">${eoaUsdcE.toFixed(2)}</p>
          </Card>
          <Card className="p-3">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Positions</span>
            <p className="font-mono text-lg font-bold">{positions?.length ?? "—"}</p>
          </Card>
          <Card className="p-3">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Value</span>
            <p className="font-mono text-lg font-bold">${totalPositionValue.toFixed(2)}</p>
          </Card>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 overflow-x-auto border-b border-border">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => changeTab(id)}
              className={cn(
                "flex items-center gap-1.5 px-3 sm:px-4 py-2.5 text-xs sm:text-sm font-medium transition-all border-b-2 -mb-px whitespace-nowrap",
                tab === id
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>

        {/* ─── Balances Tab ───────────────────────────── */}
        {tab === "balances" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Balances</h2>
              <Button variant="outline" size="sm" onClick={refreshBalances} className="gap-1.5">
                <RefreshCw className="h-3.5 w-3.5" /> Refresh
              </Button>
            </div>

            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
              <p className="text-[10px] text-muted-foreground">
                Trading uses your <strong className="text-foreground">Trading Wallet (Safe/proxy)</strong>. Fund it with <strong className="text-foreground">USDC.e</strong> on Polygon.
              </p>
            </div>

            {balanceUpdated && (
              <p className="text-[10px] text-muted-foreground">Last updated: {balanceUpdated.toLocaleTimeString()}</p>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              {/* Trading Wallet USDC.e */}
              <Card className="border-primary/20">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center">
                      <DollarSign className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">Trading Wallet (USDC.e)</p>
                      <p className="text-[10px] text-muted-foreground">Safe/proxy — used for orders</p>
                    </div>
                  </div>
                  <p className="font-mono text-2xl font-bold">${proxyUsdcE.toFixed(2)}</p>
                  {proxyAddress && (
                    <p className="text-[9px] font-mono text-muted-foreground mt-1 break-all">{proxyAddress}</p>
                  )}
                </CardContent>
              </Card>

              {/* My Wallet USDC.e */}
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="h-8 w-8 rounded-full bg-accent flex items-center justify-center">
                      <Wallet className="h-4 w-4 text-accent-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">My Wallet (USDC.e)</p>
                      <p className="text-[10px] text-muted-foreground">Your connected wallet</p>
                    </div>
                  </div>
                  <p className="font-mono text-2xl font-bold">${eoaUsdcE.toFixed(2)}</p>
                  {eoaUsdc > 0 && (
                    <p className="text-[10px] text-muted-foreground mt-1">
                      + ${eoaUsdc.toFixed(2)} native USDC <span className="opacity-60">(not tradeable)</span>
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* POL */}
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="h-8 w-8 rounded-full bg-accent flex items-center justify-center">
                      <span className="text-xs font-bold text-accent-foreground">P</span>
                    </div>
                    <div>
                      <p className="text-sm font-semibold">POL (MATIC)</p>
                      <p className="text-[10px] text-muted-foreground">Gas token</p>
                    </div>
                  </div>
                  <p className="font-mono text-2xl font-bold">{maticFormatted}</p>
                </CardContent>
              </Card>
            </div>

            {/* Two-way transfer: Deposit / Withdraw */}
            {address && proxyAddress && (
              <WalletTransfer
                eoaAddress={address}
                safeAddress={proxyAddress}
                eoaBalance={eoaUsdcE}
                safeBalance={proxyUsdcE}
                polBalance={maticFormatted}
                onTransferComplete={refreshBalances}
              />
            )}

            {/* Convert USDC → USDC.e */}
            {eoaUsdc > 0 && eoaUsdcE === 0 && (
              <div className="rounded-md border border-warning/30 bg-warning/5 p-3 space-y-1.5">
                <p className="text-xs font-medium text-warning flex items-center gap-1">
                  <ArrowRightLeft className="h-3.5 w-3.5" />
                  You have ${eoaUsdc.toFixed(2)} native USDC but trading requires USDC.e
                </p>
                <a href={USDC_TO_USDC_E_SWAP_URL} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-md bg-primary text-primary-foreground px-3 py-1 text-[10px] font-semibold hover:bg-primary/90 transition-all">
                  Convert USDC → USDC.e <ExternalLink className="h-2.5 w-2.5" />
                </a>
              </div>
            )}

            <div className="flex gap-2">
              <Button onClick={() => changeTab("deposit")} className="gap-1.5">
                <ArrowDownToLine className="h-4 w-4" /> Deposit
              </Button>
              <Button variant="outline" onClick={() => changeTab("withdraw")} className="gap-1.5">
                <ArrowUpFromLine className="h-4 w-4" /> Withdraw
              </Button>
            </div>
          </div>
        )}

        {/* ─── Deposit Tab ────────────────────────────── */}
        {tab === "deposit" && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Fund Trading Wallet</h2>

            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
              <p className="text-[10px] text-muted-foreground">
                To trade, fund the <strong className="text-foreground">Trading Wallet</strong> address below with <strong className="text-foreground">USDC.e</strong> on Polygon.
              </p>
            </div>

            {/* PRIMARY: Trading Wallet address for USDC.e on Polygon */}
            {proxyAddress ? (
              <Card className="border-primary/20">
                <CardContent className="p-4 space-y-4">
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-5 w-5 text-primary" />
                    <div>
                      <p className="text-sm font-semibold">Deposit USDC.e (Polygon)</p>
                      <p className="text-[10px] text-muted-foreground">Send USDC.e to your Trading Wallet</p>
                    </div>
                  </div>

                  <div className="flex justify-center">
                    <div className="bg-white p-3 rounded-lg">
                      <QRCodeSVG value={proxyAddress} size={160} />
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-xs font-mono break-all bg-background rounded px-3 py-2 border border-border">
                      {proxyAddress}
                    </code>
                    <Button variant="outline" size="icon" onClick={() => copyAddress(proxyAddress)} className="shrink-0">
                      {copied ? <Check className="h-4 w-4 text-yes" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>

                  <p className="text-[9px] text-muted-foreground text-center">
                    USDC.e contract: <code className="font-mono">0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174</code>
                  </p>

                  <div className="text-center">
                    <p className="font-mono text-lg font-bold">${proxyUsdcE.toFixed(2)} <span className="text-xs text-muted-foreground font-normal">USDC.e</span></p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card className="border-warning/30 bg-warning/5">
                <CardContent className="p-4 text-center space-y-2">
                  <AlertCircle className="h-6 w-6 text-warning mx-auto" />
                  <p className="text-sm text-warning font-medium">Trading wallet not deployed</p>
                  <p className="text-[10px] text-muted-foreground">Complete the setup steps in the Trade page to deploy your Trading Wallet.</p>
                </CardContent>
              </Card>
            )}

            {/* Two-way transfer */}
            {address && proxyAddress && (
              <WalletTransfer
                eoaAddress={address}
                safeAddress={proxyAddress}
                eoaBalance={eoaUsdcE}
                safeBalance={proxyUsdcE}
                polBalance={maticFormatted}
                onTransferComplete={refreshBalances}
              />
            )}

            <Separator />

            {/* SECONDARY: Bridge deposit (other chains) */}
            <Collapsible>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="h-auto px-0 text-xs text-muted-foreground hover:text-foreground gap-1">
                  <Info className="h-3.5 w-3.5" /> Other chains / Bridge deposit <ChevronDown className="h-3 w-3" />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-3 space-y-3">
                <div className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
                  <p>Bridge deposits from other chains (Ethereum, Solana, Tron, Bitcoin) are converted to USDC.e automatically and credited to your Polymarket account.</p>
                  <p className="text-[10px]">Note: This uses a separate bridge address, not your Trading Wallet.</p>
                </div>
                {!depositAddresses && (
                  <Button onClick={handleDeposit} disabled={depositLoading} variant="outline" className="gap-1.5">
                    {depositLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Banknote className="h-4 w-4" />}
                    {depositLoading ? "Loading…" : "Get Bridge Deposit Address"}
                  </Button>
                )}
                {depositError && (
                  <Card className="border-destructive/30 bg-destructive/5">
                    <CardContent className="p-3">
                      <p className="text-xs text-destructive">{depositError.error}</p>
                    </CardContent>
                  </Card>
                )}
                {depositAddresses && (
                  <div className="space-y-3">
                    <DepositAddressCard addresses={depositAddresses} note={depositInfo?.note} />
                    <DepositStatusTracker address={trackingAddress} />
                  </div>
                )}
              </CollapsibleContent>
            </Collapsible>
          </div>
        )}

        {/* ─── Withdraw Tab ───────────────────────────── */}
        {tab === "withdraw" && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Withdraw</h2>
            <Card>
              <CardHeader className="pb-3">
                <CardDescription>
                  Withdraw funds from your Polymarket account via Bridge. Specify amount, destination, and chain.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">Amount (USDC)</label>
                  <Input type="number" placeholder="0.00" value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)} className="font-mono" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">Destination Address</label>
                  <Input placeholder="0x..." value={withdrawDest}
                    onChange={(e) => setWithdrawDest(e.target.value)} className="font-mono text-xs" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">Destination Chain</label>
                  <Select value={withdrawChain} onValueChange={setWithdrawChain}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="polygon">Polygon</SelectItem>
                      <SelectItem value="ethereum">Ethereum</SelectItem>
                      <SelectItem value="base">Base</SelectItem>
                      <SelectItem value="arbitrum">Arbitrum</SelectItem>
                      <SelectItem value="optimism">Optimism</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={handleWithdraw} disabled={withdrawLoading} className="w-full gap-1.5">
                  {withdrawLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUpFromLine className="h-4 w-4" />}
                  {withdrawLoading ? "Processing…" : "Withdraw"}
                </Button>
                {withdrawResult && (
                  <Card className="border-primary/30 bg-primary/5">
                    <CardContent className="p-3 space-y-2">
                      <p className="text-sm text-primary font-medium">Withdrawal initiated</p>
                      <pre className="text-[10px] text-muted-foreground whitespace-pre-wrap break-all">
                        {JSON.stringify(withdrawResult, null, 2)}
                      </pre>
                    </CardContent>
                  </Card>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* ─── Positions Tab ──────────────────────────── */}
        {tab === "positions" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Positions</h2>
              <Button variant="outline" size="sm" onClick={() => refetchPositions()} className="gap-1.5">
                <RefreshCw className="h-3.5 w-3.5" /> Refresh
              </Button>
            </div>

            {/* Winnings Banner */}
            {(() => {
              const winners = (positions || []).filter((p: any) => p.redeemable && p.isWinner);
              const totalWinnings = winners.reduce((sum: number, p: any) => sum + parseFloat(p.size || "0"), 0);
              if (winners.length === 0) return null;
              return (
                <Card className="border-yes/30 bg-yes/5 glow-yes">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-yes/20 flex items-center justify-center">
                          <PartyPopper className="h-5 w-5 text-yes" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-yes">You have winnings to collect!</p>
                          <p className="text-xs text-muted-foreground">
                            {winners.length} winning position{winners.length > 1 ? "s" : ""} · ${totalWinnings.toFixed(2)} USDC.e available
                          </p>
                        </div>
                      </div>
                      {winners.length === 1 ? (
                        <Button
                          size="sm"
                          className="bg-yes hover:bg-yes/90 text-yes-foreground gap-1.5"
                          onClick={() => handleClaimClick(winners[0])}
                        >
                          <Trophy className="h-3.5 w-3.5" /> Claim ${totalWinnings.toFixed(2)}
                        </Button>
                      ) : (
                        <div className="flex items-center gap-2">
                          {winners.map((w: any, i: number) => (
                            <Button
                              key={w.condition_id || i}
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs border-yes/30 text-yes hover:bg-yes/10"
                              onClick={() => handleClaimClick(w)}
                            >
                              Claim {w.outcome}
                            </Button>
                          ))}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })()}

            {posLoading && (
              <div className="flex justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            )}
            {posError && (
              <Card className="border-destructive/30 bg-destructive/5">
                <CardContent className="p-4 flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-destructive">Failed to load positions</p>
                    <p className="text-xs text-muted-foreground mt-1">{(posError as Error).message}</p>
                  </div>
                </CardContent>
              </Card>
            )}
            {positions && positions.length === 0 && (
              <div className="text-center py-12">
                <PieChart className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No open positions</p>
              </div>
            )}
            {positions && positions.length > 0 && (
              <div className="grid gap-3">
                {positions.map((pos: any, i: number) => (
                  <PositionCard key={pos.condition_id || i} position={pos} onSell={handleSellClick} onClaim={handleClaimClick} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ─── Orders Tab ─────────────────────────────── */}
        {tab === "orders" && (
          <OrdersPanel />
        )}

        {/* ─── Trades Tab ─────────────────────────────── */}
        {tab === "trades" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Trade History</h2>
              <Button variant="outline" size="sm" onClick={loadTrades} disabled={tradesLoading} className="gap-1.5">
                <RefreshCw className={cn("h-3.5 w-3.5", tradesLoading && "animate-spin")} /> Refresh
              </Button>
            </div>
            {tradesLoading && (
              <div className="flex justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            )}
            {!tradesLoading && trades.length === 0 && (
              <div className="text-center py-12">
                <History className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No trade history found</p>
              </div>
            )}
            {trades.length > 0 && (
              <div className="rounded-md border border-border overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="text-left p-2 font-medium text-muted-foreground">Time</th>
                      <th className="text-left p-2 font-medium text-muted-foreground">Side</th>
                      <th className="text-right p-2 font-medium text-muted-foreground">Price</th>
                      <th className="text-right p-2 font-medium text-muted-foreground">Size</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trades.slice(0, 50).map((t: any, i: number) => (
                      <tr key={t.id || i} className="border-b border-border/50 hover:bg-muted/20">
                        <td className="p-2 font-mono text-muted-foreground">
                          {t.timestamp ? new Date(t.timestamp).toLocaleString() : "—"}
                        </td>
                        <td className="p-2">
                          <span className={cn("font-semibold", t.side === "BUY" ? "text-primary" : "text-destructive")}>
                            {t.side || "—"}
                          </span>
                        </td>
                        <td className="p-2 text-right font-mono">{t.price ? `${(t.price * 100).toFixed(1)}¢` : "—"}</td>
                        <td className="p-2 text-right font-mono">{t.size?.toFixed(2) || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      <SellPositionModal
        open={sellModalOpen}
        onOpenChange={setSellModalOpen}
        position={sellPosition}
        onSellComplete={handleSellComplete}
      />

      <ClaimWinningsModal
        open={claimModalOpen}
        onOpenChange={setClaimModalOpen}
        position={claimPosition}
        onClaimComplete={handleClaimComplete}
      />
    </div>
  );
}
