import { useQuery } from "@tanstack/react-query";
import { fetchOrderbook } from "@/lib/polymarket-api";

export function useOrderbook(tokenId: string | undefined) {
  return useQuery({
    queryKey: ["polymarket-orderbook", tokenId],
    queryFn: () => fetchOrderbook(tokenId!),
    enabled: !!tokenId,
    staleTime: 500,
    refetchInterval: tokenId ? 1_000 : false,
    refetchIntervalInBackground: true,
  });
}
