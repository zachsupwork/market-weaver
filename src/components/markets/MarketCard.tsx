import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import type { Market } from '@/types/market';
import { ResolutionStatus } from './ResolutionStatus';
import { TrendingUp, BarChart3 } from 'lucide-react';

interface MarketCardProps {
  market: Market;
}

function formatVolume(n: number): string {
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n}`;
}

export function MarketCard({ market }: MarketCardProps) {
  const yesOutcome = market.outcomes.find((o) => o.label === 'Yes');
  const isResolved = market.resolution.state === 'finalized';

  return (
    <Link
      to={`/market/${market.slug}`}
      className="group block rounded-xl border border-border bg-card p-5 transition-all hover:border-primary/30 hover:glow-primary animate-slide-in"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <h3 className="text-sm font-semibold leading-snug text-foreground group-hover:text-primary transition-colors line-clamp-2">
          {market.question}
        </h3>
        <ResolutionStatus state={market.resolution.state} compact />
      </div>

      <div className="flex items-center gap-4 mb-4">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Yes</span>
          <span className={cn('font-mono text-lg font-bold', isResolved && yesOutcome?.isWinner ? 'text-yes' : 'text-foreground')}>
            {yesOutcome ? `${Math.round(yesOutcome.price * 100)}¢` : '—'}
          </span>
        </div>
        {!isResolved && (
          <div className="h-6 w-px bg-border" />
        )}
        {!isResolved && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">No</span>
            <span className="font-mono text-lg font-bold text-foreground">
              {market.outcomes.find((o) => o.label === 'No') ? `${Math.round(market.outcomes.find((o) => o.label === 'No')!.price * 100)}¢` : '—'}
            </span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <TrendingUp className="h-3 w-3" />
          <span>{formatVolume(market.volume24h)} 24h</span>
        </div>
        <div className="flex items-center gap-1">
          <BarChart3 className="h-3 w-3" />
          <span>{formatVolume(market.totalVolume)} total</span>
        </div>
        <span className="ml-auto rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-secondary-foreground">
          {market.category}
        </span>
      </div>
    </Link>
  );
}
