import { useMemo } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { fetchEventBySlug } from "@/lib/polymarket-api";
import { ChevronLeft, ChevronRight } from "lucide-react";

/** Standard hourly time labels used by Polymarket for Bitcoin Up/Down events */
const HOURLY_SLOTS = [
  "9am", "10am", "11am", "12pm", "1pm", "2pm", "3pm", "4pm",
  "5pm", "6pm", "7pm", "8pm",
];

const SLOT_DISPLAY: Record<string, string> = {
  "9am": "9 AM", "10am": "10 AM", "11am": "11 AM", "12pm": "12 PM",
  "1pm": "1 PM", "2pm": "2 PM", "3pm": "3 PM", "4pm": "4 PM",
  "5pm": "5 PM", "6pm": "6 PM", "7pm": "7 PM", "8pm": "8 PM",
};

/**
 * Parse a slug like "bitcoin-up-or-down-march-26-2026-11am-et"
 * Returns { base, timeSlot } or null if not a time-slot event.
 */
function parseTimeSlotSlug(slug: string): {
  base: string;
  timeSlot: string;
  dateLabel: string;
} | null {
  // Pattern: {asset}-up-or-down-{month}-{day}-{year}-{time}-et
  const match = slug.match(
    /^(.+-up-or-down-\w+-\d+-\d+)-(\d{1,2}(?:am|pm))-et$/i
  );
  if (!match) return null;
  return {
    base: match[1],
    timeSlot: match[2].toLowerCase(),
    dateLabel: extractDateLabel(match[1]),
  };
}

function extractDateLabel(base: string): string {
  // e.g. "bitcoin-up-or-down-march-26-2026" -> "March 26"
  const m = base.match(/(\w+)-(\d+)-(\d{4})$/);
  if (!m) return "";
  return `${m[1].charAt(0).toUpperCase() + m[1].slice(1)} ${m[2]}`;
}

interface TimeSlotNavProps {
  currentSlug: string;
}

export function TimeSlotNav({ currentSlug }: TimeSlotNavProps) {
  const parsed = useMemo(() => parseTimeSlotSlug(currentSlug), [currentSlug]);

  // Prefetch adjacent slots to check if they exist
  const siblingSlots = useMemo(() => {
    if (!parsed) return [];
    return HOURLY_SLOTS.map((slot) => ({
      slot,
      slug: `${parsed.base}-${slot}-et`,
      label: SLOT_DISPLAY[slot] || slot.toUpperCase(),
      isCurrent: slot === parsed.timeSlot,
    }));
  }, [parsed]);

  // Batch-check which sibling events exist (lightweight, cached)
  const { data: existingSlots } = useQuery({
    queryKey: ["time-slot-siblings", parsed?.base],
    queryFn: async () => {
      if (!parsed) return {};
      const results: Record<string, boolean> = {};
      // Check all slots in parallel
      const checks = siblingSlots.map(async (s) => {
        if (s.isCurrent) {
          results[s.slot] = true;
          return;
        }
        try {
          const ev = await fetchEventBySlug(s.slug);
          results[s.slot] = !!ev;
        } catch {
          results[s.slot] = false;
        }
      });
      await Promise.all(checks);
      return results;
    },
    enabled: !!parsed,
    staleTime: 5 * 60_000,
  });

  if (!parsed || siblingSlots.length === 0) return null;

  const availableSlots = siblingSlots.filter(
    (s) => s.isCurrent || existingSlots?.[s.slot]
  );

  if (availableSlots.length <= 1) return null;

  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs text-muted-foreground font-medium">
          {parsed.dateLabel} — Select time:
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {availableSlots.map((s) => (
          <Link
            key={s.slot}
            to={`/events/${encodeURIComponent(s.slug)}`}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all border",
              s.isCurrent
                ? "bg-primary text-primary-foreground border-primary shadow-md shadow-primary/20"
                : "bg-card border-border text-muted-foreground hover:border-primary/40 hover:text-foreground hover:bg-accent"
            )}
          >
            {s.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
