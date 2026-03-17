import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Flame } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useFeaturedEvents } from "@/hooks/useFeaturedEvents";
import { EventPreviewCard } from "./EventPreviewCard";
import { orderbookWsService } from "@/services/orderbook-ws.service";

export function FeaturedEvents() {
  const { data: events, isLoading } = useFeaturedEvents(8);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  // Subscribe all candidate token IDs to WebSocket for live prices
  useEffect(() => {
    if (!events || events.length === 0) return;

    const tokenIds = new Set<string>();
    events.forEach((e) =>
      e.markets.forEach((m) => {
        if (m.clobTokenIds?.[0]) tokenIds.add(m.clobTokenIds[0]);
      })
    );

    const unsubs = [...tokenIds].map((id) =>
      orderbookWsService.subscribe(id, () => {})
    );

    return () => unsubs.forEach((u) => u());
  }, [events]);

  const updateScrollState = () => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    updateScrollState();
    el.addEventListener("scroll", updateScrollState, { passive: true });
    return () => el.removeEventListener("scroll", updateScrollState);
  }, [events]);

  const scroll = (dir: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir === "left" ? -300 : 300, behavior: "smooth" });
  };

  if (isLoading) {
    return (
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Flame className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Trending Events</span>
        </div>
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-48 w-72 shrink-0 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (!events || events.length === 0) return null;

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Flame className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Trending Events</span>
          <span className="text-xs text-muted-foreground">Multi-outcome</span>
        </div>
        <div className="hidden sm:flex items-center gap-1">
          <button
            onClick={() => scroll("left")}
            disabled={!canScrollLeft}
            className="rounded-md border border-border p-1 hover:bg-accent disabled:opacity-30 transition-all"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => scroll("right")}
            disabled={!canScrollRight}
            className="rounded-md border border-border p-1 hover:bg-accent disabled:opacity-30 transition-all"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent pb-2 -mx-1 px-1"
      >
        {events.map((event) => (
          <EventPreviewCard key={event.id || event.slug} event={event} />
        ))}
      </div>
    </div>
  );
}
