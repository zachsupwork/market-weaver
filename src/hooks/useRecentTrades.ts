import { useQuery } from "@tanstack/react-query";
import { normalizeTradeTimestamp } from "@/lib/polymarket-api";

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

export function useRecentTrades(opts?: { conditionId?: string; tokenId?: string; limit?: number; pollMs?: number }) {
  const limit = opts?.limit ?? 30;
  const pollMs = opts?.pollMs ?? 1_000;
  const conditionId = opts?.conditionId;
  const tokenId = opts?.tokenId;
  const scope = tokenId ? `token:${tokenId}` : conditionId ? `condition:${conditionId}` : "global";

  return useQuery<BitqueryTrade[]>({
    queryKey: ["recent-trades", scope, limit, pollMs],
    queryFn: async () => {
      const qs = new URLSearchParams();
      qs.set("limit", String(limit));

      if (tokenId) qs.set("token_id", tokenId);
      else if (conditionId && conditionId !== "all") qs.set("condition_id", conditionId);
      else qs.set("condition_id", "all");

      // Cache-buster to avoid stale edge/CDN snapshots for "all" trades
      qs.set("_ts", String(Date.now()));

      const res = await fetch(
        `https://${PROJECT_ID}.supabase.co/functions/v1/polymarket-proxy-trades?${qs}`,
        {
          headers: { apikey: ANON_KEY },
          cache: "no-store",
        }
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(err.error || `Trades fetch failed: ${res.status}`);
      }

      const raw = await res.json();
      const rows = Array.isArray(raw) ? raw : [];
      const occurrenceBySignature = new Map<string, number>();

      const mapped = rows.slice(0, limit).map((t, index) => {
        const price = Number(t?.price ?? 0);
        const size = Number(t?.size ?? t?.sideAmount ?? 0);
        const side: "BUY" | "SELL" = String(t?.side ?? "BUY").toUpperCase() === "SELL" ? "SELL" : "BUY";
        const rawTimestamp = t?.timestamp ?? t?.created_at ?? t?.time;
        const tokenAddress = String(t?.asset_id ?? t?.token_id ?? "");

        const signature = [
          tokenAddress,
          rawTimestamp ?? "",
          price,
          size,
          side,
          t?.outcome ?? "",
          t?.tx_hash ?? t?.transaction_hash ?? "",
        ].join(":");

        const occurrence = (occurrenceBySignature.get(signature) ?? 0) + 1;
        occurrenceBySignature.set(signature, occurrence);

        const fallbackId = `${signature}#${occurrence}#${index}`;
        const id = String(t?.id || t?.trade_id || t?.tx_hash || t?.transaction_hash || fallbackId);

        return {
          id,
          timestamp: normalizeTradeTimestamp(rawTimestamp),
          price: Number.isFinite(price) ? price : 0,
          priceUsd: Number.isFinite(price) ? price : 0,
          size: Number.isFinite(size) ? size : 0,
          sideAmount: Number.isFinite(size) ? size : 0,
          side,
          buyer: String(t?.buyer ?? ""),
          seller: String(t?.seller ?? ""),
          tokenName: String(t?.outcome ?? t?.token_name ?? ""),
          tokenSymbol: String(t?.outcome ?? t?.token_symbol ?? ""),
          tokenAddress,
          txHash: String(t?.tx_hash || t?.transaction_hash || t?.id || ""),
        };
      });

      mapped.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      return mapped.slice(0, limit);
    },
    staleTime: 0,
    refetchInterval: pollMs,
    refetchIntervalInBackground: true,
  });
}
