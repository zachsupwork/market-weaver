/**
 * Utilities for extracting crypto symbols and sports slugs from market data
 * to connect with the Sports WebSocket and RTDS feeds.
 */

const CRYPTO_PATTERNS: { pattern: RegExp; symbol: string }[] = [
  { pattern: /\bbitcoin\b|\bbtc\b/i, symbol: "btc" },
  { pattern: /\bethereum\b|\beth\b/i, symbol: "eth" },
  { pattern: /\bsolana\b|\bsol\b/i, symbol: "sol" },
  { pattern: /\bxrp\b|\bripple\b/i, symbol: "xrp" },
  { pattern: /\bdogecoin\b|\bdoge\b/i, symbol: "doge" },
];

/**
 * Try to extract a crypto base symbol from market question/tags.
 * Returns e.g. "btc", "eth", or undefined if not crypto-related.
 */
export function extractCryptoSymbol(question: string, tags?: string[]): string | undefined {
  const text = `${question} ${(tags || []).join(" ")}`;
  for (const { pattern, symbol } of CRYPTO_PATTERNS) {
    if (pattern.test(text)) return symbol;
  }
  return undefined;
}

/**
 * Try to extract a sports slug from market tags or event slug.
 * Sports slugs follow the pattern: {league}-{team1}-{team2}-{date}
 */
export function extractSportsSlug(tags?: string[], eventSlug?: string): string | undefined {
  // Check event slug first (most reliable)
  if (eventSlug && /^(nfl|nba|nhl|mlb|cbb|cfb|cs2|soccer|tennis)-/.test(eventSlug)) {
    return eventSlug;
  }
  // Check tags for sport-slug patterns
  if (tags) {
    for (const tag of tags) {
      if (/^(nfl|nba|nhl|mlb|cbb|cfb|cs2|soccer|tennis)-/.test(tag)) {
        return tag;
      }
    }
  }
  return undefined;
}

/**
 * Detect the inferred category from market data to determine
 * if we should show sport scores or crypto prices.
 */
export function isSportsMarket(question: string, tags?: string[]): boolean {
  const text = `${question} ${(tags || []).join(" ")}`.toLowerCase();
  return /\b(nfl|nba|nhl|mlb|soccer|football|basketball|baseball|tennis|ufc|boxing|f1|esports|match|game)\b/.test(text);
}

export function isCryptoMarket(question: string, tags?: string[]): boolean {
  return extractCryptoSymbol(question, tags) !== undefined;
}
