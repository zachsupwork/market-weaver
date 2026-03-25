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

export function useFeaturedEvents(limit = 10, tag?: string) {
  return useQuery<FeaturedEvent[]>({
    queryKey: ["featured-events", limit, tag],
    queryFn: async () => {
      // Gamma events API ignores the `tag` param, so we fetch a large pool
      // and also do a keyword search to catch lower-volume tagged events.
      const basePromise = fetchEvents({
        active: true,
        closed: false,
        limit: 100,
      });

      // When a category is active, also search by keyword to catch events
      // that may not rank in the top 100 by volume
      const TAG_KEYWORDS: Record<string, string[]> = {
        Crypto: ["bitcoin", "ethereum", "crypto", "solana"],
        Sports: ["nba", "nfl", "soccer", "mlb"],
        Politics: ["election", "president", "congress"],
      };
      const keywords = tag ? TAG_KEYWORDS[tag] || [tag.toLowerCase()] : [];
      const keywordPromises = keywords.map((kw) =>
        fetchEvents({ active: true, closed: false, limit: 50, keyword: kw })
      );

      const [baseEvents, ...keywordResults] = await Promise.all([
        basePromise,
        ...keywordPromises,
      ]);

      // Merge and deduplicate by event id
      const seen = new Set<string>();
      const allEvents: any[] = [];
      for (const e of [...baseEvents, ...keywordResults.flat()]) {
        const eid = e.id || e.slug || e.ticker;
        if (eid && !seen.has(eid)) {
          seen.add(eid);
          allEvents.push(e);
        }
      }

      // Client-side tag filtering since the API doesn't support it
      let filtered = allEvents.filter(
        (e: any) => Array.isArray(e.markets) && e.markets.length >= 2
      );

      if (tag) {
        const tagLower = tag.toLowerCase();
        filtered = filtered.filter((e: any) => {
          // Check event-level tags
          const eventTags: string[] = (e.tags || []).map((t: any) =>
            (t.slug || t.label || "").toLowerCase()
          );
          if (eventTags.some((t) => t.includes(tagLower))) return true;
          // Check title/question text
          const title = (e.title || e.name || "").toLowerCase();
          if (title.includes(tagLower)) return true;
          // Check child market tags
          const marketTags = (e.markets || []).flatMap((m: any) =>
            (m.tags || []).map((t: any) =>
              typeof t === "string" ? t.toLowerCase() : (t.slug || t.label || "").toLowerCase()
            )
          );
          return marketTags.some((t: string) => t.includes(tagLower));
        });
      }

      return filtered
        .map((e: any): FeaturedEvent | null => {
          const activeMarkets = (e.markets || []).filter((m: any) => {
            const active = m.active !== false && m.closed !== true;
            const accepting = m.accepting_orders !== false && m.acceptingOrders !== false;
            return active && accepting;
          });
          if (activeMarkets.length < 2) return null;

          return {
            id: e.id || "",
            title: e.title || e.name || "",
            slug: e.slug || e.ticker || "",
            image: e.image || "",
            volume: Number(e.volume ?? e.volume24hr ?? 0),
            liquidity: Number(e.liquidity ?? 0),
            markets: activeMarkets
              .map((m: any) => normalizeMarket({ ...m, event_slug: e.slug || e.ticker }))
              .sort((a: NormalizedMarket, b: NormalizedMarket) => {
                const aPrice = a.outcomePrices?.[0] ?? 0;
                const bPrice = b.outcomePrices?.[0] ?? 0;
                return bPrice - aPrice;
              })
              .slice(0, 20),
          };
        })
        .filter((e): e is FeaturedEvent => e !== null && !!e.title && !!e.slug)
        .slice(0, limit);
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
