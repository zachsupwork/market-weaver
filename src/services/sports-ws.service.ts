/**
 * Sports WebSocket Service
 * Connects to wss://sports-api.polymarket.com/ws for live game scores.
 * No authentication or subscription message required.
 */
import { useLiveDataStore } from "@/stores/useLiveDataStore";

const WS_URL = "wss://sports-api.polymarket.com/ws";

class SportsWsService {
  private socket: WebSocket | null = null;
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
        if (import.meta.env.DEV) console.info("[SportsWS] connected");
      };

      this.socket.onmessage = (event) => {
        // Heartbeat: server sends "ping", respond with "pong"
        if (event.data === "ping") {
          this.socket?.send("pong");
          return;
        }

        try {
          const msg = JSON.parse(event.data);
          this.handleMessage(msg);
        } catch {
          // ignore malformed
        }
      };

      this.socket.onerror = () => {
        this.connected = false;
        if (import.meta.env.DEV) console.warn("[SportsWS] error");
      };

      this.socket.onclose = () => {
        this.connected = false;
        if (import.meta.env.DEV) console.warn("[SportsWS] disconnected");
        if (this.refCount > 0) this.scheduleReconnect();
      };
    } catch {
      this.connected = false;
      if (this.refCount > 0) this.scheduleReconnect();
    }
  }

  private handleMessage(msg: any) {
    if (!msg || !msg.slug) return;

    // sport_result message
    const store = useLiveDataStore.getState();
    store.setSportsScore(msg.slug, {
      gameId: msg.gameId,
      league: msg.leagueAbbreviation || "",
      slug: msg.slug,
      homeTeam: msg.homeTeam || "",
      awayTeam: msg.awayTeam || "",
      score: msg.score || "",
      status: msg.status || "",
      period: msg.period || "",
      elapsed: msg.elapsed || "",
      live: !!msg.live,
      ended: !!msg.ended,
    });
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

export const sportsWsService = new SportsWsService();
