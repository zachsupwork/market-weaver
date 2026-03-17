// Featured events hook - fetches top multi-outcome events from Gamma API
import { useQuery } from "@tanstack/react-query";
import { fetchEvents } from "@/lib/polymarket-api";
import { normalizeMarket, type NormalizedMarket } from "@/lib/normalizePolymarket";

export interface FeaturedEvent {
  id: string;
  title: string;
  slug: string;
  image: string;
  volume: number;
  liquidity: number;
  markets: NormalizedMarket[];
}

export function useFeaturedEvents(limit = 10) {
  return useQuery<FeaturedEvent[]>({
    queryKey: ["featured-events", limit],
    queryFn: async () => {
      const events = await fetchEvents({
        active: true,
        closed: false,
        limit: limit + 5, // fetch extra to filter
      });

      return events
        .filter((e: any) => Array.isArray(e.markets) && e.markets.length >= 2)
        .map((e: any): FeaturedEvent => {
          // Filter to only active, order-accepting markets
          const activeMarkets = (e.markets || []).filter((m: any) => {
            const active = m.active !== false && m.closed !== true;
            const accepting = m.accepting_orders !== false && m.acceptingOrders !== false;
            return active && accepting;
          });
          if (activeMarkets.length < 2) return null;

          return {
          id: e.id || "",
          title: e.title || e.name || "",
          slug: e.slug || "",
          image: e.image || "",
          volume: Number(e.volume ?? e.volume24hr ?? 0),
          liquidity: Number(e.liquidity ?? 0),
          markets: activeMarkets
            .map((m: any) => normalizeMarket({ ...m, event_slug: e.slug }))
            .sort((a: NormalizedMarket, b: NormalizedMarket) => {
              const aPrice = a.outcomePrices?.[0] ?? 0;
              const bPrice = b.outcomePrices?.[0] ?? 0;
              return bPrice - aPrice;
            })
            .slice(0, 10),
        };
        })
        .filter((e): e is FeaturedEvent => e !== null && !!e.title && !!e.slug)
        .slice(0, limit);
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
