import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Shield, RefreshCw, CheckCircle2, XCircle, Loader2, BarChart3, Trophy, Wallet, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface BuilderStats {
  ok: boolean;
  configured: boolean;
  builderKeyPrefix?: string;
  rewards?: any;
  rewardsError?: string;
  profile?: any;
  checkedAt?: string;
  error?: string;
}

export default function BuilderDashboard() {
  const [stats, setStats] = useState<BuilderStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function fetchStats() {
    setLoading(true);
    setError(null);
    try {
      const adminToken = localStorage.getItem("polyview_admin_token") || "";
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/polymarket-builder-stats`,
        {
          headers: {
            "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            "x-admin-token": adminToken,
          },
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || `HTTP ${res.status}`);
      } else {
        setStats(data);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchStats(); }, []);

  return (
    <div className="min-h-screen">
      <div className="container py-8 max-w-4xl">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <Trophy className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold">Builder Dashboard</h1>
          </div>
          <button
            onClick={fetchStats}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium hover:bg-accent transition-all disabled:opacity-50"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            Refresh
          </button>
        </div>

        {loading && !stats && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 mb-6">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        {stats && (
          <div className="space-y-6">
            {/* Configuration Status */}
            <div className="rounded-lg border border-border bg-card p-5">
              <h2 className="text-sm font-semibold mb-4 flex items-center gap-2">
                <Shield className="h-4 w-4 text-primary" />
                Builder Configuration
              </h2>
              <div className="grid gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Credentials Configured</span>
                  {stats.configured ? (
                    <span className="flex items-center gap-1 text-xs text-yes font-medium">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Yes
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-destructive font-medium">
                      <XCircle className="h-3.5 w-3.5" /> Not Set
                    </span>
                  )}
                </div>
                {stats.builderKeyPrefix && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">API Key</span>
                    <span className="font-mono text-xs text-foreground">{stats.builderKeyPrefix}</span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Headers on Orders</span>
                  <span className="flex items-center gap-1 text-xs text-yes font-medium">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Attached
                  </span>
                </div>
                {stats.checkedAt && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Last Checked</span>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {new Date(stats.checkedAt).toLocaleString()}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Rewards Data */}
            <div className="rounded-lg border border-border bg-card p-5">
              <h2 className="text-sm font-semibold mb-4 flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-primary" />
                Builder Rewards
              </h2>
              {stats.rewards ? (
                <pre className="text-xs font-mono bg-muted rounded-lg p-4 overflow-auto max-h-60 text-foreground">
                  {JSON.stringify(stats.rewards, null, 2)}
                </pre>
              ) : stats.rewardsError ? (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    Rewards endpoint not available yet. This is expected before builder approval.
                  </p>
                  <details className="text-[10px]">
                    <summary className="text-muted-foreground cursor-pointer hover:text-foreground">Technical details</summary>
                    <pre className="mt-1 font-mono bg-muted rounded p-2 overflow-auto text-muted-foreground">
                      {stats.rewardsError}
                    </pre>
                  </details>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No rewards data available.</p>
              )}
            </div>

            {/* Profile Data */}
            <div className="rounded-lg border border-border bg-card p-5">
              <h2 className="text-sm font-semibold mb-4 flex items-center gap-2">
                <Wallet className="h-4 w-4 text-primary" />
                Builder Profile
              </h2>
              {stats.profile ? (
                <pre className="text-xs font-mono bg-muted rounded-lg p-4 overflow-auto max-h-60 text-foreground">
                  {JSON.stringify(stats.profile, null, 2)}
                </pre>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Profile endpoint not available. Builder program approval may be pending.
                </p>
              )}
            </div>

            {/* Info callout */}
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
              <p className="text-xs text-muted-foreground">
                <strong className="text-foreground">How it works:</strong> Builder attribution headers (POLY_BUILDER_*) are automatically attached to every order submitted through PolyView. Once your builder application is approved by Polymarket, you'll earn a share of taker fees on all attributed volume.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
