import { usePositions } from "@/hooks/usePositions";
import { PositionCard } from "@/components/trading/PositionCard";
import { Wallet, AlertCircle, Loader2 } from "lucide-react";

const Portfolio = () => {
  const { data, isLoading, error } = usePositions();

  return (
    <div className="min-h-screen">
      <div className="container py-8 max-w-4xl">
        <div className="flex items-center gap-3 mb-6">
          <Wallet className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Portfolio</h1>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-destructive">Failed to load positions</p>
              <p className="text-xs text-muted-foreground mt-1">{(error as Error).message}</p>
            </div>
          </div>
        )}

        {data && !data.ok && (
          <div className="rounded-lg border border-warning/30 bg-warning/5 p-4">
            <p className="text-sm text-warning font-semibold">⚠ {data.error}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Go to <a href="/settings/polymarket" className="text-primary hover:underline">API Keys</a> to set up real credentials.
            </p>
          </div>
        )}

        {data?.ok && data.positions && (
          <>
            {data.positions.length === 0 ? (
              <div className="text-center py-16">
                <Wallet className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No open positions</p>
              </div>
            ) : (
              <div className="grid gap-3">
                {data.positions.map((pos: any, i: number) => (
                  <PositionCard key={pos.condition_id || i} position={pos} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default Portfolio;
