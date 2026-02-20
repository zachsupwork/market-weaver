import { cn } from '@/lib/utils';
import type { Outcome } from '@/types/market';
import { Trophy } from 'lucide-react';

interface OutcomeCardProps {
  outcome: Outcome;
  isResolved: boolean;
}

export function OutcomeCard({ outcome, isResolved }: OutcomeCardProps) {
  const isYes = outcome.label === 'Yes';
  const probability = Math.round(outcome.price * 100);

  return (
    <div
      className={cn(
        'relative rounded-lg border p-4 transition-all',
        outcome.isWinner === true && 'glow-yes border-yes/40',
        outcome.isWinner === false && 'border-border opacity-50',
        outcome.isWinner === null && isYes && 'border-yes/20 hover:border-yes/40',
        outcome.isWinner === null && !isYes && 'border-no/20 hover:border-no/40',
        'bg-card'
      )}
    >
      {outcome.isWinner === true && (
        <div className="absolute -top-2.5 -right-2.5 flex items-center gap-1 rounded-full bg-yes px-2 py-0.5 text-xs font-bold text-yes-foreground">
          <Trophy className="h-3 w-3" /> Winner
        </div>
      )}

      <div className="flex items-center justify-between mb-3">
        <span className={cn('text-sm font-semibold', isYes ? 'text-yes' : 'text-no')}>
          {outcome.label}
        </span>
        <span className="font-mono text-2xl font-bold text-foreground">
          ${outcome.price.toFixed(2)}
        </span>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Implied probability</span>
          <span className="font-mono">{probability}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all duration-700', isYes ? 'bg-yes' : 'bg-no')}
            style={{ width: `${probability}%` }}
          />
        </div>
      </div>

      {!isResolved && (
        <button
          className={cn(
            'mt-3 w-full rounded-md py-2 text-sm font-semibold transition-all',
            isYes
              ? 'bg-yes/10 text-yes hover:bg-yes/20 border border-yes/20'
              : 'bg-no/10 text-no hover:bg-no/20 border border-no/20'
          )}
        >
          Buy {outcome.label}
        </button>
      )}
    </div>
  );
}
