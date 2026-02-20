import { useState } from 'react';
import { feeManager } from '@/lib/fees';
import type { FeeMode } from '@/types/market';
import { Settings, DollarSign, Percent, CreditCard, TrendingUp, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';

const feeModes: { mode: FeeMode; label: string; description: string; icon: typeof DollarSign }[] = [
  { mode: 'interface', label: 'Interface Fee', description: 'Charge X bps on executed trades', icon: Percent },
  { mode: 'vault', label: 'Vault Model', description: 'ERC-4626 vault performance + management fees', icon: TrendingUp },
  { mode: 'subscription', label: 'Subscription', description: 'Monthly analytics subscription', icon: CreditCard },
];

const Admin = () => {
  const [config, setConfig] = useState(feeManager.getConfig());

  const updateField = (field: string, value: number | boolean | FeeMode) => {
    const updated = { ...config, [field]: value };
    setConfig(updated);
    feeManager.updateConfig(updated);
  };

  const stats = {
    totalFeesCollected: 12450.80,
    feesThisMonth: 3200.50,
    activeSubscriptions: 47,
    marketsTracked: 8,
  };

  return (
    <div className="min-h-screen">
      <div className="container py-8 max-w-4xl">
        <div className="flex items-center gap-3 mb-8">
          <Settings className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Admin Panel</h1>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Total Fees', value: `$${stats.totalFeesCollected.toLocaleString()}`, icon: DollarSign },
            { label: 'This Month', value: `$${stats.feesThisMonth.toLocaleString()}`, icon: BarChart3 },
            { label: 'Subscribers', value: stats.activeSubscriptions.toString(), icon: CreditCard },
            { label: 'Markets', value: stats.marketsTracked.toString(), icon: TrendingUp },
          ].map((stat) => (
            <div key={stat.label} className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center gap-2 mb-1.5">
                <stat.icon className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">{stat.label}</span>
              </div>
              <p className="font-mono text-xl font-bold">{stat.value}</p>
            </div>
          ))}
        </div>

        {/* Fee Mode Selection */}
        <div className="mb-8">
          <h2 className="text-sm font-semibold mb-3">Fee Mode</h2>
          <div className="grid gap-3 md:grid-cols-3">
            {feeModes.map(({ mode, label, description, icon: Icon }) => (
              <button
                key={mode}
                onClick={() => updateField('mode', mode)}
                className={cn(
                  'rounded-lg border p-4 text-left transition-all',
                  config.mode === mode
                    ? 'border-primary/40 bg-primary/5 glow-primary'
                    : 'border-border bg-card hover:border-primary/20'
                )}
              >
                <Icon className={cn('h-5 w-5 mb-2', config.mode === mode ? 'text-primary' : 'text-muted-foreground')} />
                <p className="text-sm font-semibold">{label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Enable/Disable */}
        <div className="rounded-lg border border-border bg-card p-5 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold">Fees Enabled</p>
              <p className="text-xs text-muted-foreground">Toggle fee collection on/off</p>
            </div>
            <button
              onClick={() => updateField('enabled', !config.enabled)}
              className={cn(
                'relative h-6 w-11 rounded-full transition-colors',
                config.enabled ? 'bg-yes' : 'bg-muted'
              )}
            >
              <span className={cn(
                'absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-foreground transition-transform',
                config.enabled && 'translate-x-5'
              )} />
            </button>
          </div>
        </div>

        {/* Mode-specific config */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <h2 className="text-sm font-semibold">Configuration</h2>

          {config.mode === 'interface' && (
            <div className="space-y-3">
              <label className="block">
                <span className="text-xs text-muted-foreground">Interface Fee (bps)</span>
                <input
                  type="number"
                  value={config.interfaceFeeBps}
                  onChange={(e) => updateField('interfaceFeeBps', Number(e.target.value))}
                  className="mt-1 w-full rounded-md border border-border bg-muted px-3 py-2 font-mono text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <span className="text-[10px] text-muted-foreground mt-1 block">{(config.interfaceFeeBps / 100).toFixed(2)}% per trade</span>
              </label>
            </div>
          )}

          {config.mode === 'vault' && (
            <div className="grid gap-3 md:grid-cols-2">
              <label className="block">
                <span className="text-xs text-muted-foreground">Performance Fee (bps)</span>
                <input
                  type="number"
                  value={config.vaultPerformanceFeeBps}
                  onChange={(e) => updateField('vaultPerformanceFeeBps', Number(e.target.value))}
                  className="mt-1 w-full rounded-md border border-border bg-muted px-3 py-2 font-mono text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <span className="text-[10px] text-muted-foreground mt-1 block">{(config.vaultPerformanceFeeBps / 100).toFixed(2)}% on profits</span>
              </label>
              <label className="block">
                <span className="text-xs text-muted-foreground">Management Fee (bps)</span>
                <input
                  type="number"
                  value={config.vaultManagementFeeBps}
                  onChange={(e) => updateField('vaultManagementFeeBps', Number(e.target.value))}
                  className="mt-1 w-full rounded-md border border-border bg-muted px-3 py-2 font-mono text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <span className="text-[10px] text-muted-foreground mt-1 block">{(config.vaultManagementFeeBps / 100).toFixed(2)}% annually</span>
              </label>
            </div>
          )}

          {config.mode === 'subscription' && (
            <label className="block">
              <span className="text-xs text-muted-foreground">Monthly Price (USD)</span>
              <input
                type="number"
                step="0.01"
                value={config.subscriptionMonthlyUsd}
                onChange={(e) => updateField('subscriptionMonthlyUsd', Number(e.target.value))}
                className="mt-1 w-full rounded-md border border-border bg-muted px-3 py-2 font-mono text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </label>
          )}
        </div>
      </div>
    </div>
  );
};

export default Admin;
