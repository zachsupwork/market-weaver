// Infer bet-type categories from market questions for event pages
import type { NormalizedMarket } from "@/lib/normalizePolymarket";

export interface MarketGroup {
  id: string;
  label: string;
  markets: NormalizedMarket[];
}

const CATEGORY_PATTERNS: { id: string; label: string; patterns: RegExp[] }[] = [
  { id: "moneyline", label: "Moneyline", patterns: [/\bwin\b/i, /\bwinner\b/i, /\badvance\b/i, /\bqualif/i, /\bnominate/i, /\bpresident\b/i, /\belected\b/i] },
  { id: "spreads", label: "Spreads", patterns: [/\bspread\b/i, /\bhandicap\b/i, /\bby \d+/i, /\bmargin\b/i, /\bmore than\b/i, /\bfewer than\b/i] },
  { id: "totals", label: "Totals", patterns: [/\btotal\b/i, /\bover\/under\b/i, /\bo\/u\b/i, /\bover \d/i, /\bunder \d/i, /\bcombined\b/i] },
  { id: "scorers", label: "Scorers", patterns: [/\bscorer\b/i, /\bgoal\b/i, /\bpoints?\b/i, /\btouchdown\b/i, /\bhome run\b/i, /\bto score\b/i] },
  { id: "exact", label: "Exact Score", patterns: [/\bexact score\b/i, /\bfinal score\b/i, /\bcorrect score\b/i, /^\d+-\d+$/] },
  { id: "props", label: "Props", patterns: [/\bprop\b/i, /\bperformance\b/i, /\bmvp\b/i, /\bassist/i, /\brebound/i, /\bstrikeout/i] },
  { id: "halftime", label: "Half / Period", patterns: [/\bhalf\b/i, /\bperiod\b/i, /\bquarter\b/i, /\binning\b/i, /\bhalf-time\b/i, /\b1st half\b/i] },
  { id: "price", label: "Price Range", patterns: [/\babove\b.*\$|\$.*\babove\b/i, /\bbelow\b.*\$|\$.*\bbelow\b/i, /\bprice\b/i, /\breach\b.*\$/i, /\bhit\b.*\$/i, /\bfloor\b/i] },
];

function inferCategory(question: string): string {
  for (const cat of CATEGORY_PATTERNS) {
    if (cat.patterns.some((p) => p.test(question))) return cat.id;
  }
  return "other";
}

export function groupMarkets(markets: NormalizedMarket[]): MarketGroup[] {
  const buckets = new Map<string, NormalizedMarket[]>();

  for (const m of markets) {
    const cat = inferCategory(m.question);
    if (!buckets.has(cat)) buckets.set(cat, []);
    buckets.get(cat)!.push(m);
  }

  const groups: MarketGroup[] = [];

  // Add known categories in order
  for (const cat of CATEGORY_PATTERNS) {
    const items = buckets.get(cat.id);
    if (items && items.length > 0) {
      groups.push({ id: cat.id, label: cat.label, markets: items });
    }
  }

  // Add "other" last
  const other = buckets.get("other");
  if (other && other.length > 0) {
    // If it's the only group, label it "All Markets"
    const label = groups.length === 0 ? "All Markets" : "Other";
    groups.push({ id: "other", label, markets: other });
  }

  return groups;
}
