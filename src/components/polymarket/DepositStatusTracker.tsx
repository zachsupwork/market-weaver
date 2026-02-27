import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, Square, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { fetchDepositStatus } from "@/lib/polymarket-api";

interface Props {
  address: string;
}

export function DepositStatusTracker({ address }: Props) {
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<any>(null);
  const [showDetails, setShowDetails] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { toast } = useToast();

  async function check() {
    setLoading(true);
    setError(null);
    setErrorDetails(null);
    try {
      const result = await fetchDepositStatus(address);
      if (result.ok) {
        setStatus(result.status);
        // Stop auto-refresh if complete
        if (result.status?.state === "complete" || result.status?.state === "failed") {
          setAutoRefresh(false);
        }
      } else {
        setError(result.error || "Unknown error");
        setErrorDetails(result);
        toast({
          title: "Status check failed",
          description: result.error || "Unknown error",
          variant: "destructive",
        });
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (autoRefresh) {
      check();
      intervalRef.current = setInterval(check, 12000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, address]);

  const stateColor = (state?: string) => {
    switch (state) {
      case "complete": return "bg-primary/20 text-primary border-primary/30";
      case "processing": return "bg-yellow-500/20 text-yellow-700 border-yellow-500/30";
      case "pending": return "bg-muted text-muted-foreground border-border";
      case "failed": return "bg-destructive/20 text-destructive border-destructive/30";
      default: return "bg-muted text-muted-foreground border-border";
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={check} disabled={loading}>
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
          Check Status
        </Button>
        <Button
          variant={autoRefresh ? "destructive" : "secondary"}
          size="sm"
          onClick={() => setAutoRefresh(!autoRefresh)}
        >
          {autoRefresh ? <><Square className="h-3.5 w-3.5 mr-1" /> Stop Auto-refresh</> : "Auto-refresh"}
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 space-y-2">
          <p className="text-xs text-destructive">{error}</p>
          {errorDetails && (
            <>
              <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => setShowDetails(!showDetails)}>
                {showDetails ? "Hide" : "Show"} Details
              </Button>
              {showDetails && (
                <pre className="text-[10px] text-muted-foreground overflow-x-auto whitespace-pre-wrap break-all">
                  {JSON.stringify(errorDetails, null, 2)}
                </pre>
              )}
            </>
          )}
        </div>
      )}

      {status && (
        <div className="rounded-md border border-border bg-muted/30 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Status:</span>
            <Badge className={stateColor(status.state || status.status)}>
              {status.state || status.status || "unknown"}
            </Badge>
          </div>

          {status.amount && (
            <p className="text-sm">Amount: <span className="font-mono">{status.amount} {status.asset || ""}</span></p>
          )}

          {status.txHash && (
            <a
              href={`https://polygonscan.com/tx/${status.txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary hover:underline inline-flex items-center gap-1"
            >
              View on Explorer <ExternalLink className="h-3 w-3" />
            </a>
          )}

          {/* Render all status fields */}
          {typeof status === "object" && (
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Raw response</summary>
              <pre className="mt-2 text-[10px] text-muted-foreground overflow-x-auto whitespace-pre-wrap break-all">
                {JSON.stringify(status, null, 2)}
              </pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
