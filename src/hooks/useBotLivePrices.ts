import { useEffect, useMemo } from "react";
import { wsService } from "@/services/orderbook-ws.service";
import { useMarketStore } from "@/stores/useMarketStore";
import type { BotOpportunity } from "@/hooks/useBot";

/**
 * Subscribe to WebSocket price feeds for bot opportunities that have a token_id.
 * Returns a map of opportunity.id → { livePrice, liveEdge }.
 */
export function useBotLivePrices(opportunities: BotOpportunity[]) {
  // Collect unique token_ids
  const tokenIds = useMemo(
    () => [...new Set(opportunities.map((o) => o.token_id).filter(Boolean) as string[])],
    [opportunities]
  );

  // Subscribe to WS for each token_id
  useEffect(() => {
    if (tokenIds.length === 0) return;
    const unsubs = tokenIds.map((id) => wsService.subscribe(id, () => {}));
    return () => unsubs.forEach((u) => u());
  }, [tokenIds]);

  // Read live data from the zustand store
  const assets = useMarketStore((s) => s.assets);

  // Build a lookup: oppId → { livePrice, liveEdge }
  return useMemo(() => {
    const map: Record<string, { livePrice: number; liveEdge: number }> = {};
    for (const opp of opportunities) {
      if (!opp.token_id) continue;
      const asset = assets[opp.token_id];
      if (!asset) continue;

      // Use lastTradePrice, then bestAsk, then bestBid as fallback
      const raw = asset.lastTradePrice ?? asset.bestAsk ?? asset.bestBid;
      if (raw == null) continue;

      const livePrice = raw;
      const liveEdge = opp.ai_probability - livePrice;
      map[opp.id] = { livePrice, liveEdge };
    }
    return map;
  }, [opportunities, assets]);
}
