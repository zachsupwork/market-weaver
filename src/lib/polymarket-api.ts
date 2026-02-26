// Polymarket API client - uses edge function proxies for CORS

import { normalizeMarket, normalizeMarkets, isBytes32Hex, type NormalizedMarket } from "./normalizePolymarket";

const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID;

function fnUrl(name: string) {
  return `https://${PROJECT_ID}.supabase.co/functions/v1/${name}`;
}

const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Re-export
export type { NormalizedMarket };
export { isBytes32Hex };
export type PolymarketMarket = NormalizedMarket;

export interface OrderbookLevel {
  price: string;
  size: string;
}

export interface Orderbook {
  bids: OrderbookLevel[];
  asks: OrderbookLevel[];
  asset_id: string;
  hash: string;
  timestamp: string;
  market: string;
}

export interface TradeRecord {
  id: string;
  timestamp: string;
  price: number;
  size: number;
  side: string;
  asset_id: string;
}

export interface Position {
  asset: string;
  condition_id: string;
  size: string;
  avgPrice: string;
  currentPrice: string;
  market: string;
  outcome: string;
  pnl: string;
}

export async function fetchMarkets(params?: {
  limit?: number;
  offset?: number;
  closed?: boolean;
  tag?: string;
  textQuery?: string;
}): Promise<NormalizedMarket[]> {
  const qs = new URLSearchParams();
  qs.set("limit", String(params?.limit ?? 50));
  qs.set("offset", String(params?.offset ?? 0));
  qs.set("closed", String(params?.closed ?? false));
  if (params?.tag) qs.set("tag", params.tag);
  if (params?.textQuery) qs.set("text", params.textQuery);

  const res = await fetch(`${fnUrl("polymarket-proxy-markets")}?${qs}`, {
    headers: { "apikey": ANON_KEY },
  });
  if (!res.ok) throw new Error(`Markets fetch failed: ${res.status}`);
  const raw = await res.json();

  // Normalize all markets
  const data = normalizeMarkets(Array.isArray(raw) ? raw : []);

  // Strict filter: only tradable markets
  return data.filter((m) => {
    if (m.closed) return false;
    if (m.archived) return false;
    if (m.active === false) return false;
    if (m.accepting_orders === false) return false;
    if (!m.condition_id) return false;
    return true;
  });
}

export async function fetchMarketBySlug(slug: string): Promise<NormalizedMarket | null> {
  const res = await fetch(`${fnUrl("polymarket-proxy-markets")}?slug=${encodeURIComponent(slug)}`, {
    headers: { "apikey": ANON_KEY },
  });
  if (!res.ok) return null;
  const raw = await res.json();
  const list = normalizeMarkets(Array.isArray(raw) ? raw : [raw]);
  return list.find((m) => m.slug === slug || m.market_slug === slug) ?? list[0] ?? null;
}

export async function fetchMarketByConditionId(conditionId: string): Promise<NormalizedMarket | null> {
  // Validate: must be bytes32 hex
  if (!isBytes32Hex(conditionId)) {
    console.warn(`[PolyView] Invalid condition_id format: ${conditionId}`);
    return null;
  }

  const res = await fetch(`${fnUrl("polymarket-proxy-markets")}?condition_id=${encodeURIComponent(conditionId)}`, {
    headers: { "apikey": ANON_KEY },
  });
  if (!res.ok) return null;
  const raw = await res.json();
  const list = normalizeMarkets(Array.isArray(raw) ? raw : [raw]);

  // Find the EXACT matching condition_id (case-insensitive hex comparison)
  const needle = conditionId.toLowerCase();
  const match = list.find((m) => m.condition_id.toLowerCase() === needle);
  if (!match) {
    // If no match by normalized condition_id, try first result if it's the only one
    if (list.length === 1) {
      console.warn(`[PolyView] Using single result for condition_id=${conditionId}`);
      return list[0];
    }
    console.warn(`[PolyView] No exact match for condition_id=${conditionId}, got ${list.length} results`);
    return null;
  }
  return match;
}

export async function fetchOrderbook(tokenId: string): Promise<Orderbook | null> {
  const res = await fetch(`${fnUrl("polymarket-proxy-orderbook")}?token_id=${encodeURIComponent(tokenId)}`, {
    headers: { "apikey": ANON_KEY },
  });
  if (!res.ok) return null;
  return res.json();
}

export async function fetchTrades(tokenId: string, limit = 50): Promise<TradeRecord[]> {
  const res = await fetch(
    `${fnUrl("polymarket-proxy-trades")}?token_id=${encodeURIComponent(tokenId)}&limit=${limit}`,
    { headers: { "apikey": ANON_KEY } }
  );
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export async function fetchPositionsByAddress(address: string): Promise<any[]> {
  const res = await fetch(`${fnUrl("polymarket-positions")}?address=${encodeURIComponent(address)}`, {
    headers: { "apikey": ANON_KEY },
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "Failed to fetch positions");
  return data.positions || [];
}

export async function placeOrder(params: {
  tokenId: string;
  side: "BUY" | "SELL";
  price: number;
  size: number;
  orderType?: string;
}): Promise<{ ok: boolean; order?: any; error?: string }> {
  const res = await fetch(fnUrl("polymarket-place-order"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": ANON_KEY,
    },
    body: JSON.stringify(params),
  });
  return res.json();
}

export async function cancelOrder(orderId: string): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(fnUrl("polymarket-cancel-order"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": ANON_KEY,
    },
    body: JSON.stringify({ orderId }),
  });
  return res.json();
}

// Events API
export async function fetchEvents(params?: {
  active?: boolean;
  keyword?: string;
  limit?: number;
  offset?: number;
}): Promise<any[]> {
  const qs = new URLSearchParams();
  if (params?.active !== undefined) qs.set("active", String(params.active));
  if (params?.keyword) qs.set("_q", params.keyword);
  qs.set("limit", String(params?.limit ?? 50));
  qs.set("offset", String(params?.offset ?? 0));
  qs.set("order", "volume");
  qs.set("ascending", "false");

  const res = await fetch(`${fnUrl("polymarket-proxy-events")}?${qs}`, {
    headers: { "apikey": ANON_KEY },
  });
  if (!res.ok) throw new Error(`Events fetch failed: ${res.status}`);
  const raw = await res.json();
  return Array.isArray(raw) ? raw : [];
}

export async function fetchEventById(eventId: string): Promise<any | null> {
  const res = await fetch(`${fnUrl("polymarket-proxy-events")}?id=${encodeURIComponent(eventId)}`, {
    headers: { "apikey": ANON_KEY },
  });
  if (!res.ok) return null;
  const raw = await res.json();
  if (Array.isArray(raw)) return raw[0] ?? null;
  return raw;
}
