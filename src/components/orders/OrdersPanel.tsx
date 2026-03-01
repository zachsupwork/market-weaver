import { useState } from "react";
import { useOrders, type OrderFilter, type PolymarketOrder } from "@/hooks/useOrders";
import { cn } from "@/lib/utils";
import {
  Loader2, RefreshCw, X, Search, ClipboardList,
  AlertCircle, Filter, ChevronDown, ChevronUp,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from "react";

const STATUS_COLORS: Record<string, string> = {
  LIVE: "border-yes/40 bg-yes/10 text-yes",
  MATCHED: "border-primary/40 bg-primary/10 text-primary",
  CANCELLED: "border-muted-foreground/40 bg-muted text-muted-foreground",
  DELAYED: "border-warning/40 bg-warning/10 text-warning",
  UNMATCHED: "border-no/40 bg-no/10 text-no",
};

const FILTERS: { id: OrderFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "live", label: "Open" },
  { id: "matched", label: "Filled" },
  { id: "cancelled", label: "Cancelled" },
];

export function OrdersPanel() {
  const { isConnected } = useAccount();
  const [hasSession, setHasSession] = useState(false);
  const [filter, setFilter] = useState<OrderFilter>("all");
  const [search, setSearch] = useState("");
  const [cancelTarget, setCancelTarget] = useState<PolymarketOrder | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setHasSession(!!data.session));
  }, []);

  const enabled = isConnected && hasSession;
  const { orders, isLoading, error, refetch, cancelOrder, isCancelling, cancellingId } = useOrders(enabled);

  const filtered = orders.filter((o) => {
    if (filter === "live") return o.status === "LIVE";
    if (filter === "matched") return o.status === "MATCHED";
    if (filter === "cancelled") return o.status === "CANCELLED";
    return true;
  }).filter((o) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      o.market.toLowerCase().includes(q) ||
      o.asset_id.toLowerCase().includes(q) ||
      o.id.toLowerCase().includes(q) ||
      o.side.toLowerCase().includes(q)
    );
  });

  const liveCount = orders.filter((o) => o.status === "LIVE").length;

  if (!isConnected) {
    return (
      <div className="text-center py-16">
        <ClipboardList className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <p className="text-sm text-muted-foreground mb-4">Connect your wallet to view orders</p>
        <ConnectButton />
      </div>
    );
  }

  if (!hasSession) {
    return (
      <div className="text-center py-16">
        <ClipboardList className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <p className="text-sm text-muted-foreground">Sign in to view your orders</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">Orders</h2>
          {liveCount > 0 && (
            <Badge variant="default" className="text-xs">{liveCount} open</Badge>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isLoading}>
          <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
        </Button>
      </div>

      {/* Filters + Search */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="flex gap-1">
          {FILTERS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setFilter(id)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                filter === id
                  ? "bg-primary/20 text-primary border border-primary/40"
                  : "bg-muted text-muted-foreground border border-transparent hover:bg-accent"
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by market, token, or ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-md border border-border bg-card pl-8 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-destructive">Failed to load orders</p>
            <p className="text-xs text-muted-foreground mt-1">{(error as Error).message}</p>
          </div>
        </div>
      )}

      {/* Empty */}
      {!isLoading && !error && filtered.length === 0 && (
        <div className="text-center py-16">
          <ClipboardList className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            {orders.length === 0
              ? "No orders yet. Place your first trade!"
              : "No orders match your filters."}
          </p>
        </div>
      )}

      {/* Orders list */}
      {!isLoading && filtered.length > 0 && (
        <div className="space-y-2">
          {filtered.map((order) => (
            <OrderRow
              key={order.id}
              order={order}
              expanded={expandedId === order.id}
              onToggle={() => setExpandedId(expandedId === order.id ? null : order.id)}
              onCancel={() => setCancelTarget(order)}
              isCancelling={isCancelling && cancellingId === order.id}
            />
          ))}
        </div>
      )}

      {/* Cancel confirmation dialog */}
      <Dialog open={!!cancelTarget} onOpenChange={(open) => !open && setCancelTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Order</DialogTitle>
            <DialogDescription>
              Are you sure you want to cancel this {cancelTarget?.side} order for{" "}
              {cancelTarget?.original_size} shares at ${cancelTarget?.price}?
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border border-border bg-muted p-3 text-xs space-y-1 font-mono">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Order ID</span>
              <span className="text-foreground truncate max-w-[200px]">{cancelTarget?.id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Side</span>
              <span className={cancelTarget?.side === "BUY" ? "text-yes" : "text-no"}>{cancelTarget?.side}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Price</span>
              <span>${cancelTarget?.price}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Size</span>
              <span>{cancelTarget?.original_size} shares</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCancelTarget(null)}>Keep Order</Button>
            <Button
              variant="destructive"
              disabled={isCancelling}
              onClick={async () => {
                if (!cancelTarget) return;
                await cancelOrder(cancelTarget.id);
                setCancelTarget(null);
              }}
            >
              {isCancelling ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <X className="h-4 w-4 mr-1" />}
              Cancel Order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function OrderRow({
  order,
  expanded,
  onToggle,
  onCancel,
  isCancelling,
}: {
  order: PolymarketOrder;
  expanded: boolean;
  onToggle: () => void;
  onCancel: () => void;
  isCancelling: boolean;
}) {
  const isLive = order.status === "LIVE";
  const fillPct = parseFloat(order.original_size) > 0
    ? (parseFloat(order.size_matched) / parseFloat(order.original_size) * 100)
    : 0;

  const createdDate = order.created_at
    ? new Date(typeof order.created_at === "number" ? order.created_at * 1000 : order.created_at)
    : null;

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      {/* Main row */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-accent/50 transition-all"
      >
        {/* Side badge */}
        <span className={cn(
          "text-xs font-bold px-2 py-0.5 rounded",
          order.side === "BUY" ? "bg-yes/15 text-yes" : "bg-no/15 text-no"
        )}>
          {order.side}
        </span>

        {/* Price + size */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-semibold">${order.price}</span>
            <span className="text-xs text-muted-foreground">×</span>
            <span className="font-mono text-sm">{parseFloat(order.original_size).toFixed(2)} shares</span>
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5 truncate">
            {order.asset_id.slice(0, 12)}...{order.asset_id.slice(-6)}
          </div>
        </div>

        {/* Fill progress */}
        {fillPct > 0 && fillPct < 100 && (
          <div className="w-16">
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary rounded-full"
                style={{ width: `${fillPct}%` }}
              />
            </div>
            <span className="text-[9px] text-muted-foreground">{fillPct.toFixed(0)}% filled</span>
          </div>
        )}

        {/* Status */}
        <span className={cn(
          "text-[10px] font-semibold px-2 py-0.5 rounded-full border",
          STATUS_COLORS[order.status] || STATUS_COLORS.LIVE
        )}>
          {order.status}
        </span>

        {/* Total value */}
        <span className="font-mono text-sm text-muted-foreground w-16 text-right">
          ${order.totalValue}
        </span>

        {/* Expand */}
        {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-border bg-muted/30 px-4 py-3 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
            <Detail label="Order ID" value={order.id} mono truncate />
            <Detail label="Market" value={order.market} mono truncate />
            <Detail label="Token ID" value={order.asset_id} mono truncate />
            <Detail label="Type" value={order.type} />
            <Detail label="Remaining" value={`${order.remainingSize} shares`} />
            <Detail label="Filled" value={`${order.size_matched} shares`} />
            <Detail label="Created" value={createdDate?.toLocaleString() || "—"} />
            <Detail label="Expiration" value={order.expiration === "0" || order.expiration === 0 ? "Never" : new Date(Number(order.expiration) * 1000).toLocaleString()} />
            <Detail label="Owner" value={order.owner} mono truncate />
          </div>

          {isLive && (
            <div className="flex justify-end">
              <Button
                variant="destructive"
                size="sm"
                disabled={isCancelling}
                onClick={(e) => {
                  e.stopPropagation();
                  onCancel();
                }}
              >
                {isCancelling ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <X className="h-3 w-3 mr-1" />}
                Cancel Order
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Detail({ label, value, mono, truncate }: { label: string; value: string; mono?: boolean; truncate?: boolean }) {
  return (
    <div>
      <span className="text-muted-foreground block text-[10px]">{label}</span>
      <span className={cn(
        "text-foreground",
        mono && "font-mono",
        truncate && "truncate block max-w-[180px]"
      )}>
        {value}
      </span>
    </div>
  );
}
