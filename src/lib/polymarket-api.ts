// Polymarket API client - uses edge function proxies for CORS

import { normalizeMarket, normalizeMarkets, isBytes32Hex, isEndedByPrices, type NormalizedMarket, type MarketStatusLabel } from "./normalizePolymarket";
import { supabase } from "@/integrations/supabase/client";

const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID;

function fnUrl(name: string) {
  return `https://${PROJECT_ID}.supabase.co/functions/v1/${name}`;
}

const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Re-export
export type { NormalizedMarket, MarketStatusLabel };
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

// ── Public market data (no auth required) ───────────────────────

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
  const data = normalizeMarkets(Array.isArray(raw) ? raw : []);
  return data.filter((m) => !!m.condition_id);
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
  if (!isBytes32Hex(conditionId)) {
    console.warn(`[PolyView] Invalid condition_id format: ${conditionId}`);
    return null;
  }

  const needle = conditionId.toLowerCase();

  try {
    const res = await fetch(`${fnUrl("polymarket-proxy-markets")}?condition_id=${encodeURIComponent(conditionId)}`, {
      headers: { "apikey": ANON_KEY },
    });
    if (res.ok) {
      const raw = await res.json();
      const list = normalizeMarkets(Array.isArray(raw) ? raw : [raw]);
      const match = list.find((m) => m.condition_id.toLowerCase() === needle);
      if (match) return match;
    }
  } catch (e) {
    console.warn("[PolyView] condition_id query failed:", e);
  }

  try {
    const res = await fetch(`${fnUrl("polymarket-proxy-markets")}?limit=200&offset=0&closed=false`, {
      headers: { "apikey": ANON_KEY },
    });
    if (res.ok) {
      const raw = await res.json();
      const list = normalizeMarkets(Array.isArray(raw) ? raw : []);
      const match = list.find((m) => m.condition_id.toLowerCase() === needle);
      if (match) return match;
    }
  } catch (e) {
    console.warn("[PolyView] Broad market search failed:", e);
  }

  console.warn(`[PolyView] Market not found for condition_id=${conditionId}`);
  return null;
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

export interface PriceHistoryPoint {
  t: number;
  p: number;
}

export async function fetchPriceHistory(
  tokenId: string,
  range: "1D" | "1W" | "1M" | "ALL" = "1W"
): Promise<PriceHistoryPoint[]> {
  const res = await fetch(
    `${fnUrl("polymarket-proxy-history")}?token_id=${encodeURIComponent(tokenId)}&range=${range}`,
    { headers: { "apikey": ANON_KEY } }
  );
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export async function fetchEventBySlug(slug: string): Promise<any | null> {
  const res = await fetch(
    `${fnUrl("polymarket-proxy-events")}?slug=${encodeURIComponent(slug)}`,
    { headers: { "apikey": ANON_KEY } }
  );
  if (!res.ok) return null;
  const raw = await res.json();
  if (Array.isArray(raw)) return raw[0] ?? null;
  return raw;
}

export async function fetchPositionsByAddress(address: string): Promise<any[]> {
  const res = await fetch(`${fnUrl("polymarket-positions")}?address=${encodeURIComponent(address)}`, {
    headers: { "apikey": ANON_KEY },
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "Failed to fetch positions");
  return data.positions || [];
}

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

// ── Per-user authenticated trading functions ────────────────────

/** Derive Polymarket API credentials via L1 EIP-712 signature */
export async function deriveApiCreds(params: {
  address: string;
  signature: string;
  timestamp: string;
  nonce: string;
}): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase.functions.invoke("polymarket-l1-derive-creds", {
    body: params,
  });
  if (error) return { ok: false, error: error.message };
  return data;
}

/** Check if current user has stored creds */
export async function checkUserCredsStatus(): Promise<{
  hasCreds: boolean;
  address?: string;
  updatedAt?: string;
}> {
  const { data, error } = await supabase.functions.invoke("polymarket-user-creds-status");
  if (error) return { hasCreds: false };
  return data;
}

/** Validate stored creds actually work against the CLOB (live check) */
export async function testUserCreds(): Promise<{
  valid: boolean;
  hasCreds: boolean;
  deleted?: boolean;
  reason?: string;
}> {
  const { data, error } = await supabase.functions.invoke("polymarket-test-creds");
  if (error) return { valid: false, hasCreds: false };
  return data;
}

/** Get deposit address for funding */
export async function createDepositAddress(address: string): Promise<{
  ok: boolean;
  deposit?: any;
  error?: string;
  upstreamStatus?: number;
  upstreamBody?: string;
}> {
  const { data, error } = await supabase.functions.invoke("polymarket-create-deposit-address", {
    body: { address },
  });
  if (error) return { ok: false, error: error.message };
  return data;
}

/** Submit a signed order to Polymarket via backend L2 auth proxy */
export async function postSignedOrder(
  signedOrder: any,
  orderType: "GTC" | "FOK" | "GTD" = "GTC"
): Promise<{
  ok: boolean;
  order?: any;
  error?: string;
  code?: string;
}> {
  const { data, error } = await supabase.functions.invoke("polymarket-post-signed-order", {
    body: { signedOrder, orderType },
  });
  if (error) return { ok: false, error: error.message };
  return data;
}

/** Cancel an order via backend */
export async function cancelOrder(orderId: string): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase.functions.invoke("polymarket-cancel-order", {
    body: { orderId },
  });
  if (error) return { ok: false, error: error.message };
  return data;
}

/** Check deposit status via bridge */
export async function fetchDepositStatus(address: string): Promise<{
  ok: boolean;
  status?: any;
  error?: string;
  upstreamStatus?: number;
  upstreamBody?: string;
}> {
  const res = await fetch(
    `${fnUrl("polymarket-deposit-status")}?address=${encodeURIComponent(address)}`,
    { headers: { "apikey": ANON_KEY } }
  );
  const data = await res.json();
  return data;
}

/** Fetch open orders for authenticated user */
export async function fetchOpenOrders(): Promise<{
  ok: boolean;
  orders?: any[];
  error?: string;
}> {
  const { data, error } = await supabase.functions.invoke("polymarket-orders");
  if (error) return { ok: false, error: error.message };
  return data;
}

/** Fetch trade history for a wallet address */
export async function fetchTradeHistory(address: string, limit = 100): Promise<any[]> {
  const res = await fetch(
    `${fnUrl("polymarket-proxy-trades")}?condition_id=all&limit=${limit}`,
    { headers: { "apikey": ANON_KEY } }
  );
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

/** Initiate a withdrawal via Bridge */
export async function initiateWithdrawal(params: {
  amount: string;
  destinationAddress: string;
  chain?: string;
}): Promise<{
  ok: boolean;
  withdrawal?: any;
  error?: string;
  upstreamStatus?: number;
  upstreamBody?: string;
}> {
  const { data, error } = await supabase.functions.invoke("polymarket-withdraw", {
    body: params,
  });
  if (error) return { ok: false, error: error.message };
  return data;
}

// Legacy placeOrder kept as alias for postSignedOrder
export async function placeOrder(params: {
  tokenId: string;
  side: "BUY" | "SELL";
  price: number;
  size: number;
  orderType?: string;
}): Promise<{ ok: boolean; order?: any; error?: string }> {
  return postSignedOrder(params);
}
