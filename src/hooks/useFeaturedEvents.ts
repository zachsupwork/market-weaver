// Featured events hook - fetches top multi-outcome events from Gamma API
import { useQuery } from "@tanstack/react-query";
import { fetchEventBySlug, fetchEvents } from "@/lib/polymarket-api";
import { normalizeMarket, type NormalizedMarket } from "@/lib/normalizePolymarket";

export type EventStatus = "LIVE" | "CLOSED" | "ENDED";

export interface FeaturedEvent {
  id: string;
  title: string;
  slug: string;
  image: string;
  volume: number;
  liquidity: number;
  markets: NormalizedMarket[];
  status: EventStatus;
  endDate: string;
  resolved: boolean;
}

export function useFeaturedEvents(limit = 10, tag?: string) {
  return useQuery<FeaturedEvent[]>({
    queryKey: ["featured-events", limit, tag],
    queryFn: async () => {
      // Dynamically generate pinned slugs for the next 7 days so we always
      // show the most up-to-date Bitcoin / crypto events.
      const generateDynamicSlugs = (): string[] => {
        const slugs: string[] = [];
        const months = ["january","february","march","april","may","june","july","august","september","october","november","december"];
        const now = new Date();
        for (let d = -1; d <= 7; d++) {
          const dt = new Date(now);
          dt.setDate(dt.getDate() + d);
          const month = months[dt.getMonth()];
          const day = dt.getDate();
          const year = dt.getFullYear();
          // "above" events
          slugs.push(`bitcoin-above-on-${month}-${day}`);
          // "up or down" hourly events for today & tomorrow
          if (d >= -1 && d <= 1) {
            for (const hour of [9,10,11,12,1,2,3,4,5,6,7,8]) {
              const ampm = hour >= 9 && hour <= 11 ? "am" : "pm";
              const adjustedHour = hour > 8 && hour <= 11 ? hour : hour;
              slugs.push(`bitcoin-up-or-down-${month}-${day}-${year}-${adjustedHour}${ampm}-et`);
            }
          }
        }
        return slugs;
      };

      const pinnedSlugs = (!tag || tag === "Crypto")
        ? generateDynamicSlugs()
        : [];

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
        Crypto: ["bitcoin", "ethereum", "crypto", "solana", "up or down", "xrp", "dogecoin", "bnb", "price range", "above", "hit price"],
        Sports: ["nba", "nfl", "soccer", "mlb"],
        Politics: ["election", "president", "congress"],
      };
      const keywords = tag ? TAG_KEYWORDS[tag] || [tag.toLowerCase()] : [];
      const keywordPromises = keywords.map((kw) =>
        fetchEvents({ active: true, closed: false, limit: 50, keyword: kw })
      );
      const pinnedPromises = pinnedSlugs.map((slug) => fetchEventBySlug(slug));

      const results = await Promise.all([
        basePromise,
        ...keywordPromises,
        ...pinnedPromises,
      ]);

      const baseEvents = results[0] as any[];
      const keywordResults = results.slice(1, 1 + keywordPromises.length) as any[][];
      const pinnedEvents = results.slice(1 + keywordPromises.length).filter(Boolean) as any[];

      // Merge and deduplicate by event id
      const seen = new Set<string>();
      const allEvents: any[] = [];
      for (const e of [...baseEvents, ...keywordResults.flat(), ...pinnedEvents]) {
        const eid = e.id || e.slug || e.ticker;
        if (eid && !seen.has(eid)) {
          seen.add(eid);
          allEvents.push(e);
        }
      }

      // Client-side tag filtering since the API doesn't support it
      // Allow events with 2+ markets OR binary up/down events (which have exactly 2 outcomes in 1 market)
      let filtered = allEvents.filter(
        (e: any) => Array.isArray(e.markets) && e.markets.length >= 1
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
          const allEventMarkets = (e.markets || [])
            .map((m: any) => normalizeMarket({ ...m, event_slug: e.slug || e.ticker }));
          if (allEventMarkets.length < 1) return null;

          // Determine event-level status from the API data
          const isResolved = e.resolved === true;
          const allClosed = allEventMarkets.every((m: NormalizedMarket) => m.closed || m.archived || m.ended);
          const hasActive = allEventMarkets.some((m: NormalizedMarket) => m.active && !m.closed && !m.archived && m.accepting_orders);

          let status: EventStatus = "LIVE";
          if (isResolved || (allClosed && allEventMarkets.every((m: NormalizedMarket) => m.ended))) {
            status = "ENDED";
          } else if (allClosed || !hasActive) {
            status = "CLOSED";
          }

          // Get earliest end date from markets
          const endDate = allEventMarkets
            .map((m: NormalizedMarket) => m.end_date_iso)
            .filter(Boolean)
            .sort()[0] || "";

          return {
            id: e.id || "",
            title: e.title || e.name || "",
            slug: e.slug || e.ticker || "",
            image: e.image || "",
            volume: Number(e.volume ?? e.volume24hr ?? 0),
            liquidity: Number(e.liquidity ?? 0),
            status,
            endDate,
            resolved: isResolved,
            markets: allEventMarkets
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
