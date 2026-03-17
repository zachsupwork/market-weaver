import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export type HistoryItemType = "BUY" | "SELL" | "FEE" | string;

export interface HistoryItem {
  type: HistoryItemType;
  market: string;
  outcome: string;
  price: number;
  size: number;
  total: number;
  status: string;
  timestamp: string;
  asset_id?: string;
  condition_id?: string;
  tx_hash?: string;
  order_id?: string;
  source: "trade" | "order" | "fee";
}

export type HistoryFilter = "ALL" | "TRADES" | "ORDERS" | "FEES";

async function fetchHistory(filter: HistoryFilter, limit: number, offset: number): Promise<{
  history: HistoryItem[];
  total: number;
  address: string;
}> {
  const session = (await supabase.auth.getSession()).data.session;
  if (!session) throw new Error("Not authenticated");

  const qs = new URLSearchParams();
  qs.set("type", filter);
  qs.set("limit", String(limit));
  qs.set("offset", String(offset));

  const res = await fetch(
    `https://${PROJECT_ID}.supabase.co/functions/v1/polymarket-user-history?${qs}`,
    {
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${session.access_token}`,
      },
    }
  );

  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "Failed to fetch history");
  return { history: data.history || [], total: data.total || 0, address: data.address || "" };
}

export function useTransactionHistory(filter: HistoryFilter = "ALL", limit = 100, offset = 0) {
  return useQuery({
    queryKey: ["transaction-history", filter, limit, offset],
    queryFn: () => fetchHistory(filter, limit, offset),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}
