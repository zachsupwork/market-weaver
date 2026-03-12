import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { fetchEvents } from "@/lib/polymarket-api";
import { normalizeMarkets } from "@/lib/normalizePolymarket";
import { isBytes32Hex } from "@/lib/polymarket-api";
import { Search, Loader2, Activity, BarChart3, ExternalLink, Droplets, Layers } from "lucide-react";

function formatVol(n: number): string {
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function formatPrice(p: number | undefined): string {
  if (p === undefined || p === null || isNaN(p)) return "—";
  return `${Math.round(p * 100)}¢`;
}

const ExploreEvents = () => {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(0);
  const limit = 50;

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(timer);
  }, [search]);

  const { data: events, isLoading, error } = useQuery({
    queryKey: ["polymarket-events", page, search],
    queryFn: () => fetchEvents({
      active: true,
      closed: false,
      limit,
      offset: page * limit,
      keyword: search.trim() || undefined,
    }),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  return (
    <div className="min-h-screen">
      <div className="container py-6 max-w-6xl">
        <div className="mb-6">
          <div className="flex items-center gap-2.5 mb-1">
            <Layers className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-bold">Events</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Multi-outcome events with grouped markets from Polymarket.
          </p>
        </div>

        <div className="relative mb-5 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search events..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            className="w-full rounded-lg border border-border bg-card pl-10 pr-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all"
          />
        </div>

        {isLoading && (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
            <p className="text-sm text-destructive">Failed to load events: {(error as Error).message}</p>
          </div>
        )}

        {events && events.length > 0 && (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {events.map((event: any) => {
                const rawMarkets = event.markets || [];
                const markets = normalizeMarkets(rawMarkets);
                const liveMarkets = markets.filter(m => isBytes32Hex(m.condition_id) && m.statusLabel === "LIVE");
                const title = event.title || event.question || "Untitled Event";
                const slug = event.slug || event.id || "";
                const pmUrl = slug ? `https://polymarket.com/event/${slug}` : null;
                const totalVol = markets.reduce((s, m) => s + m.totalVolume, 0);
                const totalLiq = markets.reduce((s, m) => s + m.liquidity, 0);

                return (
                  <div
                    key={event.id || slug}
                    className="rounded-xl border border-border bg-card p-4 transition-all hover:border-primary/30 group"
                  >
                    <Link
                      to={`/events/${encodeURIComponent(event.id || slug)}`}
                      className="block"
                    >
                      <div className="flex items-start gap-3 mb-2">
                        {event.image && (
                          <img src={event.image} alt="" className="h-10 w-10 rounded-lg bg-muted shrink-0 object-cover" loading="lazy" />
                        )}
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-semibold leading-snug text-foreground group-hover:text-primary transition-colors line-clamp-2">
                            {title}
                          </h3>
                          {event.description && (
                            <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">{event.description}</p>
                          )}
                        </div>
                      </div>
                    </Link>

                    {/* Top live markets with prices + progress */}
                    {liveMarkets.length > 0 && (
                      <div className="space-y-1 mb-3">
                        {liveMarkets.slice(0, 4).map((m) => {
                          const yesPrice = m.outcomePrices?.[0];
                          const yesPct = yesPrice !== undefined ? Math.round(yesPrice * 100) : 50;
                          return (
                            <Link
                              key={m.condition_id}
                              to={`/trade/${encodeURIComponent(m.condition_id)}`}
                              className="flex items-center gap-2 text-xs hover:bg-accent/50 rounded px-1.5 py-1 -mx-1.5 transition-colors"
                            >
                              <span className="truncate text-foreground flex-1 text-[11px]">
                                {(m as any).groupItemTitle || m.question}
                              </span>
                              <div className="w-16 h-1.5 rounded-full bg-no/20 overflow-hidden shrink-0">
                                <div className="h-full rounded-full bg-yes" style={{ width: `${yesPct}%` }} />
                              </div>
                              <span className="font-mono text-yes shrink-0 text-[11px] w-8 text-right">
                                {formatPrice(yesPrice)}
                              </span>
                            </Link>
                          );
                        })}
                        {liveMarkets.length > 4 && (
                          <Link
                            to={`/events/${encodeURIComponent(event.id || slug)}`}
                            className="text-[10px] text-primary hover:underline pl-1.5"
                          >
                            +{liveMarkets.length - 4} more →
                          </Link>
                        )}
                      </div>
                    )}

                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span>{markets.length} market{markets.length !== 1 ? "s" : ""}</span>
                      {liveMarkets.length > 0 && (
                        <span className="rounded-full bg-yes/10 border border-yes/20 px-1.5 py-0.5 text-[9px] font-mono text-yes">
                          {liveMarkets.length} LIVE
                        </span>
                      )}
                      <span className="ml-auto flex items-center gap-1">
                        <BarChart3 className="h-3 w-3" />
                        {formatVol(totalVol)}
                      </span>
                      {pmUrl && (
                        <a
                          href={pmUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-muted-foreground hover:text-primary transition-colors"
                          title="View on Polymarket"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-center gap-3 mt-6">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="rounded-md border border-border px-4 py-1.5 text-sm disabled:opacity-30 hover:bg-accent transition-all"
              >
                Previous
              </button>
              <span className="flex items-center text-sm text-muted-foreground">Page {page + 1}</span>
              <button
                onClick={() => setPage(p => p + 1)}
                disabled={events.length < limit}
                className="rounded-md border border-border px-4 py-1.5 text-sm disabled:opacity-30 hover:bg-accent transition-all"
              >
                Next
              </button>
            </div>
          </>
        )}

        {!isLoading && events && events.length === 0 && !error && (
          <div className="text-center py-16 text-muted-foreground">
            <p className="text-sm">No events found.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ExploreEvents;
