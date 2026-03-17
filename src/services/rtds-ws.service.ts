/**
 * RTDS (Real-Time Data Socket) Service
 * Connects to wss://ws-live-data.polymarket.com for live crypto prices.
 * Subscribes to crypto_prices (Binance) topic.
 */
import { useLiveDataStore } from "@/stores/useLiveDataStore";

const WS_URL = "wss://ws-live-data.polymarket.com";
const PING_INTERVAL = 5_000;

class RtdsWsService {
  private socket: WebSocket | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private connected = false;
  private refCount = 0;

  connect() {
    this.refCount++;
    if (this.refCount === 1) this.ensureConnected();
  }

  disconnect() {
    this.refCount = Math.max(0, this.refCount - 1);
    if (this.refCount === 0) this.cleanup();
  }

  isConnected() {
    return this.connected;
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
        if (import.meta.env.DEV) console.info("[RTDS] connected");
        this.subscribe();
        this.startPing();
      };

      this.socket.onmessage = (event) => {
        if (event.data === "PONG" || event.data === "pong") return;

        try {
          const msg = JSON.parse(event.data);
          this.handleMessage(msg);
        } catch {
          // ignore
        }
      };

      this.socket.onerror = () => {
        this.connected = false;
        if (import.meta.env.DEV) console.warn("[RTDS] error");
      };

      this.socket.onclose = () => {
        this.connected = false;
        this.stopPing();
        if (import.meta.env.DEV) console.warn("[RTDS] disconnected");
        if (this.refCount > 0) this.scheduleReconnect();
      };
    } catch {
      this.connected = false;
      if (this.refCount > 0) this.scheduleReconnect();
    }
  }

  private subscribe() {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;

    // Subscribe to Binance crypto prices (all symbols)
    this.socket.send(JSON.stringify({
      action: "subscribe",
      subscriptions: [
        { topic: "crypto_prices", type: "update" },
        { topic: "crypto_prices_chainlink", type: "*", filters: "" },
      ],
    }));
  }

  private handleMessage(msg: any) {
    if (!msg || !msg.topic || !msg.payload) return;

    const store = useLiveDataStore.getState();

    if (msg.topic === "crypto_prices" || msg.topic === "crypto_prices_chainlink") {
      const { symbol, value, timestamp } = msg.payload;
      if (symbol && typeof value === "number") {
        store.setCryptoPrice(symbol.toLowerCase(), {
          symbol: symbol.toLowerCase(),
          price: value,
          source: msg.topic === "crypto_prices" ? "binance" : "chainlink",
          timestamp: timestamp || Date.now(),
        });
      }
    }
  }

  private startPing() {
    this.stopPing();
    this.pingTimer = setInterval(() => {
      if (this.socket?.readyState === WebSocket.OPEN) {
        this.socket.send("PING");
      }
    }, PING_INTERVAL);
  }

  private stopPing() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    const delay = Math.min(10_000, 500 * 2 ** this.reconnectAttempts);
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.ensureConnected();
    }, delay);
  }

  private cleanup() {
    this.stopPing();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.connected = false;
  }
}

export const rtdsWsService = new RtdsWsService();
