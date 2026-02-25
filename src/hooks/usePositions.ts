import { useQuery } from "@tanstack/react-query";
import { useAccount } from "wagmi";
import { fetchPositionsByAddress } from "@/lib/polymarket-api";

export function usePositions() {
  const { address, isConnected } = useAccount();

  return useQuery<any[]>({
    queryKey: ["polymarket-positions", address],
    queryFn: () => fetchPositionsByAddress(address!),
    enabled: isConnected && !!address,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
