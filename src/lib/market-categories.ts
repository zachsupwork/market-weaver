export const CATEGORIES = [
  { id: "trending", label: "🔥 Trending" },
  { id: "breaking", label: "⚡ Breaking" },
  { id: "new", label: "🆕 New" },
  { id: "politics", label: "🏛 Politics" },
  { id: "sports", label: "⚽ Sports" },
  { id: "crypto", label: "₿ Crypto" },
  { id: "finance", label: "💰 Finance" },
  { id: "geopolitics", label: "🌍 Geopolitics" },
  { id: "tech", label: "💻 Tech" },
  { id: "culture", label: "🎬 Culture" },
  { id: "science", label: "🔬 Science" },
  { id: "weather", label: "🌤 Weather" },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]["id"];

export const SPORTS_SUBCATEGORIES = [
  { id: "all-sports", label: "All Sports" },
  { id: "nba", label: "NBA" },
  { id: "ncaab", label: "NCAAB" },
  { id: "nfl", label: "NFL" },
  { id: "nhl", label: "NHL" },
  { id: "soccer", label: "Soccer" },
  { id: "ucl", label: "UCL" },
  { id: "tennis", label: "Tennis" },
  { id: "cricket", label: "Cricket" },
  { id: "f1", label: "F1" },
  { id: "mma", label: "MMA/UFC" },
  { id: "esports", label: "Esports" },
] as const;

export type SportsSubId = (typeof SPORTS_SUBCATEGORIES)[number]["id"];

const KEYWORD_MAP: Record<string, string[]> = {
  politics: ["election", "trump", "biden", "senate", "congress", "president", "vote", "democrat", "republican", "governor", "political", "party", "poll", "gop", "dnc", "rnc", "legislation", "bill", "law", "supreme court", "scotus", "primaries", "inauguration"],
  sports: ["nfl", "nba", "mlb", "nhl", "soccer", "football", "basketball", "baseball", "tennis", "golf", "ufc", "boxing", "super bowl", "world cup", "champions league", "olympics", "f1", "formula", "playoff", "finals", "championship", "match", "game", "win", "mvp", "ncaab", "march madness", "cricket", "esports", "mma"],
  crypto: ["bitcoin", "btc", "ethereum", "eth", "crypto", "blockchain", "defi", "nft", "token", "solana", "sol", "dogecoin", "doge", "coinbase", "binance", "altcoin", "stablecoin", "mining", "halving", "airdrop"],
  finance: ["fed", "interest rate", "gdp", "inflation", "stock", "market cap", "ipo", "earnings", "revenue", "recession", "economy", "economic", "fomc", "treasury", "unemployment", "cpi", "sp500", "dow", "nasdaq", "tariff"],
  geopolitics: ["iran", "china", "russia", "ukraine", "nato", "ceasefire", "sanctions", "war", "peace", "treaty", "missile", "nuclear", "strait", "hormuz", "taiwan"],
  tech: ["ai", "agi", "apple", "google", "microsoft", "openai", "anthropic", "meta", "tesla", "quantum", "robot", "spacex", "starlink"],
  culture: ["oscar", "grammy", "emmys", "movie", "film", "tv show", "celebrity", "music", "album", "concert", "tiktok", "youtube", "influencer", "streaming", "netflix", "disney", "marvel", "taylor swift", "beyonce", "kanye"],
  science: ["fda", "vaccine", "science", "nasa", "climate", "space", "mars", "moon"],
  weather: ["weather", "hurricane", "tornado", "temperature", "snow", "rain", "storm", "flood", "drought", "wildfire"],
  breaking: ["breaking", "just in", "urgent"],
};

const SPORTS_SUB_KEYWORDS: Record<string, string[]> = {
  nba: ["nba", "basketball", "lakers", "celtics", "warriors", "lebron", "curry", "bucks", "76ers", "knicks"],
  ncaab: ["ncaab", "march madness", "college basketball", "ncaa"],
  nfl: ["nfl", "super bowl", "touchdown", "quarterback", "patriots", "chiefs", "eagles"],
  nhl: ["nhl", "hockey", "stanley cup", "puck"],
  soccer: ["soccer", "premier league", "la liga", "bundesliga", "serie a", "mls", "world cup"],
  ucl: ["ucl", "champions league", "uefa"],
  tennis: ["tennis", "wimbledon", "us open tennis", "roland garros", "australian open tennis", "atp", "wta"],
  cricket: ["cricket", "ipl", "test match", "t20", "odi"],
  f1: ["f1", "formula 1", "formula one", "grand prix", "verstappen", "hamilton"],
  mma: ["ufc", "mma", "boxing", "fight night", "octagon"],
  esports: ["esports", "league of legends", "dota", "csgo", "valorant"],
};

export function inferCategory(market: {
  category?: string;
  tags?: string[];
  question?: string;
}): CategoryId {
  const cat = (market.category || "").toLowerCase();
  for (const [key] of Object.entries(KEYWORD_MAP)) {
    if (cat.includes(key)) return key as CategoryId;
  }
  const tagStr = (market.tags || []).join(" ").toLowerCase();
  for (const [key, keywords] of Object.entries(KEYWORD_MAP)) {
    if (keywords.some((kw) => tagStr.includes(kw))) return key as CategoryId;
  }
  const q = (market.question || "").toLowerCase();
  for (const [key, keywords] of Object.entries(KEYWORD_MAP)) {
    if (keywords.some((kw) => q.includes(kw))) return key as CategoryId;
  }
  return "trending";
}

export function inferSportsSubcategory(market: {
  tags?: string[];
  question?: string;
}): SportsSubId {
  const text = [
    ...(market.tags || []),
    market.question || "",
  ].join(" ").toLowerCase();

  for (const [key, keywords] of Object.entries(SPORTS_SUB_KEYWORDS)) {
    if (keywords.some((kw) => text.includes(kw))) return key as SportsSubId;
  }
  return "all-sports";
}

export function sortByTrending<T extends { volume24h?: number; volume_24hr?: number; volume_num?: number; liquidity?: number; liquidity_num?: number }>(markets: T[]): T[] {
  return [...markets].sort((a, b) => {
    const aVol = a.volume24h ?? a.volume_24hr ?? a.volume_num ?? 0;
    const bVol = b.volume24h ?? b.volume_24hr ?? b.volume_num ?? 0;
    if (bVol !== aVol) return bVol - aVol;
    const aLiq = a.liquidity ?? a.liquidity_num ?? 0;
    const bLiq = b.liquidity ?? b.liquidity_num ?? 0;
    return bLiq - aLiq;
  });
}
