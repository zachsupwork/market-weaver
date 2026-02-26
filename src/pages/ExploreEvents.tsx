import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { fetchEvents } from "@/lib/polymarket-api";
import { Search, Loader2, Activity, Calendar, BarChart3 } from "lucide-react";

const ExploreEvents = () => {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const limit = 50;

  const { data: events, isLoading, error } = useQuery({
    queryKey: ["polymarket-events", page],
    queryFn: () => fetchEvents({ active: true, limit, offset: page * limit }),
    staleTime: 30_000,
  });

  const filtered = useMemo(() => {
    if (!events) return [];
    if (!search.trim()) return events;
    const q = search.toLowerCase();
    return events.filter((e: any) =>
      (e.title || e.question || "").toLowerCase().includes(q) ||
      (e.description || "").toLowerCase().includes(q) ||
      (e.slug || "").toLowerCase().includes(q)
    );
  }, [events, search]);

  return (
    <div className="min-h-screen">
      <div className="container py-8">
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <Activity className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold">Explore Events</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Browse Polymarket events, each containing one or more tradable markets.
          </p>
        </div>

        <div className="relative mb-6 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search events (e.g. 'election', 'Bitcoin')..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
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
                const markets = event.markets || [];
                const title = event.title || event.question || "Untitled Event";
                const tags = event.tags || [];
                const slug = event.slug || event.id || "";

                return (
                  <Link
                    key={event.id || slug}
                    to={`/events/${encodeURIComponent(event.id || slug)}`}
                    className="group block rounded-xl border border-border bg-card p-5 transition-all hover:border-primary/30"
                  >
                    <div className="flex items-start gap-3 mb-3">
                      {event.image && (
                        <img src={event.image} alt="" className="h-10 w-10 rounded-lg bg-muted shrink-0" loading="lazy" />
                      )}
                      <h3 className="text-sm font-semibold leading-snug text-foreground group-hover:text-primary transition-colors line-clamp-2 flex-1">
                        {title}
                      </h3>
                    </div>

                    {event.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{event.description}</p>
                    )}

                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <BarChart3 className="h-3 w-3" />
                        <span>{markets.length} market{markets.length !== 1 ? "s" : ""}</span>
                      </div>
                      {event.start_date && (
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          <span>{new Date(event.start_date).toLocaleDateString()}</span>
                        </div>
                      )}
                    </div>

                    {tags.length > 0 && (
                      <div className="flex gap-1 mt-3">
                        {tags.slice(0, 3).map((tag: string) => (
                          <span key={tag} className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-secondary-foreground">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </Link>
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
