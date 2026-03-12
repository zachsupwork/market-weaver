import { useQuery } from "@tanstack/react-query";

const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export interface BitqueryTrade {
  id: string;
  timestamp: string;
  price: number;
  priceUsd: number;
  size: number;
  sideAmount: number;
  side: "BUY" | "SELL";
  buyer: string;
  seller: string;
  tokenName: string;
  tokenSymbol: string;
  tokenAddress: string;
  txHash: string;
}

export function useRecentTrades(opts?: { conditionId?: string; limit?: number }) {
  const limit = opts?.limit ?? 30;
  const conditionId = opts?.conditionId;

  return useQuery<BitqueryTrade[]>({
    queryKey: ["bitquery-trades", conditionId, limit],
    queryFn: async () => {
      const qs = new URLSearchParams();
      qs.set("limit", String(limit));
      if (conditionId) qs.set("condition_id", conditionId);

      const res = await fetch(
        `https://${PROJECT_ID}.supabase.co/functions/v1/polymarket-bitquery-trades?${qs}`,
        { headers: { apikey: ANON_KEY } }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(err.error || `Bitquery trades fetch failed: ${res.status}`);
      }
      return res.json();
    },
    staleTime: 20_000,
    refetchInterval: 30_000,
  });
}
