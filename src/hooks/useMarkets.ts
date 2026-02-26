import { useQuery } from "@tanstack/react-query";
import { fetchMarkets, fetchMarketBySlug, type PolymarketMarket } from "@/lib/polymarket-api";

export function useMarkets(params?: {
  limit?: number;
  offset?: number;
  closed?: boolean;
  tag?: string;
  textQuery?: string;
}) {
  return useQuery({
    queryKey: ["polymarket-markets", params],
    queryFn: async () => {
      const data = await fetchMarkets(params);
      if (import.meta.env.DEV && data.length > 0) {
        console.log("[PolyView Markets] Sample (first 3):", data.slice(0, 3).map(m => ({
          condition_id: m.condition_id,
          id: m.id,
          slug: m.slug,
          question: m.question?.slice(0, 40),
        })));
      }
      return data;
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

export function useMarketBySlug(slug: string | undefined) {
  return useQuery({
    queryKey: ["polymarket-market", slug],
    queryFn: () => fetchMarketBySlug(slug!),
    enabled: !!slug,
    staleTime: 15_000,
  });
}
