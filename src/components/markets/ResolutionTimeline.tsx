import { ResolutionInfo } from '@/types/market';
import { Shield, Clock, ExternalLink } from 'lucide-react';

interface ResolutionTimelineProps {
  resolution: ResolutionInfo;
}

export function ResolutionTimeline({ resolution }: ResolutionTimelineProps) {
  const steps = [
    { key: 'open', label: 'Market Open', done: true },
    { key: 'proposed', label: 'Outcome Proposed', done: ['proposed', 'disputed', 'finalized'].includes(resolution.state) },
    { key: 'dispute', label: 'Dispute Window', done: ['finalized'].includes(resolution.state), active: resolution.state === 'disputed' },
    { key: 'finalized', label: 'Finalized', done: resolution.state === 'finalized' },
  ];

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-center gap-2 mb-4">
        <Shield className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Resolution Timeline</h3>
      </div>

      <div className="space-y-3">
        {steps.map((step, i) => (
          <div key={step.key} className="flex items-start gap-3">
            <div className="flex flex-col items-center">
              <div className={`h-3 w-3 rounded-full border-2 ${
                step.active ? 'border-warning bg-warning/30 animate-pulse-yes' :
                step.done ? 'border-yes bg-yes/30' : 'border-muted-foreground/30 bg-transparent'
              }`} />
              {i < steps.length - 1 && (
                <div className={`w-0.5 h-6 ${step.done ? 'bg-yes/30' : 'bg-muted'}`} />
              )}
            </div>
            <div className="-mt-0.5">
              <p className={`text-xs font-medium ${step.done ? 'text-foreground' : step.active ? 'text-warning' : 'text-muted-foreground'}`}>
                {step.label}
              </p>
            </div>
          </div>
        ))}
      </div>

      {resolution.proposedOutcome && (
        <div className="mt-4 rounded-md bg-muted p-3 space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Proposed outcome</span>
            <span className="font-mono font-semibold text-foreground">{resolution.proposedOutcome}</span>
          </div>
          {resolution.proposedAt && (
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Proposed at</span>
              <span className="font-mono text-foreground">{new Date(resolution.proposedAt).toLocaleDateString()}</span>
            </div>
          )}
          {resolution.disputeDeadline && (
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Dispute deadline</span>
              <span className="font-mono text-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {new Date(resolution.disputeDeadline).toLocaleDateString()}
              </span>
            </div>
          )}
          {resolution.finalizedAt && (
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Finalized</span>
              <span className="font-mono text-yes">{new Date(resolution.finalizedAt).toLocaleDateString()}</span>
            </div>
          )}
          {resolution.resolver && (
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Resolver</span>
              <span className="font-mono text-foreground flex items-center gap-1">
                {resolution.resolver}
                <ExternalLink className="h-3 w-3 text-primary" />
              </span>
            </div>
          )}
          {resolution.oracleSource && (
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Oracle</span>
              <span className="text-foreground">{resolution.oracleSource}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
