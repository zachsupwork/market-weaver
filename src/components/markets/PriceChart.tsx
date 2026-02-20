import { useMemo } from 'react';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { PricePoint } from '@/types/market';

interface PriceChartProps {
  data: PricePoint[];
  height?: number;
}

export function PriceChart({ data, height = 300 }: PriceChartProps) {
  const chartData = useMemo(
    () =>
      data.map((p) => ({
        time: new Date(p.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        yes: p.yesPrice,
        no: p.noPrice,
        volume: p.volume,
      })),
    [data]
  );

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="text-sm font-medium text-muted-foreground mb-4">Price History</h3>
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id="yesGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(142, 71%, 45%)" stopOpacity={0.3} />
              <stop offset="100%" stopColor="hsl(142, 71%, 45%)" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="noGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(0, 84%, 60%)" stopOpacity={0.15} />
              <stop offset="100%" stopColor="hsl(0, 84%, 60%)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="time"
            axisLine={false}
            tickLine={false}
            tick={{ fill: 'hsl(215, 15%, 55%)', fontSize: 11 }}
            interval="preserveStartEnd"
          />
          <YAxis
            domain={[0, 1]}
            axisLine={false}
            tickLine={false}
            tick={{ fill: 'hsl(215, 15%, 55%)', fontSize: 11 }}
            tickFormatter={(v: number) => `$${v.toFixed(2)}`}
            width={50}
          />
          <Tooltip
            contentStyle={{
              background: 'hsl(220, 18%, 12%)',
              border: '1px solid hsl(220, 14%, 18%)',
              borderRadius: '8px',
              fontSize: '12px',
              color: 'hsl(210, 20%, 92%)',
            }}
            formatter={(value: number, name: string) => [
              `$${value.toFixed(2)}`,
              name === 'yes' ? 'Yes' : 'No',
            ]}
          />
          <Area type="monotone" dataKey="yes" stroke="hsl(142, 71%, 45%)" fill="url(#yesGrad)" strokeWidth={2} />
          <Area type="monotone" dataKey="no" stroke="hsl(0, 84%, 60%)" fill="url(#noGrad)" strokeWidth={1.5} strokeDasharray="4 2" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
