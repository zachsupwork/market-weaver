import { useMemo } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

interface PriceChartProps {
  tokenId: string | undefined;
  outcome: string;
  currentPrice: number;
}

export function PriceChart({ tokenId, outcome, currentPrice }: PriceChartProps) {
  const isYes = outcome === "Yes";
  const color = isYes ? "hsl(142, 71%, 45%)" : "hsl(0, 84%, 60%)";

  // Generate simulated price history based on current price
  // In production, this would fetch from Polymarket's timeseries API
  const data = useMemo(() => {
    const points = [];
    let p = currentPrice;
    const now = Date.now();
    for (let i = 48; i >= 0; i--) {
      const noise = (Math.random() - 0.5) * 0.04;
      p = Math.max(0.01, Math.min(0.99, p + noise));
      points.push({
        time: new Date(now - i * 3600 * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        price: Math.round(p * 100),
      });
    }
    // Ensure last point matches current price
    points[points.length - 1].price = Math.round(currentPrice * 100);
    return points;
  }, [currentPrice, tokenId]);

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">Price Chart — {outcome}</h3>
        <span className="font-mono text-lg font-bold" style={{ color }}>
          {Math.round(currentPrice * 100)}¢
        </span>
      </div>
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id={`gradient-${outcome}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                <stop offset="95%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="time"
              tick={{ fontSize: 9, fill: "hsl(215, 15%, 55%)" }}
              tickLine={false}
              axisLine={false}
              interval={11}
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fontSize: 9, fill: "hsl(215, 15%, 55%)" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `${v}¢`}
            />
            <Tooltip
              contentStyle={{
                background: "hsl(220, 18%, 10%)",
                border: "1px solid hsl(220, 14%, 18%)",
                borderRadius: "6px",
                fontSize: "11px",
              }}
              formatter={(value: number) => [`${value}¢`, outcome]}
            />
            <Area
              type="monotone"
              dataKey="price"
              stroke={color}
              strokeWidth={2}
              fill={`url(#gradient-${outcome})`}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
