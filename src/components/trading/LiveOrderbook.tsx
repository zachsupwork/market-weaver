import { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import { fetchOrderbook, type Orderbook, type OrderbookLevel } from "@/lib/polymarket-api";
import { Wifi, WifiOff } from "lucide-react";

interface LiveOrderbookProps {
  tokenId: string | undefined;
  outcome: string;
}

const WS_URL = "wss://ws-subscriptions-clob.polymarket.com/ws/market";

export function LiveOrderbook({ tokenId, outcome }: LiveOrderbookProps) {
  const [book, setBook] = useState<Orderbook | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [wsError, setWsError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fallbackIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch initial snapshot via REST
  const fetchSnapshot = useCallback(async () => {
    if (!tokenId) return;
    try {
      const data = await fetchOrderbook(tokenId);
      if (data) setBook(data);
    } catch (e) {
      console.warn("[LiveOrderbook] REST fallback error:", e);
    }
  }, [tokenId]);

  useEffect(() => {
    fetchSnapshot();
  }, [fetchSnapshot]);

  // WebSocket connection
  useEffect(() => {
    if (!tokenId) return;

    let ws: WebSocket;
    try {
      ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsConnected(true);
        setWsError(null);
        // Subscribe to the token's orderbook
        ws.send(JSON.stringify({
          type: "subscribe",
          channel: "book",
          assets_ids: [tokenId],
        }));

        // Keepalive: send ping every 30s
        pingIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "ping" }));
          }
        }, 30_000);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);

          // Handle pong (no-op, just keepalive acknowledgment)
          if (msg.type === "pong") return;

          // Handle book snapshot or update
          if (msg.type === "book" || msg.type === "book_snapshot") {
            if (msg.bids || msg.asks) {
              setBook((prev) => ({
                bids: msg.bids || prev?.bids || [],
                asks: msg.asks || prev?.asks || [],
                asset_id: msg.asset_id || tokenId,
                hash: msg.hash || "",
                timestamp: msg.timestamp || new Date().toISOString(),
                market: msg.market || "",
              }));
            }
          }

          // Handle incremental updates
          if (msg.type === "book_update" || msg.type === "price_change") {
            setBook((prev) => {
              if (!prev) return prev;
              const newBook = { ...prev };
              if (msg.bids) newBook.bids = msg.bids;
              if (msg.asks) newBook.asks = msg.asks;
              newBook.timestamp = msg.timestamp || new Date().toISOString();
              return newBook;
            });
          }
        } catch {
          // Ignore malformed messages
        }
      };

      ws.onerror = () => {
        setWsError("WebSocket error — falling back to polling");
        setWsConnected(false);
      };

      ws.onclose = () => {
        setWsConnected(false);
        // Start polling fallback
        fallbackIntervalRef.current = setInterval(fetchSnapshot, 10_000);
      };
    } catch (e) {
      setWsError("Failed to connect WebSocket");
      // Fallback to polling
      fallbackIntervalRef.current = setInterval(fetchSnapshot, 10_000);
    }

    return () => {
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      if (fallbackIntervalRef.current) clearInterval(fallbackIntervalRef.current);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [tokenId, fetchSnapshot]);

  if (!book) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          Orderbook — {outcome}
          <Wifi className="h-3 w-3 text-muted-foreground animate-pulse" />
        </h3>
        <div className="space-y-1">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-5 rounded bg-muted animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const asks = (book.asks || []).slice(0, 8).reverse();
  const bids = (book.bids || []).slice(0, 8);
  const maxSize = Math.max(
    ...asks.map((a) => parseFloat(a.size)),
    ...bids.map((b) => parseFloat(b.size)),
    1
  );

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
        Orderbook — {outcome}
        {wsConnected ? (
          <span className="flex items-center gap-1 text-[10px] text-yes">
            <Wifi className="h-3 w-3" /> Live
          </span>
        ) : (
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <WifiOff className="h-3 w-3" /> Polling
          </span>
        )}
      </h3>

      {wsError && (
        <p className="text-[10px] text-destructive mb-2">{wsError}</p>
      )}

      <div className="grid grid-cols-2 text-[10px] text-muted-foreground font-mono mb-1 px-1">
        <span>Price</span>
        <span className="text-right">Size</span>
      </div>

      <div className="space-y-px mb-1">
        {asks.map((level, i) => {
          const pct = (parseFloat(level.size) / maxSize) * 100;
          return (
            <div key={`ask-${i}`} className="relative flex justify-between px-1 py-0.5 text-xs font-mono">
              <div className="absolute inset-y-0 right-0 bg-no/10 rounded-sm" style={{ width: `${pct}%` }} />
              <span className="relative text-no">{parseFloat(level.price).toFixed(2)}</span>
              <span className="relative text-muted-foreground">{parseFloat(level.size).toFixed(1)}</span>
            </div>
          );
        })}
      </div>

      {asks.length > 0 && bids.length > 0 && (
        <div className="text-center text-[10px] text-muted-foreground py-1 border-y border-border my-1">
          Spread: {(parseFloat(asks[asks.length - 1]?.price || "0") - parseFloat(bids[0]?.price || "0")).toFixed(3)}
        </div>
      )}

      <div className="space-y-px">
        {bids.map((level, i) => {
          const pct = (parseFloat(level.size) / maxSize) * 100;
          return (
            <div key={`bid-${i}`} className="relative flex justify-between px-1 py-0.5 text-xs font-mono">
              <div className="absolute inset-y-0 right-0 bg-yes/10 rounded-sm" style={{ width: `${pct}%` }} />
              <span className="relative text-yes">{parseFloat(level.price).toFixed(2)}</span>
              <span className="relative text-muted-foreground">{parseFloat(level.size).toFixed(1)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
