import { useState } from "react";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  History as HistoryIcon,
  Loader2,
  RefreshCw,
  ExternalLink,
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  Receipt,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTransactionHistory, type HistoryFilter, type HistoryItem } from "@/hooks/useTransactionHistory";

const filterTabs: { id: HistoryFilter; label: string }[] = [
  { id: "ALL", label: "All" },
  { id: "TRADES", label: "Trades" },
  { id: "ORDERS", label: "Orders" },
  { id: "FEES", label: "Fees" },
];

function TypeBadge({ type }: { type: string }) {
  if (type === "BUY")
    return <Badge className="bg-primary/20 text-primary border-primary/30 text-[10px] h-5 gap-1"><ArrowDownRight className="h-3 w-3" />Buy</Badge>;
  if (type === "SELL")
    return <Badge className="bg-destructive/20 text-destructive border-destructive/30 text-[10px] h-5 gap-1"><ArrowUpRight className="h-3 w-3" />Sell</Badge>;
  if (type === "FEE")
    return <Badge className="bg-warning/20 text-warning border-warning/30 text-[10px] h-5 gap-1"><Receipt className="h-3 w-3" />Fee</Badge>;
  return <Badge variant="outline" className="text-[10px] h-5">{type}</Badge>;
}

function StatusBadge({ status }: { status: string }) {
  if (status === "Filled")
    return <Badge variant="outline" className="text-[10px] h-5 border-primary/30 text-primary">Filled</Badge>;
  if (status === "Cancelled")
    return <Badge variant="outline" className="text-[10px] h-5 border-muted-foreground/30 text-muted-foreground">Cancelled</Badge>;
  if (status === "Completed")
    return <Badge variant="outline" className="text-[10px] h-5 border-primary/30 text-primary">Completed</Badge>;
  return <Badge variant="outline" className="text-[10px] h-5">{status}</Badge>;
}

function formatTime(ts: string): string {
  if (!ts) return "—";
  const d = new Date(ts);
  if (isNaN(d.getTime())) {
    // try unix seconds
    const num = Number(ts);
    if (num > 0) {
      const ms = num < 1e12 ? num * 1000 : num;
      return new Date(ms).toLocaleString();
    }
    return "—";
  }
  return d.toLocaleString();
}

function relativeTime(ts: string): string {
  if (!ts) return "";
  let d = new Date(ts);
  if (isNaN(d.getTime())) {
    const num = Number(ts);
    if (num > 0) d = new Date(num < 1e12 ? num * 1000 : num);
    else return "";
  }
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
  return `${Math.floor(diff / 86400_000)}d ago`;
}

export default function History() {
  const { isConnected } = useAccount();
  const [filter, setFilter] = useState<HistoryFilter>("ALL");
  const { data, isLoading, error, refetch } = useTransactionHistory(filter);

  if (!isConnected) {
    return (
      <div className="min-h-screen">
        <div className="container py-16 max-w-lg text-center">
          <Wallet className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">Transaction History</h1>
          <p className="text-sm text-muted-foreground mb-6">Connect your wallet to view your history</p>
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
            <h1 className="text-2xl font-bold">Transaction History</h1>
            <p className="text-xs text-muted-foreground mt-0.5">All your trades, orders, and fee payments</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading} className="gap-1.5">
            <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} /> Refresh
          </Button>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1 border-b border-border">
          {filterTabs.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setFilter(id)}
              className={cn(
                "px-4 py-2.5 text-sm font-medium transition-all border-b-2 -mb-px",
                filter === id
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Error */}
        {error && (
          <Card className="border-destructive/30 bg-destructive/5">
            <CardContent className="p-4 flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-destructive">Failed to load history</p>
                <p className="text-xs text-muted-foreground mt-1">{(error as Error).message}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Empty */}
        {!isLoading && !error && data?.history.length === 0 && (
          <div className="text-center py-12">
            <HistoryIcon className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No transactions found</p>
          </div>
        )}

        {/* Table */}
        {data && data.history.length > 0 && (
          <div className="rounded-md border border-border overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left p-2.5 font-medium text-muted-foreground">Type</th>
                  <th className="text-left p-2.5 font-medium text-muted-foreground">Market</th>
                  <th className="text-right p-2.5 font-medium text-muted-foreground">Price</th>
                  <th className="text-right p-2.5 font-medium text-muted-foreground">Size</th>
                  <th className="text-right p-2.5 font-medium text-muted-foreground">Total</th>
                  <th className="text-center p-2.5 font-medium text-muted-foreground">Status</th>
                  <th className="text-right p-2.5 font-medium text-muted-foreground">Time</th>
                  <th className="text-center p-2.5 font-medium text-muted-foreground">Links</th>
                </tr>
              </thead>
              <tbody>
                {data.history.map((item: HistoryItem, i: number) => (
                  <tr key={`${item.source}-${item.order_id || item.tx_hash || i}`} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                    <td className="p-2.5">
                      <TypeBadge type={item.type} />
                    </td>
                    <td className="p-2.5 max-w-[200px]">
                      {item.condition_id ? (
                        <Link to={`/trade/${item.condition_id}`} className="text-foreground hover:text-primary transition-colors truncate block">
                          {item.market || item.condition_id.slice(0, 12) + "…"}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">{item.type === "FEE" ? "Platform Fee" : "—"}</span>
                      )}
                    </td>
                    <td className="p-2.5 text-right font-mono">
                      {item.type !== "FEE" && item.price > 0 ? `${(item.price * 100).toFixed(1)}¢` : "—"}
                    </td>
                    <td className="p-2.5 text-right font-mono">
                      {item.size > 0 ? (item.type === "FEE" ? `$${item.size.toFixed(4)}` : item.size.toFixed(2)) : "—"}
                    </td>
                    <td className="p-2.5 text-right font-mono font-semibold">
                      {item.total > 0 ? `$${item.total.toFixed(2)}` : "—"}
                    </td>
                    <td className="p-2.5 text-center">
                      <StatusBadge status={item.status} />
                    </td>
                    <td className="p-2.5 text-right text-muted-foreground" title={formatTime(item.timestamp)}>
                      {relativeTime(item.timestamp)}
                    </td>
                    <td className="p-2.5 text-center">
                      {item.tx_hash && (
                        <a
                          href={`https://polygonscan.com/tx/${item.tx_hash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex text-muted-foreground hover:text-primary transition-colors"
                          title="View on Polygonscan"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Summary */}
        {data && data.total > 0 && (
          <p className="text-[10px] text-muted-foreground text-center">
            Showing {data.history.length} of {data.total} transactions • Trading address: <code className="font-mono">{data.address?.slice(0, 8)}…{data.address?.slice(-6)}</code>
          </p>
        )}
      </div>
    </div>
  );
}
