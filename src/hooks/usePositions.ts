import { useQuery } from "@tanstack/react-query";
import { fetchPositions } from "@/lib/polymarket-api";

export function usePositions() {
  return useQuery({
    queryKey: ["polymarket-positions"],
    queryFn: fetchPositions,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}
