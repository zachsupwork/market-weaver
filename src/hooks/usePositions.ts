import { useQuery } from "@tanstack/react-query";
import { useAccount } from "wagmi";
import { fetchPositionsByAddress } from "@/lib/polymarket-api";
import { useProxyWallet } from "@/hooks/useProxyWallet";

export function usePositions() {
  const { address, isConnected } = useAccount();
  const { proxyAddress } = useProxyWallet();

  // Positions are held by the proxy/Safe address, not the EOA
  const queryAddress = proxyAddress || address;

  return useQuery<any[]>({
    queryKey: ["polymarket-positions", queryAddress],
    queryFn: async () => {
      const results = await fetchPositionsByAddress(queryAddress!);
      console.log(`[usePositions] address=${queryAddress} count=${results.length}`);
      return results;
    },
    enabled: isConnected && !!queryAddress,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
