import { cn } from '@/lib/utils';
import type { ResolutionState } from '@/types/market';
import { Shield, Clock, AlertTriangle, CheckCircle2, HelpCircle } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

const stateConfig: Record<ResolutionState, { label: string; icon: typeof Shield; className: string }> = {
  open: { label: 'Open', icon: Clock, className: 'bg-primary/10 text-primary border-primary/20' },
  pending_proposal: { label: 'Pending Proposal', icon: Clock, className: 'bg-warning/10 text-warning border-warning/20' },
  proposed: { label: 'Proposed', icon: AlertTriangle, className: 'bg-warning/10 text-warning border-warning/20' },
  disputed: { label: 'Disputed', icon: AlertTriangle, className: 'bg-destructive/10 text-destructive border-destructive/20' },
  finalized: { label: 'Finalized', icon: CheckCircle2, className: 'bg-yes/10 text-yes border-yes/20' },
};

interface ResolutionStatusProps {
  state: ResolutionState;
  compact?: boolean;
}

export function ResolutionStatus({ state, compact }: ResolutionStatusProps) {
  const config = stateConfig[state];
  const Icon = config.icon;

  return (
    <div className="flex items-center gap-1.5">
      <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium', config.className)}>
        <Icon className="h-3 w-3" />
        {config.label}
      </span>
      {!compact && (
        <Tooltip>
          <TooltipTrigger>
            <HelpCircle className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground transition-colors" />
          </TooltipTrigger>
          <TooltipContent className="max-w-xs text-xs">
            <p className="font-semibold mb-1">How resolution works</p>
            <p>Markets use UMA's Optimistic Oracle. An outcome is proposed → 48h dispute window → if undisputed, it finalizes. Winners redeem at $1.00, losers at $0.00.</p>
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
