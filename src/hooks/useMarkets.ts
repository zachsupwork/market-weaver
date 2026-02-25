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
    queryFn: () => fetchMarkets(params),
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
