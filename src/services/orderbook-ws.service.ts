import type { Orderbook } from "@/lib/polymarket-api";

const WS_URL = "wss://ws-subscriptions-clob.polymarket.com/ws/market";

type BookListener = (book: Orderbook) => void;
type ConnectionListener = (connected: boolean) => void;

const MARKET_EVENT_TYPES = new Set([
  "book",
  "book_snapshot",
  "book_update",
  "price_change",
  "best_bid_ask",
  "last_trade_price",
]);

function toIsoTimestamp(raw: unknown): string {
  if (raw === null || raw === undefined || raw === "") return new Date().toISOString();
  const n = Number(raw);
  if (!Number.isNaN(n)) {
    const ms = n < 1e12 ? n * 1000 : n;
    const d = new Date(ms);
    if (!Number.isNaN(d.getTime()) && d.getFullYear() > 2000) return d.toISOString();
  }
  const d = new Date(String(raw));
  if (!Number.isNaN(d.getTime()) && d.getFullYear() > 2000) return d.toISOString();
  return new Date().toISOString();
}

class OrderbookWsService {
  private socket: WebSocket | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private healthTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private connected = false;
  private lastEventAt = 0;

  private books = new Map<string, Orderbook>();
  private listeners = new Map<string, Set<BookListener>>();
  private subscribedAssets = new Set<string>();
  private connectionListeners = new Set<ConnectionListener>();

  isConnected() {
    return this.connected;
  }

  preconnect() {
    this.ensureConnected();
  }

  subscribe(assetId: string, listener: BookListener) {
    if (!assetId) return () => {};

    const current = this.listeners.get(assetId) ?? new Set<BookListener>();
    current.add(listener);
    this.listeners.set(assetId, current);
    this.subscribedAssets.add(assetId);

    const cached = this.books.get(assetId);
    if (cached) listener(cached);

    this.ensureConnected();
    this.sendMarketSubscription();

    return () => {
      const set = this.listeners.get(assetId);
      if (!set) return;

      set.delete(listener);
      if (set.size === 0) {
        this.listeners.delete(assetId);
        this.subscribedAssets.delete(assetId);
        this.sendMarketSubscription();
      }

      if (this.listeners.size === 0) this.cleanupSocket();
    };
  }

  onConnectionChange(listener: ConnectionListener) {
    this.connectionListeners.add(listener);
    listener(this.connected);
    return () => {
      this.connectionListeners.delete(listener);
    };
  }

  private ensureConnected() {
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    try {
      this.socket = new WebSocket(WS_URL);

      this.socket.onopen = () => {
        this.connected = true;
        this.lastEventAt = Date.now();
        this.reconnectAttempts = 0;
        this.emitConnection();
        this.sendMarketSubscription();
        this.startPing();
        this.startHealthMonitor();

        if (import.meta.env.DEV) {
          console.info("[OrderbookWS] connected", { assets: this.subscribedAssets.size });
        }
      };

      this.socket.onmessage = (event) => {
        this.lastEventAt = Date.now();

        try {
          const payload = JSON.parse(event.data);
          if (Array.isArray(payload)) {
            if (payload.length === 0) return;
            payload.forEach((msg) => this.handleMessage(msg));
            return;
          }
          this.handleMessage(payload);
        } catch {
          // Ignore malformed payloads
        }
      };

      this.socket.onerror = () => {
        this.connected = false;
        this.emitConnection();
        if (import.meta.env.DEV) {
          console.warn("[OrderbookWS] error");
        }
      };

      this.socket.onclose = () => {
        this.connected = false;
        this.emitConnection();
        this.clearRuntimeTimers();
        if (import.meta.env.DEV) {
          console.warn("[OrderbookWS] disconnected");
        }
        this.scheduleReconnect();
      };
    } catch {
      this.connected = false;
      this.emitConnection();
      this.scheduleReconnect();
    }
  }

  private handleMessage(msg: any) {
    if (!msg) return;

    const eventType = String(msg.event_type || msg.type || "").toLowerCase();
    if (!eventType || eventType === "pong" || eventType === "ping") return;
    if (!MARKET_EVENT_TYPES.has(eventType)) return;

    let assetId = msg.asset_id || msg.assetId || msg.asset || msg.token_id;
    if (!assetId && this.subscribedAssets.size === 1) {
      assetId = [...this.subscribedAssets][0];
    }
    if (!assetId) return;

    const prev = this.books.get(assetId);

    const next: Orderbook = {
      bids: Array.isArray(msg.bids) ? msg.bids : prev?.bids || [],
      asks: Array.isArray(msg.asks) ? msg.asks : prev?.asks || [],
      asset_id: String(assetId),
      hash: String(msg.hash || prev?.hash || ""),
      timestamp: toIsoTimestamp(msg.timestamp || msg.ts || msg.time || msg.updated_at || prev?.timestamp),
      market: String(msg.market || prev?.market || ""),
    };

    this.books.set(assetId, next);

    if (import.meta.env.DEV) {
      console.debug("[OrderbookWS]", eventType, assetId, next.timestamp);
    }

    const listeners = this.listeners.get(assetId);
    listeners?.forEach((listener) => listener(next));
  }

  private sendMarketSubscription() {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;

    const assets = [...this.subscribedAssets];
    if (assets.length === 0) return;

    this.socket.send(
      JSON.stringify({
        type: "market",
        assets_ids: assets,
        custom_feature_enabled: true,
      })
    );

    if (import.meta.env.DEV) {
      console.debug("[OrderbookWS] subscribed", assets.length);
    }
  }

  private startPing() {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = setInterval(() => {
      if (this.socket?.readyState === WebSocket.OPEN) {
        this.socket.send(JSON.stringify({ type: "ping" }));
      }
    }, 30_000);
  }

  private startHealthMonitor() {
    if (this.healthTimer) clearInterval(this.healthTimer);
    this.healthTimer = setInterval(() => {
      if (!this.connected || this.listeners.size === 0) return;
      if (Date.now() - this.lastEventAt < 15_000) return;

      if (import.meta.env.DEV) {
        console.warn("[OrderbookWS] stale stream detected, reconnecting");
      }
      this.forceReconnect();
    }, 5_000);
  }

  private forceReconnect() {
    this.clearRuntimeTimers();

    if (this.socket) {
      try {
        this.socket.close();
      } catch {
        // ignore close errors
      }
      this.socket = null;
    }

    this.connected = false;
    this.emitConnection();
    this.scheduleReconnect();
  }

  private emitConnection() {
    this.connectionListeners.forEach((listener) => listener(this.connected));
  }

  private clearRuntimeTimers() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    if (this.healthTimer) {
      clearInterval(this.healthTimer);
      this.healthTimer = null;
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer || this.listeners.size === 0) return;

    const delay = Math.min(8_000, 500 * 2 ** this.reconnectAttempts);
    this.reconnectAttempts += 1;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.ensureConnected();
    }, delay);
  }

  private cleanupSocket() {
    this.clearRuntimeTimers();

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }

    this.connected = false;
    this.emitConnection();
  }
}

export const orderbookWsService = new OrderbookWsService();
