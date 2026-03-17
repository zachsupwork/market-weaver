import { useQuery } from "@tanstack/react-query";
import { useAccount } from "wagmi";
import { fetchPositionsByAddress } from "@/lib/polymarket-api";
import { useProxyWallet } from "@/hooks/useProxyWallet";

/** Client-side fallback: if the edge function didn't flag a position as
 *  redeemable/winner but the data strongly suggests it is, patch the flags. */
function enrichWinnerFlags(positions: any[]): any[] {
  return positions.map((p) => {
    const currentPrice = parseFloat(p.currentPrice || "0");
    const cashPnl = parseFloat(p.cashPnl || p.pnl || "0");
    const endDate = p.marketEndDate ? new Date(p.marketEndDate).getTime() : null;
    const isPastEnd = endDate ? endDate < Date.now() : false;
    const size = parseFloat(p.size || "0");

    // Already flagged by edge function — keep as is
    if (p.redeemable && p.isWinner) return p;

    // Heuristic: market ended + current price >= 0.90 + positive P&L → winner
    const looksResolved = p.resolved || isPastEnd || (currentPrice >= 0.95 && isPastEnd);
    const looksLikeWinner = currentPrice >= 0.90 && cashPnl > 0;

    if (looksResolved && looksLikeWinner && size > 0.001) {
      console.log(`[usePositions] Client-side winner override: market="${p.market}" price=${currentPrice} pnl=${cashPnl}`);
      return { ...p, resolved: true, isWinner: true, redeemable: true };
    }

    // Also flag resolved losers properly
    if (looksResolved && !p.resolved) {
      return { ...p, resolved: true };
    }

    return p;
  });
}

export function usePositions() {
  const { address, isConnected } = useAccount();
  const { proxyAddress } = useProxyWallet();

  // Positions are held by the proxy/Safe address, not the EOA
  const queryAddress = proxyAddress || address;

  return useQuery<any[]>({
    queryKey: ["polymarket-positions", queryAddress],
    queryFn: async () => {
      const results = await fetchPositionsByAddress(queryAddress!);
      const enriched = enrichWinnerFlags(results);
      const winners = enriched.filter((p) => p.redeemable && p.isWinner);
      console.log(`[usePositions] address=${queryAddress} count=${enriched.length} winners=${winners.length}`);
      return enriched;
    },
    enabled: isConnected && !!queryAddress,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
