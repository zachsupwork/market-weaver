import type { Market, PricePoint } from '@/types/market';

function generatePriceHistory(days: number, trend: 'up' | 'down' | 'volatile' | 'stable'): PricePoint[] {
  const points: PricePoint[] = [];
  let yesPrice = 0.5;
  const now = Date.now();

  for (let i = days * 24; i >= 0; i -= 4) {
    const noise = (Math.random() - 0.5) * 0.08;
    const trendBias = trend === 'up' ? 0.002 : trend === 'down' ? -0.002 : trend === 'volatile' ? (Math.random() - 0.5) * 0.01 : 0;
    yesPrice = Math.max(0.01, Math.min(0.99, yesPrice + noise + trendBias));

    points.push({
      timestamp: now - i * 3600 * 1000,
      yesPrice: Math.round(yesPrice * 100) / 100,
      noPrice: Math.round((1 - yesPrice) * 100) / 100,
      volume: Math.floor(Math.random() * 50000 + 5000),
    });
  }
  return points;
}

export const mockMarkets: Market[] = [
  {
    id: '1',
    slug: 'trump-win-2024',
    question: 'Will Donald Trump win the 2024 Presidential Election?',
    description: 'This market resolves YES if Donald Trump wins the 2024 US Presidential Election.',
    category: 'Politics',
    tags: ['US Elections', '2024', 'Trump'],
    outcomes: [
      { id: '1-yes', label: 'Yes', price: 0.52, isWinner: null },
      { id: '1-no', label: 'No', price: 0.48, isWinner: null },
    ],
    resolution: { state: 'open' },
    volume24h: 2450000,
    totalVolume: 185000000,
    liquidity: 12500000,
    createdAt: '2024-01-15',
    endDate: '2024-11-05',
    priceHistory: generatePriceHistory(90, 'volatile'),
  },
  {
    id: '2',
    slug: 'bitcoin-100k-2024',
    question: 'Will Bitcoin reach $100,000 before December 31, 2024?',
    description: 'Resolves YES if Bitcoin price reaches $100,000 USD on any major exchange.',
    category: 'Crypto',
    tags: ['Bitcoin', 'Price', 'Crypto'],
    outcomes: [
      { id: '2-yes', label: 'Yes', price: 0.38, isWinner: null },
      { id: '2-no', label: 'No', price: 0.62, isWinner: null },
    ],
    resolution: { state: 'proposed', proposedOutcome: 'Yes', proposedAt: '2024-12-05T14:30:00Z', disputeDeadline: '2024-12-07T14:30:00Z' },
    volume24h: 890000,
    totalVolume: 45000000,
    liquidity: 3200000,
    createdAt: '2024-03-01',
    endDate: '2024-12-31',
    priceHistory: generatePriceHistory(60, 'up'),
  },
  {
    id: '3',
    slug: 'fed-rate-cut-march',
    question: 'Will the Fed cut interest rates in March 2025?',
    description: 'This market resolves YES if the Federal Reserve announces a rate cut at the March 2025 FOMC meeting.',
    category: 'Economics',
    tags: ['Fed', 'Interest Rates', 'FOMC'],
    outcomes: [
      { id: '3-yes', label: 'Yes', price: 0.71, isWinner: null },
      { id: '3-no', label: 'No', price: 0.29, isWinner: null },
    ],
    resolution: { state: 'open' },
    volume24h: 340000,
    totalVolume: 8200000,
    liquidity: 1500000,
    createdAt: '2024-11-01',
    endDate: '2025-03-20',
    priceHistory: generatePriceHistory(45, 'up'),
  },
  {
    id: '4',
    slug: 'spacex-starship-orbit',
    question: 'Will SpaceX Starship complete a full orbital flight by Q1 2025?',
    description: 'Resolves YES if SpaceX Starship reaches orbit and completes at least one full orbit.',
    category: 'Science',
    tags: ['SpaceX', 'Space', 'Starship'],
    outcomes: [
      { id: '4-yes', label: 'Yes', price: 0.45, isWinner: null },
      { id: '4-no', label: 'No', price: 0.55, isWinner: null },
    ],
    resolution: { state: 'disputed', proposedOutcome: 'No', proposedAt: '2025-01-10T10:00:00Z' },
    volume24h: 125000,
    totalVolume: 3400000,
    liquidity: 890000,
    createdAt: '2024-06-15',
    endDate: '2025-03-31',
    priceHistory: generatePriceHistory(30, 'down'),
  },
  {
    id: '5',
    slug: 'ai-agi-2025',
    question: 'Will a major lab announce AGI by end of 2025?',
    description: 'Resolves YES if OpenAI, Google DeepMind, or Anthropic publicly announces achieving AGI.',
    category: 'AI',
    tags: ['AGI', 'AI', 'OpenAI'],
    outcomes: [
      { id: '5-yes', label: 'Yes', price: 0.08, isWinner: null },
      { id: '5-no', label: 'No', price: 0.92, isWinner: null },
    ],
    resolution: { state: 'open' },
    volume24h: 560000,
    totalVolume: 12000000,
    liquidity: 2100000,
    createdAt: '2024-07-01',
    endDate: '2025-12-31',
    priceHistory: generatePriceHistory(60, 'stable'),
  },
  {
    id: '6',
    slug: 'ethereum-etf-approved',
    question: 'Will Ethereum spot ETF be approved by SEC?',
    description: 'Resolves YES if SEC approves at least one spot Ethereum ETF application.',
    category: 'Crypto',
    tags: ['Ethereum', 'ETF', 'SEC'],
    outcomes: [
      { id: '6-yes', label: 'Yes', price: 1.0, isWinner: true },
      { id: '6-no', label: 'No', price: 0.0, isWinner: false },
    ],
    resolution: {
      state: 'finalized',
      proposedOutcome: 'Yes',
      proposedAt: '2024-05-23T18:00:00Z',
      finalizedAt: '2024-05-25T18:00:00Z',
      resolver: '0x1234...abcd',
      oracleSource: 'UMA Optimistic Oracle v3',
    },
    volume24h: 0,
    totalVolume: 67000000,
    liquidity: 0,
    createdAt: '2024-01-10',
    endDate: '2024-12-31',
    priceHistory: generatePriceHistory(90, 'up'),
  },
  {
    id: '7',
    slug: 'apple-vision-pro-sales',
    question: 'Will Apple sell 1M+ Vision Pro units in 2024?',
    description: 'Resolves YES if credible reports confirm Apple sold over 1 million Vision Pro units.',
    category: 'Tech',
    tags: ['Apple', 'Vision Pro', 'VR'],
    outcomes: [
      { id: '7-yes', label: 'Yes', price: 0.0, isWinner: false },
      { id: '7-no', label: 'No', price: 1.0, isWinner: true },
    ],
    resolution: {
      state: 'finalized',
      proposedOutcome: 'No',
      proposedAt: '2025-01-05T12:00:00Z',
      finalizedAt: '2025-01-07T12:00:00Z',
      resolver: '0x5678...efgh',
      oracleSource: 'UMA Optimistic Oracle v3',
    },
    volume24h: 0,
    totalVolume: 4500000,
    liquidity: 0,
    createdAt: '2024-02-01',
    endDate: '2024-12-31',
    priceHistory: generatePriceHistory(60, 'down'),
  },
  {
    id: '8',
    slug: 'world-cup-2026-host',
    question: 'Will the 2026 World Cup final be held in New York?',
    description: 'Resolves YES if FIFA confirms the 2026 World Cup final will be played at MetLife Stadium.',
    category: 'Sports',
    tags: ['FIFA', 'World Cup', 'Soccer'],
    outcomes: [
      { id: '8-yes', label: 'Yes', price: 0.65, isWinner: null },
      { id: '8-no', label: 'No', price: 0.35, isWinner: null },
    ],
    resolution: { state: 'pending_proposal' },
    volume24h: 78000,
    totalVolume: 2100000,
    liquidity: 450000,
    createdAt: '2024-08-01',
    endDate: '2026-07-19',
    priceHistory: generatePriceHistory(30, 'stable'),
  },
];

export const categories = ['All', 'Politics', 'Crypto', 'Economics', 'Science', 'AI', 'Tech', 'Sports'];
