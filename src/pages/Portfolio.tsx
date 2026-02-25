import { usePositions } from "@/hooks/usePositions";
import { PositionCard } from "@/components/trading/PositionCard";
import { Wallet, AlertCircle, Loader2 } from "lucide-react";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";

const Portfolio = () => {
  const { isConnected, address } = useAccount();
  const { data: positions, isLoading, error } = usePositions();

  return (
    <div className="min-h-screen">
      <div className="container py-8 max-w-4xl">
        <div className="flex items-center gap-3 mb-6">
          <Wallet className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Portfolio</h1>
          {address && (
            <span className="text-xs font-mono text-muted-foreground bg-secondary px-2 py-0.5 rounded">
              {address.slice(0, 6)}...{address.slice(-4)}
            </span>
          )}
        </div>

        {!isConnected && (
          <div className="text-center py-16">
            <Wallet className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-sm text-muted-foreground mb-4">Connect your wallet to view positions</p>
            <ConnectButton />
          </div>
        )}

        {isConnected && isLoading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {isConnected && error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-destructive">Failed to load positions</p>
              <p className="text-xs text-muted-foreground mt-1">{(error as Error).message}</p>
            </div>
          </div>
        )}

        {isConnected && positions && (
          <>
            {positions.length === 0 ? (
              <div className="text-center py-16">
                <Wallet className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No open positions</p>
              </div>
            ) : (
              <div className="grid gap-3">
                {positions.map((pos: any, i: number) => (
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
