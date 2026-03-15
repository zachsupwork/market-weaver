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

export function useRecentTrades(opts?: { conditionId?: string; tokenId?: string; limit?: number }) {
  const limit = opts?.limit ?? 30;
  const conditionId = opts?.conditionId;
  const tokenId = opts?.tokenId;

  return useQuery<BitqueryTrade[]>({
    queryKey: ["recent-trades", conditionId, tokenId, limit],
    queryFn: async () => {
      const qs = new URLSearchParams();
      qs.set("limit", String(limit));
      if (tokenId) qs.set("token_id", tokenId);
      else if (conditionId) qs.set("condition_id", conditionId);

      const res = await fetch(
        `https://${PROJECT_ID}.supabase.co/functions/v1/polymarket-proxy-trades?${qs}`,
        { headers: { apikey: ANON_KEY } }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(err.error || `Trades fetch failed: ${res.status}`);
      }
      const raw = await res.json();
      // Normalize to BitqueryTrade shape for compatibility
      return (raw as any[]).map((t) => ({
        id: t.id || "",
        timestamp: t.timestamp || "",
        price: t.price ?? 0,
        priceUsd: t.price ?? 0,
        size: t.size ?? 0,
        sideAmount: t.size ?? 0,
        side: (t.side || "BUY") as "BUY" | "SELL",
        buyer: "",
        seller: "",
        tokenName: t.outcome || "",
        tokenSymbol: t.outcome || "",
        tokenAddress: t.asset_id || "",
        txHash: t.id || "",
      }));
    },
    staleTime: 1_500,
    refetchInterval: 2_000,
  });
}
