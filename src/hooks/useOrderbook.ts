import { useQuery } from "@tanstack/react-query";
import { fetchOrderbook } from "@/lib/polymarket-api";

export function useOrderbook(tokenId: string | undefined) {
  return useQuery({
    queryKey: ["polymarket-orderbook", tokenId],
    queryFn: () => fetchOrderbook(tokenId!),
    enabled: !!tokenId,
    staleTime: 5_000,
    refetchInterval: 10_000,
  });
}
