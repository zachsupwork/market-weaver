import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchPriceHistory, type PriceHistoryPoint } from "@/lib/polymarket-api";
import { useMarketStore } from "@/stores/useMarketStore";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip as ReTooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import type { NormalizedMarket } from "@/lib/normalizePolymarket";

type ChartRange = "1D" | "1W" | "1M" | "ALL";

interface EventPriceChartProps {
  /** The currently selected market to chart */
  market: NormalizedMarket;
  /** Optional: all markets for multi-line overlay */
  allMarkets?: NormalizedMarket[];
}

const RANGE_OPTIONS: { id: ChartRange; label: string }[] = [
  { id: "1D", label: "1D" },
  { id: "1W", label: "1W" },
  { id: "1M", label: "1M" },
  { id: "ALL", label: "All" },
];

const LINE_COLORS = [
  "hsl(var(--primary))",
  "hsl(142 71% 45%)",       // green
  "hsl(0 84% 60%)",          // red
  "hsl(48 96% 53%)",         // yellow
  "hsl(280 68% 60%)",        // purple
  "hsl(200 85% 55%)",        // cyan
];

export function EventPriceChart({ market, allMarkets }: EventPriceChartProps) {
  const [range, setRange] = useState<ChartRange>("1W");
  const [showMulti, setShowMulti] = useState(false);

  const yesTokenId = market.clobTokenIds?.[0] ?? "";

  // Fetch primary market history
  const { data: primaryHistory, isLoading } = useQuery({
    queryKey: ["event-chart-history", yesTokenId, range],
    queryFn: () => fetchPriceHistory(yesTokenId, range),
    enabled: !!yesTokenId,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  // For multi-line: fetch top 5 markets' histories
  const topMarkets = useMemo(
    () => (allMarkets ?? []).slice(0, 5),
    [allMarkets]
  );

  const multiTokenIds = useMemo(
    () => topMarkets.map((m) => m.clobTokenIds?.[0]).filter(Boolean) as string[],
    [topMarkets]
  );

  const { data: multiHistories } = useQuery({
    queryKey: ["event-chart-multi", multiTokenIds, range],
    queryFn: async () => {
      const results = await Promise.all(
        multiTokenIds.map((tid) => fetchPriceHistory(tid, range))
      );
      return results;
    },
    enabled: showMulti && multiTokenIds.length > 1,
    staleTime: 30_000,
  });

  // Get live price from WS
  const wsPrice = useMarketStore((s) => (yesTokenId ? s.assets[yesTokenId]?.lastTradePrice : null));
  const currentPrice = wsPrice ?? market.outcomePrices?.[0] ?? null;
  const currentPct = currentPrice != null ? Math.round(currentPrice * 100) : null;

  // Build chart data
  const chartData = useMemo(() => {
    if (showMulti && multiHistories && multiHistories.length > 1) {
      // Merge multi-market data by timestamp
      const timeMap = new Map<number, Record<string, number>>();

      multiHistories.forEach((history, idx) => {
        history.forEach((pt) => {
          const existing = timeMap.get(pt.t) ?? {};
          existing[`m${idx}`] = Math.round(pt.p * 100);
          timeMap.set(pt.t, existing);
        });
      });

      return [...timeMap.entries()]
        .sort(([a], [b]) => a - b)
        .map(([t, values]) => ({
          time: new Date(t * 1000).toLocaleString([], {
            month: "short",
            day: "numeric",
            ...(range === "1D" ? { hour: "2-digit", minute: "2-digit" } : {}),
          }),
          ...values,
        }));
    }

    if (!primaryHistory || primaryHistory.length === 0) return [];

    return primaryHistory.map((pt) => ({
      time: new Date(pt.t * 1000).toLocaleString([], {
        month: "short",
        day: "numeric",
        ...(range === "1D" ? { hour: "2-digit", minute: "2-digit" } : {}),
      }),
      price: Math.round(pt.p * 100),
    }));
  }, [primaryHistory, multiHistories, showMulti, range]);

  const hasMultiMarkets = (allMarkets?.length ?? 0) > 1;

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      {/* Chart header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">
            {showMulti ? "All Outcomes" : market.question}
          </span>
          <span className="text-lg font-mono font-bold text-primary">{currentPct}¢</span>
        </div>
        <div className="flex items-center gap-1">
          {hasMultiMarkets && (
            <button
              onClick={() => setShowMulti((v) => !v)}
              className={cn(
                "rounded-md px-2 py-1 text-[10px] font-medium transition-all mr-2",
                showMulti
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              )}
            >
              Multi
            </button>
          )}
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              onClick={() => setRange(opt.id)}
              className={cn(
                "rounded-md px-2 py-1 text-[10px] font-medium transition-all",
                range === opt.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      {isLoading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : chartData.length === 0 ? (
        <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
          No price history available
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
            <XAxis
              dataKey="time"
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              tickLine={false}
              axisLine={false}
              domain={[0, 100]}
              tickFormatter={(v) => `${v}¢`}
              width={35}
            />
            <ReTooltip
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "8px",
                fontSize: "12px",
              }}
              formatter={(value: number, name: string) => {
                if (showMulti && topMarkets.length > 0) {
                  const idx = parseInt(name.replace("m", ""), 10);
                  const label = topMarkets[idx]?.question?.slice(0, 30) ?? name;
                  return [`${value}¢`, label];
                }
                return [`${value}¢`, "Price"];
              }}
            />
            {showMulti && multiHistories ? (
              multiTokenIds.map((_, idx) => (
                <Line
                  key={`m${idx}`}
                  type="monotone"
                  dataKey={`m${idx}`}
                  stroke={LINE_COLORS[idx % LINE_COLORS.length]}
                  strokeWidth={1.5}
                  dot={false}
                  connectNulls
                />
              ))
            ) : (
              <Line
                type="monotone"
                dataKey="price"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={false}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      )}

      {/* Multi-line legend */}
      {showMulti && topMarkets.length > 1 && (
        <div className="flex flex-wrap gap-3 mt-2 px-1">
          {topMarkets.map((m, idx) => (
            <div key={m.condition_id} className="flex items-center gap-1.5">
              <span
                className="h-2 w-2 rounded-full shrink-0"
                style={{ backgroundColor: LINE_COLORS[idx % LINE_COLORS.length] }}
              />
              <span className="text-[10px] text-muted-foreground truncate max-w-[120px]">
                {m.question}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
