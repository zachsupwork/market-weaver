import { useState, useEffect, useRef, useCallback } from "react";
import { fetchOrderbook, type Orderbook } from "@/lib/polymarket-api";

const WS_URL = "wss://ws-subscriptions-clob.polymarket.com/ws/market";

/**
 * @param tokenId - CLOB token ID to subscribe to
 * @param opts.wsEnabled - if false, only poll REST (default true). Set false on homepage to avoid WS storm.
 * @param opts.pollInterval - REST polling interval in ms (default 5000)
 */
export function useOrderbookWs(
  tokenId: string | undefined,
  opts?: { wsEnabled?: boolean; pollInterval?: number }
) {
  const wsEnabled = opts?.wsEnabled ?? true;
  const pollInterval = opts?.pollInterval ?? 5_000;

  const [book, setBook] = useState<Orderbook | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const pingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevBookRef = useRef<Orderbook | null>(null);
  const [changedPrices, setChangedPrices] = useState<Set<string>>(new Set());

  const fetchSnapshot = useCallback(async () => {
    if (!tokenId) return;
    try {
      const data = await fetchOrderbook(tokenId);
      if (data) setBook(data);
    } catch {
      // silent
    }
  }, [tokenId]);

  // Detect changed prices for flash animation
  useEffect(() => {
    if (!book || !prevBookRef.current) {
      prevBookRef.current = book;
      return;
    }
    const prev = prevBookRef.current;
    const changed = new Set<string>();

    const prevBidPrices = new Map(prev.bids?.map(b => [b.price, b.size]) || []);
    const prevAskPrices = new Map(prev.asks?.map(a => [a.price, a.size]) || []);

    book.bids?.forEach(b => {
      const prevSize = prevBidPrices.get(b.price);
      if (prevSize !== b.size) changed.add(`bid-${b.price}`);
    });
    book.asks?.forEach(a => {
      const prevSize = prevAskPrices.get(a.price);
      if (prevSize !== a.size) changed.add(`ask-${a.price}`);
    });

    if (changed.size > 0) {
      setChangedPrices(changed);
      const timer = setTimeout(() => setChangedPrices(new Set()), 600);
      prevBookRef.current = book;
      return () => clearTimeout(timer);
    }
    prevBookRef.current = book;
  }, [book]);

  // Initial snapshot
  useEffect(() => {
    fetchSnapshot();
  }, [fetchSnapshot]);

  // REST-only polling mode (for homepage cards to avoid WS storm)
  useEffect(() => {
    if (!tokenId || wsEnabled) return;
    const interval = setInterval(fetchSnapshot, pollInterval);
    return () => clearInterval(interval);
  }, [tokenId, wsEnabled, pollInterval, fetchSnapshot]);

  // WebSocket mode
  useEffect(() => {
    if (!tokenId || !wsEnabled) return;

    let ws: WebSocket;
    try {
      ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        setError(null);
        ws.send(JSON.stringify({ type: "subscribe", channel: "book", assets_ids: [tokenId] }));
        pingRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "ping" }));
        }, 30_000);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "pong") return;

          if (msg.type === "book" || msg.type === "book_snapshot") {
            if (msg.bids || msg.asks) {
              setBook(prev => ({
                bids: msg.bids || prev?.bids || [],
                asks: msg.asks || prev?.asks || [],
                asset_id: msg.asset_id || tokenId,
                hash: msg.hash || "",
                timestamp: msg.timestamp || new Date().toISOString(),
                market: msg.market || "",
              }));
            }
          }

          if (msg.type === "book_update" || msg.type === "price_change") {
            setBook(prev => {
              if (!prev) return prev;
              return {
                ...prev,
                bids: msg.bids || prev.bids,
                asks: msg.asks || prev.asks,
                timestamp: msg.timestamp || new Date().toISOString(),
              };
            });
          }
        } catch {
          // ignore
        }
      };

      ws.onerror = () => {
        setError("WebSocket error");
        setConnected(false);
      };

      ws.onclose = () => {
        setConnected(false);
        // Fallback to polling
        pollRef.current = setInterval(fetchSnapshot, pollInterval);
      };
    } catch {
      setError("Failed to connect");
      pollRef.current = setInterval(fetchSnapshot, pollInterval);
    }

    return () => {
      if (pingRef.current) clearInterval(pingRef.current);
      if (pollRef.current) clearInterval(pollRef.current);
      if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
    };
  }, [tokenId, wsEnabled, fetchSnapshot, pollInterval]);

  return { book, connected, error, changedPrices };
}
