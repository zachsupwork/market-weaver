import { useState, useMemo } from "react";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Link } from "react-router-dom";
import {
  Bot,
  Scan,
  Zap,
  TrendingUp,
  Settings,
  Activity,
  DollarSign,
  Target,
  BarChart3,
  AlertTriangle,
  Clock,
  ArrowUpRight,
  Loader2,
  Percent,
  Shield,
  Eye,
  XCircle,
  Database,
  Globe,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/** Build internal PolyView link for a bot opportunity or trade */
function botMarketHref(item: { event_slug?: string | null; condition_id: string }): string {
  if (item.event_slug) return `/events/${item.event_slug}?market=${encodeURIComponent(item.condition_id)}`;
  return `/trade/${encodeURIComponent(item.condition_id)}`;
}

function BotLink({ item, className, children }: { item: { event_slug?: string | null; condition_id: string }; className?: string; children: React.ReactNode }) {
  return <Link to={botMarketHref(item)} className={className}>{children}</Link>;
}
import {
  useBotConfig,
  useBotOpportunities,
  useBotTrades,
  useBotScanner,
  useBotExecutor,
  useBotMonitor,
  type BotOpportunity,
  type BotTrade,
} from "@/hooks/useBot";
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
} from "recharts";

const ALL_CATEGORIES = ["Sports", "Politics", "Crypto", "Finance", "Pop Culture", "General"];

export default function BotDashboard() {
  const { address, isConnected } = useAccount();
  const { config, isLoading: configLoading, upsertConfig } = useBotConfig(address);
  const { data: opportunities = [] } = useBotOpportunities(address);
  const { data: trades = [], isLoading: tradesLoading } = useBotTrades(address);
  const { scan, isScanning } = useBotScanner(address);
  const { execute, isExecuting } = useBotExecutor(address);
  const { monitor, isMonitoring } = useBotMonitor(address);
  const [activeTab, setActiveTab] = useState("overview");

  // Computed stats
  const stats = useMemo(() => {
    const totalTrades = trades.length;
    const simulatedTrades = trades.filter((t) => t.simulation);
    const realTrades = trades.filter((t) => !t.simulation);
    const winningTrades = trades.filter((t) => (t.pnl || 0) > 0);
    const totalPnl = trades.reduce((sum, t) => sum + (t.pnl || 0), 0);
    const pendingOpps = opportunities.filter((o) => o.status === "pending" && !o.executed);
    const avgEdge =
      pendingOpps.length > 0
        ? pendingOpps.reduce((sum, o) => sum + o.edge, 0) / pendingOpps.length
        : 0;

    return {
      totalTrades,
      simulatedCount: simulatedTrades.length,
      realCount: realTrades.length,
      winRate: totalTrades > 0 ? (winningTrades.length / totalTrades) * 100 : 0,
      totalPnl,
      pendingOpps: pendingOpps.length,
      avgEdge,
    };
  }, [trades, opportunities]);

  const openPositions = useMemo(() => {
    return trades.filter((t) => t.status === "executed" && !t.exited && !t.simulation);
  }, [trades]);

  const pnlChartData = useMemo(() => {
    if (trades.length === 0) return [];
    const sorted = [...trades].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    let cumPnl = 0;
    return sorted.map((t) => {
      cumPnl += t.pnl || 0;
      return {
        date: new Date(t.created_at).toLocaleDateString(),
        pnl: cumPnl,
        trade: t.question.substring(0, 30),
      };
    });
  }, [trades]);

  const handleScan = async () => {
    try {
      const result = await scan();
      if (result) {
        toast.success(`Scanned ${result.scanned} markets, found ${result.opportunities_found} opportunities`);
      }
    } catch (err: any) {
      toast.error(err.message || "Scan failed");
    }
  };

  const handleExecute = async () => {
    try {
      const result = await execute();
      if (result) {
        toast.success(
          `${result.trades_created} trades ${result.simulation ? "simulated" : "created"}`
        );
      }
    } catch (err: any) {
      toast.error(err.message || "Execution failed");
    }
  };

  const handleMonitor = async () => {
    try {
      const result = await monitor();
      if (result) {
        toast.success(`Monitored ${result.processed} positions, exited ${result.exited}`);
      }
    } catch (err: any) {
      toast.error(err.message || "Monitor failed");
    }
  };

  const handleToggleBot = async (enabled: boolean) => {
    try {
      await upsertConfig.mutateAsync({ enabled });
      toast.success(enabled ? "Bot enabled" : "Bot paused");
    } catch (err: any) {
      toast.error(err.message || "Failed to update config");
    }
  };

  const handleToggleSimulation = async (simulation_mode: boolean) => {
    try {
      await upsertConfig.mutateAsync({ simulation_mode });
      toast.success(simulation_mode ? "Simulation mode ON" : "⚠️ LIVE trading mode ON");
    } catch (err: any) {
      toast.error(err.message || "Failed to update config");
    }
  };

  const handleEdgeChange = async (val: number[]) => {
    try { await upsertConfig.mutateAsync({ min_edge: val[0] / 100 }); } catch {}
  };

  const handleMaxBetChange = async (val: number[]) => {
    try { await upsertConfig.mutateAsync({ max_bet_percent: val[0] / 100 }); } catch {}
  };

  const handleCategoryToggle = async (category: string, checked: boolean) => {
    const current = config?.enabled_categories || ALL_CATEGORIES;
    const next = checked ? [...current, category] : current.filter((c) => c !== category);
    try { await upsertConfig.mutateAsync({ enabled_categories: next }); } catch {}
  };

  const handleNumericSetting = async (field: string, value: number) => {
    try { await upsertConfig.mutateAsync({ [field]: value } as any); } catch {}
  };

  if (!isConnected) {
    return (
      <div className="container max-w-7xl mx-auto p-4 pt-20">
        <Card className="max-w-md mx-auto text-center">
          <CardHeader>
            <Bot className="h-12 w-12 text-primary mx-auto mb-2" />
            <CardTitle>AI Trading Bot</CardTitle>
            <CardDescription>Connect your wallet to access the AI-powered trading bot</CardDescription>
          </CardHeader>
          <CardContent>
            <ConnectButton />
          </CardContent>
        </Card>
      </div>
    );
  }

  const pendingOpps = opportunities.filter((o) => o.status === "pending" && !o.executed);
  const executedOpps = opportunities.filter((o) => o.executed);

  return (
    <div className="container max-w-7xl mx-auto px-3 sm:px-4 pt-20 space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Bot className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">AI Trading Bot</h1>
            <p className="text-sm text-muted-foreground">
              Autonomous prediction market analysis & trading
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant={config?.enabled ? "default" : "secondary"} className={cn("text-xs", config?.enabled && "bg-yes text-yes-foreground")}>
            {config?.enabled ? "Active" : "Paused"}
          </Badge>
          {config?.simulation_mode !== false && (
            <Badge variant="outline" className="text-xs border-warning text-warning">
              <Shield className="h-3 w-3 mr-1" />
              Simulation
            </Badge>
          )}
          {openPositions.length > 0 && (
            <Badge variant="outline" className="text-xs border-primary text-primary">
              <Eye className="h-3 w-3 mr-1" />
              {openPositions.length} Open
            </Badge>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
        <Card>
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-1.5 text-muted-foreground text-xs mb-1">
              <Target className="h-3 w-3 sm:h-3.5 sm:w-3.5 shrink-0" />
              <span className="truncate">Opportunities</span>
            </div>
            <p className="text-xl sm:text-2xl font-bold font-mono">{stats.pendingOpps}</p>
            <p className="text-xs text-muted-foreground truncate">avg edge {(stats.avgEdge * 100).toFixed(1)}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <Activity className="h-3.5 w-3.5" />
              Total Trades
            </div>
            <p className="text-2xl font-bold font-mono">{stats.totalTrades}</p>
            <p className="text-xs text-muted-foreground">{stats.simulatedCount} sim / {stats.realCount} real</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <Eye className="h-3.5 w-3.5" />
              Open Positions
            </div>
            <p className="text-2xl font-bold font-mono">{openPositions.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <Percent className="h-3.5 w-3.5" />
              Win Rate
            </div>
            <p className="text-2xl font-bold font-mono">{stats.winRate.toFixed(1)}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <DollarSign className="h-3.5 w-3.5" />
              Total P&L
            </div>
            <p className={cn("text-2xl font-bold font-mono", stats.totalPnl > 0 && "text-yes", stats.totalPnl < 0 && "text-no")}>
              {stats.totalPnl >= 0 ? "+" : ""}${stats.totalPnl.toFixed(2)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full justify-start overflow-x-auto flex-nowrap no-scrollbar">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="opportunities">Opportunities ({pendingOpps.length})</TabsTrigger>
          <TabsTrigger value="positions">Open Positions ({openPositions.length})</TabsTrigger>
          <TabsTrigger value="trades">Trade History</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        {/* ── Overview Tab ─────────────────────────── */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Bot Controls</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label>Bot Enabled</Label>
                  <Switch checked={config?.enabled || false} onCheckedChange={handleToggleBot} disabled={upsertConfig.isPending} />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-warning" />
                    Simulation Mode
                  </Label>
                  <Switch checked={config?.simulation_mode !== false} onCheckedChange={handleToggleSimulation} disabled={upsertConfig.isPending} />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Button onClick={handleScan} disabled={isScanning || !config?.enabled} variant="outline" size="sm">
                    {isScanning ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Scan className="h-4 w-4 mr-1" />}
                    Scan
                  </Button>
                  <Button onClick={handleExecute} disabled={isExecuting || pendingOpps.length === 0} size="sm">
                    {isExecuting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Zap className="h-4 w-4 mr-1" />}
                    Execute
                  </Button>
                  <Button onClick={handleMonitor} disabled={isMonitoring || openPositions.length === 0} variant="outline" size="sm">
                    {isMonitoring ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Eye className="h-4 w-4 mr-1" />}
                    Monitor
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Latest Opportunities</CardTitle>
              </CardHeader>
              <CardContent>
                {pendingOpps.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No opportunities found. Click "Scan" to search.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {pendingOpps.slice(0, 5).map((opp) => (
                      <OpportunityRow key={opp.id} opp={opp} />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {pnlChartData.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Cumulative P&L</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={pnlChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                      <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => `$${v}`} />
                      <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: 12 }} />
                      <Area type="monotone" dataKey="pnl" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.1)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="opportunities" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Market Opportunities</h2>
            <Button onClick={handleScan} disabled={isScanning || !config?.enabled} size="sm">
              {isScanning ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Scan className="h-4 w-4 mr-2" />}
              Scan Now
            </Button>
          </div>

          {pendingOpps.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Target className="h-10 w-10 mx-auto mb-3 opacity-50" />
                <p>No pending opportunities. Run a scan to analyze markets.</p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Desktop table */}
              <Card className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Market</TableHead>
                      <TableHead className="text-right">AI Prob</TableHead>
                      <TableHead className="text-right">Market</TableHead>
                      <TableHead className="text-right">Edge</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingOpps.map((opp) => (
                      <TableRow key={opp.id}>
                        <TableCell className="max-w-[200px]">
                          <BotLink item={opp} className="text-sm hover:text-primary truncate block">
                            {opp.question.length > 60 ? opp.question.substring(0, 60) + "…" : opp.question}
                          </BotLink>
                          {opp.ai_reasoning && (
                            <p className="text-xs text-muted-foreground mt-0.5 truncate">{opp.ai_reasoning.substring(0, 80)}…</p>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">{(opp.ai_probability * 100).toFixed(1)}%</TableCell>
                        <TableCell className="text-right font-mono text-sm">{(opp.market_price * 100).toFixed(1)}%</TableCell>
                        <TableCell className="text-right">
                          <Badge variant="outline" className={cn("font-mono", opp.edge >= 0.1 ? "border-yes text-yes" : "border-warning text-warning")}>
                            +{(opp.edge * 100).toFixed(1)}%
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-xs">{opp.category || "General"}</Badge>
                        </TableCell>
                        <TableCell>
                          {opp.external_data ? (
                            <Badge variant="outline" className="text-xs border-primary/50 text-primary">
                              <Globe className="h-3 w-3 mr-1" />
                              Yes
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="ghost" asChild>
                            <BotLink item={opp}><ArrowUpRight className="h-4 w-4" /></BotLink>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>

              {/* Mobile cards */}
              <div className="md:hidden space-y-2">
                {pendingOpps.map((opp) => (
                  <Card key={opp.id} className="p-3">
                    <BotLink item={opp} className="text-sm font-medium hover:text-primary break-words leading-snug">
                      {opp.question}
                    </BotLink>
                    {opp.ai_reasoning && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{opp.ai_reasoning}</p>
                    )}
                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                      <Badge variant="secondary" className="text-xs">{opp.category || "General"}</Badge>
                      {opp.external_data && (
                        <Badge variant="outline" className="text-xs border-primary/50 text-primary">
                          <Globe className="h-2.5 w-2.5 mr-0.5" />Ext
                        </Badge>
                      )}
                      <Badge variant="outline" className={cn("font-mono text-xs ml-auto", opp.edge >= 0.1 ? "border-yes text-yes" : "border-warning text-warning")}>
                        +{(opp.edge * 100).toFixed(1)}%
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
                      <span>AI: <span className="font-mono text-foreground">{(opp.ai_probability * 100).toFixed(1)}%</span></span>
                      <span>Mkt: <span className="font-mono text-foreground">{(opp.market_price * 100).toFixed(1)}%</span></span>
                      <Button size="sm" variant="ghost" className="h-7 px-2" asChild>
                        <BotLink item={opp}><ArrowUpRight className="h-3.5 w-3.5" /></BotLink>
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            </>
          )}

          {executedOpps.length > 0 && (
            <>
              <h3 className="text-sm font-medium text-muted-foreground mt-6">Previously Executed ({executedOpps.length})</h3>
              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Market</TableHead>
                      <TableHead className="text-right">Edge</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {executedOpps.slice(0, 20).map((opp) => (
                      <TableRow key={opp.id} className="opacity-60">
                        <TableCell className="text-sm truncate max-w-[250px]">{opp.question}</TableCell>
                        <TableCell className="text-right font-mono text-sm">+{(opp.edge * 100).toFixed(1)}%</TableCell>
                        <TableCell><Badge variant="secondary" className="text-xs">{opp.status}</Badge></TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">{new Date(opp.created_at).toLocaleDateString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            </>
          )}
        </TabsContent>

        {/* ── Open Positions Tab ───────────────────── */}
        <TabsContent value="positions" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Open Positions</h2>
            <Button onClick={handleMonitor} disabled={isMonitoring || openPositions.length === 0} size="sm" variant="outline">
              {isMonitoring ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Eye className="h-4 w-4 mr-2" />}
              Check Exits
            </Button>
          </div>

          {openPositions.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Eye className="h-10 w-10 mx-auto mb-3 opacity-50" />
                <p>No open positions. Execute trades to create positions.</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Market</TableHead>
                    <TableHead>Side</TableHead>
                    <TableHead className="text-right">Size</TableHead>
                    <TableHead className="text-right">Entry</TableHead>
                    <TableHead className="text-right">Current</TableHead>
                    <TableHead className="text-right">P&L</TableHead>
                    <TableHead className="text-right">TP / SL</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {openPositions.map((trade) => {
                    const currentPrice = trade.current_price || trade.entry_price;
                    const pnlPct = ((currentPrice - trade.entry_price) / trade.entry_price) * 100;
                    const tp = config?.take_profit_percent || 20;
                    const sl = config?.stop_loss_percent || 10;
                    return (
                      <TableRow key={trade.id}>
                        <TableCell className="max-w-[200px]">
                          <BotLink item={trade} className="text-sm hover:text-primary truncate block">
                            {trade.question.length > 50 ? trade.question.substring(0, 50) + "…" : trade.question}
                          </BotLink>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn("text-xs", trade.side === "BUY" ? "border-yes text-yes" : "border-no text-no")}>
                            {trade.side} {trade.outcome}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">${trade.size.toFixed(2)}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{(trade.entry_price * 100).toFixed(0)}¢</TableCell>
                        <TableCell className="text-right font-mono text-sm">{(currentPrice * 100).toFixed(0)}¢</TableCell>
                        <TableCell className={cn("text-right font-mono text-sm", pnlPct > 0 && "text-yes", pnlPct < 0 && "text-no")}>
                          {pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(1)}%
                        </TableCell>
                        <TableCell className="text-right text-xs font-mono">
                          <span className="text-yes">+{tp}%</span> / <span className="text-no">-{sl}%</span>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-xs">Active</Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>
          )}

          {/* Closed positions */}
          {(() => {
            const closed = trades.filter((t) => t.exited);
            if (closed.length === 0) return null;
            return (
              <>
                <h3 className="text-sm font-medium text-muted-foreground mt-6">Closed Positions ({closed.length})</h3>
                <Card>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Market</TableHead>
                        <TableHead className="text-right">Entry</TableHead>
                        <TableHead className="text-right">Exit</TableHead>
                        <TableHead className="text-right">P&L</TableHead>
                        <TableHead>Reason</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {closed.slice(0, 20).map((t) => (
                        <TableRow key={t.id}>
                          <TableCell className="text-sm truncate max-w-[200px]">{t.question}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{(t.entry_price * 100).toFixed(0)}¢</TableCell>
                          <TableCell className="text-right font-mono text-sm">{((t.exit_price || 0) * 100).toFixed(0)}¢</TableCell>
                          <TableCell className={cn("text-right font-mono text-sm", (t.pnl || 0) > 0 && "text-yes", (t.pnl || 0) < 0 && "text-no")}>
                            {(t.pnl || 0) >= 0 ? "+" : ""}${(t.pnl || 0).toFixed(2)}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">{t.exit_reason || "manual"}</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Card>
              </>
            );
          })()}
        </TabsContent>

        {/* ── Trade History Tab ────────────────────── */}
        <TabsContent value="trades" className="space-y-4">
          <h2 className="text-lg font-semibold">Trade History</h2>
          {tradesLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : trades.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <BarChart3 className="h-10 w-10 mx-auto mb-3 opacity-50" />
                <p>No bot trades yet. Scan for opportunities and execute.</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Market</TableHead>
                    <TableHead>Side</TableHead>
                    <TableHead className="text-right">Size</TableHead>
                    <TableHead className="text-right">Entry</TableHead>
                    <TableHead className="text-right">Exit</TableHead>
                    <TableHead className="text-right">P&L</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {trades.map((trade) => (
                    <TableRow key={trade.id}>
                      <TableCell className="max-w-[200px]">
                        <BotLink item={trade} className="text-sm hover:text-primary truncate block">
                          {trade.question.length > 50 ? trade.question.substring(0, 50) + "…" : trade.question}
                        </BotLink>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn("text-xs", trade.side === "BUY" ? "border-yes text-yes" : "border-no text-no")}>
                          {trade.side} {trade.outcome}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">${trade.size.toFixed(2)}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{(trade.entry_price * 100).toFixed(0)}¢</TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {trade.exit_price ? `${(trade.exit_price * 100).toFixed(0)}¢` : "—"}
                      </TableCell>
                      <TableCell className={cn("text-right font-mono text-sm", (trade.pnl || 0) > 0 && "text-yes", (trade.pnl || 0) < 0 && "text-no")}>
                        {(trade.pnl || 0) >= 0 ? "+" : ""}${(trade.pnl || 0).toFixed(2)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={cn("text-xs", trade.simulation && "border-warning text-warning")}>
                          {trade.simulation ? "SIM" : trade.exited ? "Closed" : trade.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        {new Date(trade.created_at).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>

        {/* ── Performance Tab ──────────────────────── */}
        <TabsContent value="performance" className="space-y-4">
          <h2 className="text-lg font-semibold">Performance Analytics</h2>
          <div className="grid md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-xs text-muted-foreground mb-1">Total Trades</p>
                <p className="text-3xl font-bold font-mono">{stats.totalTrades}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-xs text-muted-foreground mb-1">Win Rate</p>
                <p className="text-3xl font-bold font-mono">{stats.winRate.toFixed(1)}%</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-xs text-muted-foreground mb-1">Total P&L</p>
                <p className={cn("text-3xl font-bold font-mono", stats.totalPnl > 0 && "text-yes", stats.totalPnl < 0 && "text-no")}>
                  ${stats.totalPnl.toFixed(2)}
                </p>
              </CardContent>
            </Card>
          </div>
          {pnlChartData.length > 1 ? (
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-lg">Cumulative P&L</CardTitle></CardHeader>
              <CardContent>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={pnlChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                      <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => `$${v}`} />
                      <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: 12 }} />
                      <Area type="monotone" dataKey="pnl" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.15)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <BarChart3 className="h-10 w-10 mx-auto mb-3 opacity-50" />
                <p>Not enough trade data for performance charts yet.</p>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-lg">By Category</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {ALL_CATEGORIES.map((cat) => {
                  const catTrades = trades.filter(
                    (t) => opportunities.find((o) => o.id === t.opportunity_id)?.category === cat
                  );
                  const catPnl = catTrades.reduce((s, t) => s + (t.pnl || 0), 0);
                  return (
                    <div key={cat} className="p-3 rounded-lg bg-secondary/50 text-center">
                      <p className="text-xs text-muted-foreground">{cat}</p>
                      <p className="font-mono font-semibold">{catTrades.length} trades</p>
                      <p className={cn("text-xs font-mono", catPnl > 0 && "text-yes", catPnl < 0 && "text-no")}>
                        {catPnl >= 0 ? "+" : ""}${catPnl.toFixed(2)}
                      </p>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Settings Tab ─────────────────────────── */}
        <TabsContent value="settings" className="space-y-4">
          <h2 className="text-lg font-semibold">Bot Settings</h2>
          <div className="grid md:grid-cols-2 gap-4">
            {/* Trading Parameters */}
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-lg">Trading Parameters</CardTitle></CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <Label>Bot Active</Label>
                  <Switch checked={config?.enabled || false} onCheckedChange={handleToggleBot} />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-2"><Shield className="h-4 w-4 text-warning" />Simulation Mode</Label>
                    <Switch checked={config?.simulation_mode !== false} onCheckedChange={handleToggleSimulation} />
                  </div>
                  <p className="text-xs text-muted-foreground">When on, trades are logged but not executed on-chain</p>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Minimum Edge</Label>
                    <span className="font-mono text-sm">{((config?.min_edge || 0.05) * 100).toFixed(0)}%</span>
                  </div>
                  <Slider value={[(config?.min_edge || 0.05) * 100]} onValueCommit={handleEdgeChange} min={1} max={30} step={1} />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Max Bet Size</Label>
                    <span className="font-mono text-sm">{((config?.max_bet_percent || 0.05) * 100).toFixed(0)}% of bankroll</span>
                  </div>
                  <Slider value={[(config?.max_bet_percent || 0.05) * 100]} onValueCommit={handleMaxBetChange} min={1} max={25} step={1} />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-2"><Database className="h-4 w-4" />Max Markets to Scan</Label>
                    <Input
                      type="number"
                      className="w-24 text-right"
                      value={config?.max_markets_to_scan || 200}
                      onChange={(e) => handleNumericSetting("max_markets_to_scan", parseInt(e.target.value) || 200)}
                      min={20}
                      max={1000}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">Number of markets to analyze per scan (sorted by volume)</p>
                </div>
              </CardContent>
            </Card>

            {/* Exit Strategies */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2"><TrendingUp className="h-5 w-5" />Exit Strategies</CardTitle>
                <CardDescription>Configure automatic position closing rules</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-yes">Take Profit</Label>
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        className="w-20 text-right"
                        value={config?.take_profit_percent || 20}
                        onChange={(e) => handleNumericSetting("take_profit_percent", parseFloat(e.target.value) || 20)}
                        min={1}
                        max={500}
                      />
                      <span className="text-sm text-muted-foreground">%</span>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">Close position when profit reaches this percentage</p>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-no">Stop Loss</Label>
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        className="w-20 text-right"
                        value={config?.stop_loss_percent || 10}
                        onChange={(e) => handleNumericSetting("stop_loss_percent", parseFloat(e.target.value) || 10)}
                        min={1}
                        max={100}
                      />
                      <span className="text-sm text-muted-foreground">%</span>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">Close position when loss reaches this percentage</p>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-2"><Clock className="h-4 w-4" />Exit Before Resolution</Label>
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        className="w-20 text-right"
                        value={config?.exit_before_resolution_hours || 0}
                        onChange={(e) => handleNumericSetting("exit_before_resolution_hours", parseFloat(e.target.value) || 0)}
                        min={0}
                        max={168}
                      />
                      <span className="text-sm text-muted-foreground">hrs</span>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">Close position X hours before market resolves (0 = disabled)</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Categories */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Enabled Categories</CardTitle>
              <CardDescription>Select which market categories the bot should analyze</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {ALL_CATEGORIES.map((cat) => {
                  const isChecked = (config?.enabled_categories || ALL_CATEGORIES).includes(cat);
                  return (
                    <div key={cat} className="flex items-center gap-3">
                      <Checkbox id={`cat-${cat}`} checked={isChecked} onCheckedChange={(checked) => handleCategoryToggle(cat, checked === true)} />
                      <Label htmlFor={`cat-${cat}`} className="cursor-pointer">{cat}</Label>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Risk Warning */}
          <Card className="border-destructive/30">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg text-destructive flex items-center gap-2"><AlertTriangle className="h-5 w-5" />Risk Warning</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Automated trading carries significant risk. AI predictions are probabilistic estimates and can be wrong.
                Past performance does not guarantee future results. Always start with simulation mode and only enable
                real trading with funds you can afford to lose. The bot uses Kelly Criterion for position sizing,
                but market conditions can change rapidly.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function OpportunityRow({ opp }: { opp: BotOpportunity }) {
  return (
    <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors">
      <div className="min-w-0 flex-1">
        <BotLink item={opp} className="text-sm hover:text-primary truncate block">
          {opp.question.length > 50 ? opp.question.substring(0, 50) + "…" : opp.question}
        </BotLink>
        <div className="flex items-center gap-2 mt-0.5">
          <Badge variant="secondary" className="text-xs">{opp.category || "General"}</Badge>
          {opp.external_data && (
            <Badge variant="outline" className="text-xs border-primary/50 text-primary">
              <Globe className="h-2.5 w-2.5 mr-0.5" />
              Ext
            </Badge>
          )}
        </div>
      </div>
      <Badge variant="outline" className={cn("font-mono text-xs shrink-0", opp.edge >= 0.1 ? "border-yes text-yes" : "border-warning text-warning")}>
        +{(opp.edge * 100).toFixed(1)}%
      </Badge>
    </div>
  );
}
