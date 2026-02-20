import type { FeeConfig, FeeMode, FeeRecord } from '@/types/market';

const defaultFeeConfig: FeeConfig = {
  mode: 'subscription',
  enabled: true,
  interfaceFeeBps: 50, // 0.5%
  vaultPerformanceFeeBps: 1000, // 10%
  vaultManagementFeeBps: 200, // 2%
  subscriptionMonthlyUsd: 29.99,
};

export class FeeManager {
  private config: FeeConfig;
  private records: FeeRecord[] = [];

  constructor(config?: Partial<FeeConfig>) {
    this.config = { ...defaultFeeConfig, ...config };
  }

  getConfig(): FeeConfig {
    return { ...this.config };
  }

  updateConfig(updates: Partial<FeeConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  setMode(mode: FeeMode): void {
    this.config.mode = mode;
  }

  calculateInterfaceFee(tradeAmount: number): number {
    if (this.config.mode !== 'interface' || !this.config.enabled) return 0;
    return (tradeAmount * this.config.interfaceFeeBps) / 10000;
  }

  calculateVaultFees(portfolioValue: number, profit: number): { management: number; performance: number } {
    if (this.config.mode !== 'vault' || !this.config.enabled) {
      return { management: 0, performance: 0 };
    }
    return {
      management: (portfolioValue * this.config.vaultManagementFeeBps) / 10000,
      performance: profit > 0 ? (profit * this.config.vaultPerformanceFeeBps) / 10000 : 0,
    };
  }

  getSubscriptionPrice(): number {
    if (this.config.mode !== 'subscription' || !this.config.enabled) return 0;
    return this.config.subscriptionMonthlyUsd;
  }

  recordFee(marketId: string, amount: number, currency = 'USDC'): void {
    this.records.push({
      id: crypto.randomUUID(),
      marketId,
      mode: this.config.mode,
      amount,
      currency,
      timestamp: new Date().toISOString(),
    });
  }

  getRecords(): FeeRecord[] {
    return [...this.records];
  }

  getTotalCollected(): number {
    return this.records.reduce((sum, r) => sum + r.amount, 0);
  }
}

export const feeManager = new FeeManager();
