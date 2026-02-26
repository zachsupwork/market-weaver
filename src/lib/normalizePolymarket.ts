// Normalization layer for Gamma API market data
// Ensures consistent shape regardless of API inconsistencies

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

function safeParseJson<T>(val: unknown, fallback: T): T {
  if (val === null || val === undefined) return fallback;
  if (typeof val !== "string") {
    if (Array.isArray(val)) return val as unknown as T;
    return fallback;
  }
  try {
    const parsed = JSON.parse(val);
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
  // Condition ID - try multiple keys
  const condition_id =
    raw.condition_id || raw.conditionId || raw.conditionID || "";

  // Slug
  const slug = raw.slug || raw.market_slug || "";

  // Numeric fields
  const volume24h = safeNum(
    raw.volume24hr ?? raw.volume_24hr ?? raw.volume24h ?? 0
  );
  const totalVolume = safeNum(raw.volume ?? raw.total_volume ?? 0);
  const liquidity = safeNum(raw.liquidity ?? raw.liquidity_num ?? 0);

  // Parse outcomes
  const outcomes: string[] = safeParseJson(raw.outcomes, ["Yes", "No"]);

  // Parse outcome prices
  const rawPrices: (string | number)[] = safeParseJson(raw.outcome_prices, []);
  const outcomePrices: number[] =
    rawPrices.length > 0
      ? rawPrices.map((p) => safeNum(p))
      : [0.5, 0.5];

  // Parse clob token IDs
  const clobTokenIds: string[] = safeParseJson(raw.clob_token_ids, []);

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

  return {
    condition_id,
    id: raw.id || "",
    slug,
    question: raw.question || "",
    description: raw.description || "",
    market_slug: raw.market_slug || slug,

    end_date_iso: raw.end_date_iso || "",
    game_start_time: raw.game_start_time || "",
    accepting_order_timestamp: raw.accepting_order_timestamp || "",

    volume24h,
    totalVolume,
    liquidity,

    outcomes,
    outcomePrices,
    clobTokenIds,

    tokens,

    active: raw.active !== false,
    closed: raw.closed === true,
    archived: raw.archived === true,
    accepting_orders: raw.accepting_orders !== false,

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
