import { create } from "zustand";
import type { OrderbookLevel } from "@/lib/polymarket-api";

export interface RealtimeTrade {
  id: string;
  price: number;
  size: number;
  side: "BUY" | "SELL"; // BUY = YES, SELL = NO
  timestamp: number;
}

export interface AssetData {
  bestBid: number | null;
  bestAsk: number | null;
  lastTradePrice: number | null;
  bids: OrderbookLevel[];
  asks: OrderbookLevel[];
  /** Most recent trades for animation (capped at 20) */
  recentTrades: RealtimeTrade[];
  updatedAt: number;
}

interface MarketStoreState {
  assets: Record<string, AssetData>;

  /** Full book snapshot */
  setBook: (assetId: string, bids: OrderbookLevel[], asks: OrderbookLevel[]) => void;

  /** Incremental price_change updates */
  applyPriceChanges: (changes: Array<{ asset_id: string; price: string; size: string; side: string }>) => void;

  /** best_bid_ask event */
  setBestBidAsk: (assetId: string, bestBid: number | null, bestAsk: number | null) => void;

  /** last_trade_price event */
  addTrade: (assetId: string, trade: RealtimeTrade) => void;

  /** Consume (pop) the oldest trade for animation */
  consumeTrade: (assetId: string) => RealtimeTrade | undefined;
}

const emptyAsset = (): AssetData => ({
  bestBid: null,
  bestAsk: null,
  lastTradePrice: null,
  bids: [],
  asks: [],
  recentTrades: [],
  updatedAt: Date.now(),
});

function getOrCreate(assets: Record<string, AssetData>, id: string): AssetData {
  return assets[id] ?? emptyAsset();
}

export const useMarketStore = create<MarketStoreState>((set, get) => ({
  assets: {},

  setBook: (assetId, bids, asks) =>
    set((state) => ({
      assets: {
        ...state.assets,
        [assetId]: {
          ...getOrCreate(state.assets, assetId),
          bids,
          asks,
          updatedAt: Date.now(),
        },
      },
    })),

  applyPriceChanges: (changes) =>
    set((state) => {
      const next = { ...state.assets };

      for (const ch of changes) {
        const id = ch.asset_id;
        const asset = { ...getOrCreate(next, id) };
        const isBid = ch.side?.toUpperCase() === "BUY" || ch.side?.toLowerCase() === "bid";

        const levels = isBid ? [...asset.bids] : [...asset.asks];
        const idx = levels.findIndex((l) => l.price === ch.price);

        if (ch.size === "0" || parseFloat(ch.size) === 0) {
          // Remove level
          if (idx >= 0) levels.splice(idx, 1);
        } else if (idx >= 0) {
          // Update size
          levels[idx] = { price: ch.price, size: ch.size };
        } else {
          // Insert new level
          levels.push({ price: ch.price, size: ch.size });
        }

        if (isBid) asset.bids = levels;
        else asset.asks = levels;
        asset.updatedAt = Date.now();
        next[id] = asset;
      }

      return { assets: next };
    }),

  setBestBidAsk: (assetId, bestBid, bestAsk) =>
    set((state) => ({
      assets: {
        ...state.assets,
        [assetId]: {
          ...getOrCreate(state.assets, assetId),
          bestBid,
          bestAsk,
          updatedAt: Date.now(),
        },
      },
    })),

  addTrade: (assetId, trade) =>
    set((state) => {
      const asset = { ...getOrCreate(state.assets, assetId) };
      asset.lastTradePrice = trade.price;
      asset.recentTrades = [...asset.recentTrades, trade].slice(-20);
      asset.updatedAt = Date.now();
      return { assets: { ...state.assets, [assetId]: asset } };
    }),

  consumeTrade: (assetId) => {
    const asset = get().assets[assetId];
    if (!asset || asset.recentTrades.length === 0) return undefined;
    const [first, ...rest] = asset.recentTrades;
    set((state) => ({
      assets: {
        ...state.assets,
        [assetId]: { ...getOrCreate(state.assets, assetId), recentTrades: rest },
      },
    }));
    return first;
  },
}));
