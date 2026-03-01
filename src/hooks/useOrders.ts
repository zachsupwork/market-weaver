import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchOpenOrders, cancelOrder } from "@/lib/polymarket-api";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface PolymarketOrder {
  id: string;
  market: string;
  asset_id: string;
  side: "BUY" | "SELL";
  price: string;
  original_size: string;
  size_matched: string;
  status: string;
  created_at: string | number;
  expiration: string | number;
  outcome: string;
  owner: string;
  type: string;
  remainingSize?: string;
  totalValue?: string;
}

export type OrderFilter = "all" | "live" | "matched" | "cancelled";

const STATUS_MAP: Record<OrderFilter, string | undefined> = {
  all: undefined,     // no filter — get everything
  live: "LIVE",
  matched: "MATCHED",
  cancelled: "CANCELLED",
};

export function useOrders(enabled = true, statusFilter: OrderFilter = "all") {
  const queryClient = useQueryClient();
  const apiStatus = STATUS_MAP[statusFilter];

  const query = useQuery({
    queryKey: ["polymarket-orders", statusFilter],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return [];
      const result = await fetchOpenOrders(apiStatus);
      console.log("[useOrders] result:", { ok: result.ok, count: result.orders?.length, rawCount: result.rawCount, error: result.error });
      if (!result.ok) {
        console.error("[useOrders] fetch error:", result);
        throw new Error(result.error || "Failed to fetch orders");
      }
      return (result.orders || []).map(normalizeOrder);
    },
    enabled,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    staleTime: 10_000,
  });

  const cancelMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const result = await cancelOrder(orderId);
      if (!result.ok) throw new Error(result.error || "Cancel failed");
      return result;
    },
    onSuccess: () => {
      toast.success("Order cancelled successfully");
      queryClient.invalidateQueries({ queryKey: ["polymarket-orders"] });
    },
    onError: (err: Error) => {
      toast.error(`Cancel failed: ${err.message}`);
    },
  });

  return {
    orders: query.data || [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    cancelOrder: cancelMutation.mutateAsync,
    isCancelling: cancelMutation.isPending,
    cancellingId: cancelMutation.variables,
  };
}

function normalizeOrder(raw: any): PolymarketOrder {
  const originalSize = raw.original_size || raw.size || "0";
  const sizeMatched = raw.size_matched || "0";
  const remaining = (parseFloat(originalSize) - parseFloat(sizeMatched)).toFixed(6);
  const price = raw.price || "0";
  const totalValue = (parseFloat(price) * parseFloat(originalSize)).toFixed(2);

  return {
    id: raw.id || raw.orderID || "",
    market: raw.market || raw.condition_id || "",
    asset_id: raw.asset_id || raw.tokenID || "",
    side: raw.side === "BUY" || raw.side === 0 ? "BUY" : "SELL",
    price,
    original_size: originalSize,
    size_matched: sizeMatched,
    status: raw.status || "LIVE",
    created_at: raw.created_at || raw.timestamp || "",
    expiration: raw.expiration || "0",
    outcome: raw.outcome || "",
    owner: raw.owner || "",
    type: raw.type || raw.order_type || "GTC",
    remainingSize: remaining,
    totalValue,
  };
}
