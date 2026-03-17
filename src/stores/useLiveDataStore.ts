import { create } from "zustand";

export interface SportsScore {
  gameId: number;
  league: string;
  slug: string;
  homeTeam: string;
  awayTeam: string;
  score: string;
  status: string; // InProgress, Final, Scheduled, etc.
  period: string;
  elapsed: string;
  live: boolean;
  ended: boolean;
}

export interface CryptoPrice {
  symbol: string;   // e.g. "btcusdt" or "btc/usd"
  price: number;
  source: "binance" | "chainlink";
  timestamp: number;
}

interface LiveDataState {
  /** Keyed by event slug (e.g. "nfl-buf-kc-2025-01-26") */
  sportsScores: Record<string, SportsScore>;
  /** Keyed by symbol (e.g. "btcusdt", "eth/usd") */
  cryptoPrices: Record<string, CryptoPrice>;

  setSportsScore: (slug: string, score: SportsScore) => void;
  setCryptoPrice: (symbol: string, price: CryptoPrice) => void;

  /** Get sport score by matching slug substring in market question/tags */
  findScoreBySlug: (slug: string) => SportsScore | undefined;
  /** Get crypto price, trying both binance and chainlink symbols */
  getCryptoPrice: (baseSymbol: string) => CryptoPrice | undefined;
}

export const useLiveDataStore = create<LiveDataState>((set, get) => ({
  sportsScores: {},
  cryptoPrices: {},

  setSportsScore: (slug, score) =>
    set((state) => ({
      sportsScores: { ...state.sportsScores, [slug]: score },
    })),

  setCryptoPrice: (symbol, price) =>
    set((state) => ({
      cryptoPrices: { ...state.cryptoPrices, [symbol]: price },
    })),

  findScoreBySlug: (slug) => {
    return get().sportsScores[slug];
  },

  getCryptoPrice: (baseSymbol) => {
    const s = get().cryptoPrices;
    const lower = baseSymbol.toLowerCase();
    // Try binance format first (e.g. "btcusdt")
    const binanceKey = `${lower}usdt`;
    if (s[binanceKey]) return s[binanceKey];
    // Try chainlink format (e.g. "btc/usd")
    const chainlinkKey = `${lower}/usd`;
    if (s[chainlinkKey]) return s[chainlinkKey];
    // Direct match
    if (s[lower]) return s[lower];
    return undefined;
  },
}));
