import { useState, useEffect, useRef, useCallback } from "react";
import { fetchOrderbook, type Orderbook } from "@/lib/polymarket-api";
import { orderbookWsService } from "@/services/orderbook-ws.service";

/**
 * @param tokenId - CLOB token ID to subscribe to
 * @param opts.wsEnabled - if false, only poll REST (default true)
 * @param opts.pollInterval - REST fallback polling interval in ms (default 1000)
 */
export function useOrderbookWs(
  tokenId: string | undefined,
  opts?: { wsEnabled?: boolean; pollInterval?: number }
) {
  const wsEnabled = opts?.wsEnabled ?? true;
  const pollInterval = opts?.pollInterval ?? 1_000;

  const [book, setBook] = useState<Orderbook | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const prevBookRef = useRef<Orderbook | null>(null);
  const [changedPrices, setChangedPrices] = useState<Set<string>>(new Set());

  const fetchSnapshot = useCallback(async () => {
    if (!tokenId) return;
    try {
      const data = await fetchOrderbook(tokenId);
      if (data) {
        setBook(data);
        if (!wsEnabled || connected) setError(null);
      }
    } catch {
      setError("Orderbook fetch failed");
    }
  }, [tokenId, wsEnabled, connected]);

  // Detect changed prices for flash animation
  useEffect(() => {
    if (!book || !prevBookRef.current) {
      prevBookRef.current = book;
      return;
    }
    const prev = prevBookRef.current;
    const changed = new Set<string>();

    const prevBidPrices = new Map(prev.bids?.map((b) => [b.price, b.size]) || []);
    const prevAskPrices = new Map(prev.asks?.map((a) => [a.price, a.size]) || []);

    book.bids?.forEach((b) => {
      const prevSize = prevBidPrices.get(b.price);
      if (prevSize !== b.size) changed.add(`bid-${b.price}`);
    });
    book.asks?.forEach((a) => {
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

  // Shared WebSocket subscription
  useEffect(() => {
    if (!tokenId || !wsEnabled) {
      setConnected(false);
      if (!wsEnabled) setError(null);
      return;
    }

    const unsubBook = orderbookWsService.subscribe(tokenId, (next) => {
      setBook(next);
      setError(null);
    });

    const unsubConn = orderbookWsService.onConnectionChange((isConnected) => {
      setConnected(isConnected);
      if (!isConnected) {
        setError("WebSocket reconnecting — using 1s fallback");
      } else {
        setError(null);
      }
    });

    setConnected(orderbookWsService.isConnected());

    return () => {
      unsubBook();
      unsubConn();
    };
  }, [tokenId, wsEnabled]);

  // Fallback polling whenever WS is disabled or temporarily disconnected
  useEffect(() => {
    if (!tokenId) return;
    if (wsEnabled && connected) return;

    const interval = setInterval(fetchSnapshot, pollInterval);
    return () => clearInterval(interval);
  }, [tokenId, wsEnabled, connected, pollInterval, fetchSnapshot]);

  return { book, connected, error, changedPrices };
}
