import { useQuery } from "@tanstack/react-query";
import { fetchMarkets, fetchMarketBySlug, type NormalizedMarket } from "@/lib/polymarket-api";

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
          slug: m.slug,
          question: m.question?.slice(0, 40),
          volume24h: m.volume24h,
          liquidity: m.liquidity,
        })));
      }
      return data;
    },
    staleTime: 15_000,
    refetchInterval: 30_000,
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
