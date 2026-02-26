import { useQuery } from "@tanstack/react-query";
import { Trophy, Loader2, TrendingUp, BarChart3, ExternalLink, Medal } from "lucide-react";
import { cn } from "@/lib/utils";

interface LeaderboardEntry {
  name: string;
  address: string;
  profit: number;
  volume: number;
  positions: number;
  rank: number;
}

function formatVol(n: number): string {
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

const Leaderboard = () => {
  const { data: leaders, isLoading } = useQuery<LeaderboardEntry[]>({
    queryKey: ["polymarket-leaderboard"],
    queryFn: async () => {
      // Polymarket public leaderboard data
      const res = await fetch("https://data-api.polymarket.com/leaderboard?limit=50&window=all");
      if (!res.ok) throw new Error("Failed to fetch leaderboard");
      const data = await res.json();
      return data.map((entry: any, i: number) => ({
        name: entry.name || entry.username || `Trader ${i + 1}`,
        address: entry.address || entry.proxyWallet || "",
        profit: entry.profit || entry.pnl || 0,
        volume: entry.volume || 0,
        positions: entry.positions || entry.marketsTraded || 0,
        rank: i + 1,
      }));
    },
    staleTime: 60_000,
  });

  return (
    <div className="min-h-screen">
      <div className="container py-8 max-w-4xl">
        <div className="flex items-center gap-3 mb-6">
          <Trophy className="h-6 w-6 text-warning" />
          <h1 className="text-2xl font-bold">Leaderboard</h1>
        </div>
        <p className="text-sm text-muted-foreground mb-6">
          Top prediction market traders ranked by profit.
        </p>

        {isLoading && (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {leaders && leaders.length > 0 && (
          <div className="space-y-2">
            {/* Header */}
            <div className="grid grid-cols-12 gap-2 px-4 py-2 text-xs font-medium text-muted-foreground">
              <div className="col-span-1">#</div>
              <div className="col-span-4">Trader</div>
              <div className="col-span-3 text-right">Profit</div>
              <div className="col-span-2 text-right hidden sm:block">Volume</div>
              <div className="col-span-2 text-right hidden sm:block">Markets</div>
            </div>

            {leaders.map((entry) => (
              <div
                key={entry.address || entry.rank}
                className={cn(
                  "grid grid-cols-12 gap-2 items-center rounded-lg border border-border bg-card px-4 py-3 transition-all hover:border-primary/20",
                  entry.rank <= 3 && "border-warning/20 bg-warning/5"
                )}
              >
                <div className="col-span-1">
                  {entry.rank <= 3 ? (
                    <Medal className={cn(
                      "h-5 w-5",
                      entry.rank === 1 ? "text-warning" : entry.rank === 2 ? "text-muted-foreground" : "text-warning/60"
                    )} />
                  ) : (
                    <span className="text-sm font-mono text-muted-foreground">{entry.rank}</span>
                  )}
                </div>
                <div className="col-span-4">
                  <p className="text-sm font-semibold truncate">{entry.name}</p>
                  {entry.address && (
                    <a
                      href={`https://polygonscan.com/address/${entry.address}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] font-mono text-muted-foreground hover:text-primary flex items-center gap-0.5"
                    >
                      {entry.address.slice(0, 6)}...{entry.address.slice(-4)}
                      <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  )}
                </div>
                <div className="col-span-3 text-right">
                  <span className={cn(
                    "font-mono text-sm font-bold",
                    entry.profit >= 0 ? "text-yes" : "text-no"
                  )}>
                    {entry.profit >= 0 ? "+" : ""}{formatVol(entry.profit)}
                  </span>
                </div>
                <div className="col-span-2 text-right hidden sm:block">
                  <span className="font-mono text-xs text-muted-foreground">{formatVol(entry.volume)}</span>
                </div>
                <div className="col-span-2 text-right hidden sm:block">
                  <span className="font-mono text-xs text-muted-foreground">{entry.positions}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {leaders && leaders.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <Trophy className="h-10 w-10 mx-auto mb-3 opacity-50" />
            <p className="text-sm">No leaderboard data available.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Leaderboard;
