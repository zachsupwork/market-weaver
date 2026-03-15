import type { Orderbook } from "@/lib/polymarket-api";

const WS_URL = "wss://ws-subscriptions-clob.polymarket.com/ws/market";

type BookListener = (book: Orderbook) => void;
type ConnectionListener = (connected: boolean) => void;

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
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private connected = false;

  private books = new Map<string, Orderbook>();
  private listeners = new Map<string, Set<BookListener>>();
  private subscribedAssets = new Set<string>();
  private connectionListeners = new Set<ConnectionListener>();

  isConnected() {
    return this.connected;
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
    this.sendSubscribe(assetId);

    return () => {
      const set = this.listeners.get(assetId);
      if (!set) return;
      set.delete(listener);
      if (set.size === 0) {
        this.listeners.delete(assetId);
        this.subscribedAssets.delete(assetId);
        this.sendUnsubscribe(assetId);
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
        this.reconnectAttempts = 0;
        this.emitConnection();
        this.subscribedAssets.forEach((assetId) => this.sendSubscribe(assetId));

        if (this.pingTimer) clearInterval(this.pingTimer);
        this.pingTimer = setInterval(() => {
          if (this.socket?.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify({ type: "ping" }));
          }
        }, 30_000);
      };

      this.socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (Array.isArray(payload)) {
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
      };

      this.socket.onclose = () => {
        this.connected = false;
        this.emitConnection();
        this.scheduleReconnect();
      };
    } catch {
      this.connected = false;
      this.emitConnection();
      this.scheduleReconnect();
    }
  }

  private handleMessage(msg: any) {
    if (!msg || msg.type === "pong") return;

    if (
      msg.type !== "book" &&
      msg.type !== "book_snapshot" &&
      msg.type !== "book_update" &&
      msg.type !== "price_change"
    ) {
      return;
    }

    let assetId = msg.asset_id || msg.assetId || msg.asset;
    if (!assetId && this.subscribedAssets.size === 1) {
      assetId = [...this.subscribedAssets][0];
    }
    if (!assetId) return;

    const prev = this.books.get(assetId);
    const next: Orderbook = {
      bids: msg.bids || prev?.bids || [],
      asks: msg.asks || prev?.asks || [],
      asset_id: assetId,
      hash: String(msg.hash || prev?.hash || ""),
      timestamp: toIsoTimestamp(msg.timestamp || prev?.timestamp),
      market: String(msg.market || prev?.market || ""),
    };

    this.books.set(assetId, next);

    if (import.meta.env.DEV) {
      console.debug("[OrderbookWS]", msg.type, assetId, next.timestamp);
    }

    const listeners = this.listeners.get(assetId);
    listeners?.forEach((listener) => listener(next));
  }

  private sendSubscribe(assetId: string) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify({ type: "subscribe", channel: "book", assets_ids: [assetId] }));
  }

  private sendUnsubscribe(assetId: string) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify({ type: "unsubscribe", channel: "book", assets_ids: [assetId] }));
  }

  private emitConnection() {
    this.connectionListeners.forEach((listener) => listener(this.connected));
  }

  private scheduleReconnect() {
    if (this.reconnectTimer || this.listeners.size === 0) return;

    const delay = Math.min(15_000, 1_000 * 2 ** this.reconnectAttempts);
    this.reconnectAttempts += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.ensureConnected();
    }, delay);
  }

  private cleanupSocket() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
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
