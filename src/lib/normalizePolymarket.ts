// Normalization layer for Gamma API market data
// Ensures consistent shape regardless of API inconsistencies (camelCase vs snake_case)

export function isBytes32Hex(value: string): boolean {
  return /^0x[a-fA-F0-9]{64}$/.test(value);
}

export type MarketStatusLabel = "LIVE" | "CLOSED" | "ARCHIVED" | "UNAVAILABLE" | "ENDED";

export interface NormalizedMarket {
  // Identity
  condition_id: string;
  id: string;
  slug: string;
  question: string;
  description: string;
  market_slug: string;

  // Dates
  end_date_iso: string;
  game_start_time: string;
  accepting_order_timestamp: string;

  // Numeric fields (always numbers)
  volume24h: number;
  totalVolume: number;
  liquidity: number;

  // Parsed arrays
  outcomes: string[];
  outcomePrices: number[];
  clobTokenIds: string[];

  // Tokens (raw from API)
  tokens: Array<{
    token_id: string;
    outcome: string;
    price: number;
    winner: boolean;
  }>;

  // Status
  active: boolean;
  closed: boolean;
  archived: boolean;
  accepting_orders: boolean;
  statusLabel: MarketStatusLabel;
  ended: boolean;

  // Event slug for Polymarket external links
  event_slug: string;

  // Display
  image: string;
  icon: string;
  category: string;
  tags: string[];

  // Keep raw fields for backward compat
  volume: number;
  volume_num: number;
  volume_24hr: number;
  liquidity_num: number;
  outcome_prices: string;
  clob_token_ids: string;
}

export function isEndedByPrices(outcomePrices?: number[]): boolean {
  if (!outcomePrices || outcomePrices.length !== 2) return false;
  const [a, b] = outcomePrices;
  const lo = (x: number) => x <= 0.01;
  const hi = (x: number) => x >= 0.99;
  return (lo(a) && hi(b)) || (hi(a) && lo(b));
}

function safeParseJson<T>(val: unknown, fallback: T): T {
  if (val === null || val === undefined) return fallback;
  if (Array.isArray(val)) return val as unknown as T;
  if (typeof val !== "string") return fallback;
  const trimmed = val.trim();
  if (!trimmed) return fallback;
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return parsed as unknown as T;
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function safeNum(val: unknown): number {
  if (typeof val === "number" && !isNaN(val)) return val;
  if (typeof val === "string") {
    const n = parseFloat(val);
    return isNaN(n) ? 0 : n;
  }
  return 0;
}

export function normalizeMarket(raw: any): NormalizedMarket {
  // Condition ID - try multiple keys, trim whitespace
  const condition_id = String(
    raw.condition_id ?? raw.conditionId ?? raw.conditionID ?? ""
  ).trim();

  // Slug
  const slug = raw.slug || raw.market_slug || "";

  // Numeric fields - handle both camelCase and snake_case
  const volume24h = safeNum(
    raw.volume24hr ?? raw.volume_24hr ?? raw.volume24h ?? raw.volume24Hr ?? 0
  );
  const totalVolume = safeNum(
    raw.volume ?? raw.total_volume ?? raw.totalVolume ?? raw.volumeNum ?? raw.volume_num ?? 0
  );
  const liquidity = safeNum(
    raw.liquidity ?? raw.liquidity_num ?? raw.liquidityNum ?? 0
  );

  // Parse outcomes - support both key styles
  const outcomes: string[] = safeParseJson(
    raw.outcomes ?? raw.outcomeNames,
    ["Yes", "No"]
  );

  // Parse outcome prices - support both key styles
  const rawPrices: (string | number)[] = safeParseJson(
    raw.outcome_prices ?? raw.outcomePrices,
    []
  );
  let outcomePrices: number[] = rawPrices.length > 0
    ? rawPrices.map((p) => safeNum(p))
    : [];

  // Also try extracting prices from tokens array if outcomePrices is empty
  if (outcomePrices.length === 0 && raw.tokens && Array.isArray(raw.tokens)) {
    const tokenPrices = raw.tokens
      .sort((a: any, b: any) => {
        // YES before NO
        const ao = (a.outcome || "").toLowerCase();
        const bo = (b.outcome || "").toLowerCase();
        if (ao === "yes") return -1;
        if (bo === "yes") return 1;
        return 0;
      })
      .map((t: any) => safeNum(t.price));
    if (tokenPrices.length > 0 && tokenPrices.some((p: number) => p > 0)) {
      outcomePrices = tokenPrices;
    }
  }

  // Only default to [0.5, 0.5] when outcomes is exactly 2 and prices still empty
  if (outcomePrices.length === 0 && outcomes.length === 2) {
    outcomePrices = [0.5, 0.5];
  }

  // Parse clob token IDs from both key styles
  let clobTokenIds: string[] = safeParseJson(
    raw.clob_token_ids ?? raw.clobTokenIds,
    []
  );

  // Also extract from tokens array if empty
  if (clobTokenIds.length === 0 && raw.tokens && Array.isArray(raw.tokens)) {
    clobTokenIds = raw.tokens
      .sort((a: any, b: any) => {
        const ao = (a.outcome || "").toLowerCase();
        const bo = (b.outcome || "").toLowerCase();
        if (ao === "yes") return -1;
        if (bo === "yes") return 1;
        return 0;
      })
      .map((t: any) => t.token_id || t.tokenId || "")
      .filter(Boolean);
  }

  // Tags
  let tags: string[] = [];
  if (Array.isArray(raw.tags)) {
    tags = raw.tags;
  } else if (typeof raw.tags === "string") {
    tags = safeParseJson(raw.tags, []);
  }

  // Tokens
  let tokens = raw.tokens || [];
  if (typeof tokens === "string") {
    tokens = safeParseJson(tokens, []);
  }

  // accepting_orders: handle both camelCase and snake_case
  // IMPORTANT: default to FALSE when missing (unknown = not safe to label LIVE)
  const rawAccepting = raw.accepting_orders ?? raw.acceptingOrders;
  const accepting_orders = rawAccepting === true;

  // Status booleans — support both camelCase and snake_case
  // IMPORTANT: default active to FALSE when missing (unknown = not safe to label LIVE)
  const rawActive = raw.active ?? raw.isActive;
  const active = rawActive === true;
  const closed = (raw.closed ?? raw.isClosed) === true;
  const archived = (raw.archived ?? raw.isArchived) === true;

  // Event slug for correct Polymarket external links
  const event_slug = String(
    raw.event_slug ?? raw.eventSlug ?? raw.event?.slug ?? ""
  ).trim();

  // Detect ended by extreme prices (resolved market)
  const ended = isEndedByPrices(outcomePrices);

  // Classify market status
  const hasValidConditionId = isBytes32Hex(condition_id);
  const hasTradableTokens = clobTokenIds.length >= 2;

  let statusLabel: MarketStatusLabel;
  if (archived) {
    statusLabel = "ARCHIVED";
  } else if (ended) {
    statusLabel = "ENDED";
  } else if (closed || !active) {
    statusLabel = "CLOSED";
  } else if (!hasValidConditionId || !hasTradableTokens || !accepting_orders) {
    statusLabel = "UNAVAILABLE";
  } else {
    statusLabel = "LIVE";
  }

  return {
    condition_id,
    id: raw.id || "",
    slug,
    question: raw.question || "",
    description: raw.description || "",
    market_slug: raw.market_slug || slug,

    end_date_iso: raw.end_date_iso || raw.endDateIso || raw.endDate || "",
    game_start_time: raw.game_start_time || "",
    accepting_order_timestamp: raw.accepting_order_timestamp || raw.acceptingOrdersTimestamp || "",

    volume24h,
    totalVolume,
    liquidity,

    outcomes,
    outcomePrices,
    clobTokenIds,

    tokens,

    active,
    closed,
    archived,
    accepting_orders,
    statusLabel,
    ended,

    event_slug,

    image: raw.image || "",
    icon: raw.icon || "",
    category: raw.category || "",
    tags,

    // Backward compat numeric fields
    volume: totalVolume,
    volume_num: totalVolume,
    volume_24hr: volume24h,
    liquidity_num: liquidity,

    // Backward compat string fields
    outcome_prices: JSON.stringify(outcomePrices),
    clob_token_ids: JSON.stringify(clobTokenIds),
  };
}

export function normalizeMarkets(list: any[]): NormalizedMarket[] {
  if (!Array.isArray(list)) return [];
  return list.map(normalizeMarket);
}
