export type ResolutionState =
  | 'open'
  | 'pending_proposal'
  | 'proposed'
  | 'disputed'
  | 'finalized';

export interface Outcome {
  id: string;
  label: string; // "Yes" or "No"
  price: number; // 0.00 to 1.00
  isWinner: boolean | null; // null = unresolved
}

export interface PricePoint {
  timestamp: number;
  yesPrice: number;
  noPrice: number;
  volume: number;
}

export interface ResolutionInfo {
  state: ResolutionState;
  proposedOutcome?: string;
  proposedAt?: string;
  disputeDeadline?: string;
  finalizedAt?: string;
  resolver?: string;
  oracleSource?: string;
}

export interface Market {
  id: string;
  slug: string;
  question: string;
  description: string;
  category: string;
  tags: string[];
  outcomes: Outcome[];
  resolution: ResolutionInfo;
  volume24h: number;
  totalVolume: number;
  liquidity: number;
  createdAt: string;
  endDate: string;
  priceHistory: PricePoint[];
  imageUrl?: string;
}

export type FeeMode = 'interface' | 'vault' | 'subscription';

export interface FeeConfig {
  mode: FeeMode;
  enabled: boolean;
  interfaceFeeBps: number; // basis points
  vaultPerformanceFeeBps: number;
  vaultManagementFeeBps: number;
  subscriptionMonthlyUsd: number;
}

export interface FeeRecord {
  id: string;
  marketId: string;
  mode: FeeMode;
  amount: number;
  currency: string;
  timestamp: string;
}

export interface AdminStats {
  totalFeesCollected: number;
  feesThisMonth: number;
  activeSubscriptions: number;
  marketsTracked: number;
}
