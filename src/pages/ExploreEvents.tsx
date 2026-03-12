import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { fetchEvents } from "@/lib/polymarket-api";
import { normalizeMarkets } from "@/lib/normalizePolymarket";
import { isBytes32Hex } from "@/lib/polymarket-api";
import { Search, Loader2, Activity, Calendar, BarChart3, ExternalLink, Droplets } from "lucide-react";

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
  const [page, setPage] = useState(0);
  const limit = 50;

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
  });

  const filtered = useMemo(() => {
    if (!events) return [];
    return events;
  }, [events]);

  return (
    <div className="min-h-screen">
      <div className="container py-8 max-w-6xl">
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <Activity className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold">Explore Events</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Browse live Polymarket events, each containing one or more tradable markets.
          </p>
        </div>

        <div className="relative mb-6 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search events (e.g. 'election', 'Bitcoin')..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            className="w-full rounded-lg border border-border bg-card pl-10 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all"
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

        {filtered.length > 0 && (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((event: any) => {
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
                    className="rounded-xl border border-border bg-card p-5 transition-all hover:border-primary/30"
                  >
                    <Link
                      to={`/events/${encodeURIComponent(event.id || slug)}`}
                      className="block"
                    >
                      <div className="flex items-start gap-3 mb-3">
                        {event.image && (
                          <img src={event.image} alt="" className="h-10 w-10 rounded-lg bg-muted shrink-0 object-cover" loading="lazy" />
                        )}
                        <h3 className="text-sm font-semibold leading-snug text-foreground hover:text-primary transition-colors line-clamp-2 flex-1">
                          {title}
                        </h3>
                      </div>
                    </Link>

                    {event.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{event.description}</p>
                    )}

                    {/* Top 3 live markets with prices */}
                    {liveMarkets.length > 0 && (
                      <div className="space-y-1.5 mb-3">
                        {liveMarkets.slice(0, 3).map((m) => (
                          <Link
                            key={m.condition_id}
                            to={`/trade/${encodeURIComponent(m.condition_id)}`}
                            className="flex items-center justify-between gap-2 text-xs hover:bg-accent/50 rounded px-1.5 py-1 -mx-1.5 transition-colors"
                          >
                            <span className="truncate text-foreground flex-1">
                              {m.question}
                            </span>
                            <span className="font-mono text-yes shrink-0">
                              {formatPrice(m.outcomePrices?.[0])}
                            </span>
                          </Link>
                        ))}
                        {liveMarkets.length > 3 && (
                          <Link
                            to={`/events/${encodeURIComponent(event.id || slug)}`}
                            className="text-[10px] text-primary hover:underline pl-1.5"
                          >
                            +{liveMarkets.length - 3} more →
                          </Link>
                        )}
                      </div>
                    )}

                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{markets.length} market{markets.length !== 1 ? "s" : ""}</span>
                      {liveMarkets.length > 0 && (
                        <span className="rounded-full bg-yes/10 border border-yes/20 px-2 py-0.5 text-[10px] font-mono text-yes">
                          {liveMarkets.length} LIVE
                        </span>
                      )}
                      <div className="flex items-center gap-1 ml-auto">
                        <BarChart3 className="h-3 w-3" />
                        <span>{formatVol(totalVol)}</span>
                      </div>
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

            <div className="flex justify-center gap-3 mt-8">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="rounded-md border border-border px-4 py-2 text-sm disabled:opacity-30 hover:bg-accent transition-all"
              >
                Previous
              </button>
              <span className="flex items-center text-sm text-muted-foreground">Page {page + 1}</span>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={filtered.length < limit}
                className="rounded-md border border-border px-4 py-2 text-sm disabled:opacity-30 hover:bg-accent transition-all"
              >
                Next
              </button>
            </div>
          </>
        )}

        {!isLoading && filtered.length === 0 && !error && (
          <div className="text-center py-16 text-muted-foreground">
            <p className="text-sm">No events found.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ExploreEvents;
