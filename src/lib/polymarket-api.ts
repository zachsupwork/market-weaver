// Polymarket API client - uses edge function proxies for CORS

const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID;

function fnUrl(name: string) {
  return `https://${PROJECT_ID}.supabase.co/functions/v1/${name}`;
}

const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export interface PolymarketMarket {
  id: string;
  condition_id: string;
  question: string;
  description: string;
  market_slug: string;
  end_date_iso: string;
  game_start_time: string;
  tokens: Array<{
    token_id: string;
    outcome: string;
    price: number;
    winner: boolean;
  }>;
  volume: number;
  volume_num: number;
  volume_24hr: number;
  liquidity: number;
  liquidity_num: number;
  active: boolean;
  closed: boolean;
  archived: boolean;
  image: string;
  icon: string;
  category: string;
  tags: string[];
  slug: string;
  outcomes: string;
  outcome_prices: string;
  clob_token_ids: string;
  accepting_orders: boolean;
  accepting_order_timestamp: string;
}

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
}): Promise<PolymarketMarket[]> {
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
  const data: PolymarketMarket[] = await res.json();

  // Client-side filter: exclude non-tradable markets
  return data.filter((m) => {
    if (m.closed) return false;
    if (m.archived) return false;
    if (m.active === false) return false;
    if (m.accepting_orders === false) return false;
    return true;
  });
}

export async function fetchMarketBySlug(slug: string): Promise<PolymarketMarket | null> {
  const res = await fetch(`${fnUrl("polymarket-proxy-markets")}?slug=${encodeURIComponent(slug)}`, {
    headers: { "apikey": ANON_KEY },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return Array.isArray(data) ? data[0] ?? null : data;
}

export async function fetchOrderbook(tokenId: string): Promise<Orderbook | null> {
  const res = await fetch(`${fnUrl("polymarket-proxy-orderbook")}?token_id=${encodeURIComponent(tokenId)}`, {
    headers: { "apikey": ANON_KEY },
  });
  if (!res.ok) return null;
  return res.json();
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
