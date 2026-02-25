export const CATEGORIES = [
  { id: "trending", label: "🔥 Trending" },
  { id: "new", label: "🆕 New" },
  { id: "politics", label: "🏛 Politics" },
  { id: "sports", label: "⚽ Sports" },
  { id: "crypto", label: "₿ Crypto" },
  { id: "business", label: "📈 Business" },
  { id: "pop-culture", label: "🎬 Pop Culture" },
  { id: "science", label: "🔬 Science & Tech" },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]["id"];

const KEYWORD_MAP: Record<string, string[]> = {
  politics: ["election", "trump", "biden", "senate", "congress", "president", "vote", "democrat", "republican", "governor", "political", "party", "poll", "gop", "dnc", "rnc", "legislation", "bill", "law", "supreme court", "scotus"],
  sports: ["nfl", "nba", "mlb", "nhl", "soccer", "football", "basketball", "baseball", "tennis", "golf", "ufc", "boxing", "super bowl", "world cup", "champions league", "olympics", "f1", "formula", "playoff", "finals", "championship", "match", "game", "win", "mvp"],
  crypto: ["bitcoin", "btc", "ethereum", "eth", "crypto", "blockchain", "defi", "nft", "token", "solana", "sol", "dogecoin", "doge", "coinbase", "binance", "altcoin", "stablecoin", "mining", "halving", "airdrop"],
  business: ["fed", "interest rate", "gdp", "inflation", "stock", "market cap", "ipo", "earnings", "revenue", "recession", "economy", "economic", "fomc", "treasury", "unemployment", "cpi", "sp500", "dow", "nasdaq"],
  "pop-culture": ["oscar", "grammy", "emmys", "movie", "film", "tv show", "celebrity", "music", "album", "concert", "tiktok", "youtube", "influencer", "streaming", "netflix", "disney", "marvel", "taylor swift", "beyonce", "kanye"],
  science: ["ai", "agi", "spacex", "nasa", "climate", "fda", "vaccine", "science", "tech", "apple", "google", "microsoft", "openai", "anthropic", "meta", "tesla", "quantum", "space", "mars", "moon", "robot"],
};

export function inferCategory(market: {
  category?: string;
  tags?: string[];
  question?: string;
}): CategoryId {
  // Check explicit category from API
  const cat = (market.category || "").toLowerCase();
  for (const [key] of Object.entries(KEYWORD_MAP)) {
    if (cat.includes(key)) return key as CategoryId;
  }

  // Check tags
  const tagStr = (market.tags || []).join(" ").toLowerCase();
  for (const [key, keywords] of Object.entries(KEYWORD_MAP)) {
    if (keywords.some((kw) => tagStr.includes(kw))) return key as CategoryId;
  }

  // Check question text
  const q = (market.question || "").toLowerCase();
  for (const [key, keywords] of Object.entries(KEYWORD_MAP)) {
    if (keywords.some((kw) => q.includes(kw))) return key as CategoryId;
  }

  return "trending";
}

export function sortByTrending<T extends { volume_24hr?: number; volume_num?: number; liquidity_num?: number }>(markets: T[]): T[] {
  return [...markets].sort((a, b) => {
    const aVol = a.volume_24hr ?? a.volume_num ?? 0;
    const bVol = b.volume_24hr ?? b.volume_num ?? 0;
    if (bVol !== aVol) return bVol - aVol;
    const aLiq = a.liquidity_num ?? 0;
    const bLiq = b.liquidity_num ?? 0;
    return bLiq - aLiq;
  });
}
