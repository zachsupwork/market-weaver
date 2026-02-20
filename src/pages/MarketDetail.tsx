import { useParams, Link } from 'react-router-dom';
import { mockMarkets } from '@/data/mockMarkets';
import { OutcomeCard } from '@/components/markets/OutcomeCard';
import { PriceChart } from '@/components/markets/PriceChart';
import { ResolutionStatus } from '@/components/markets/ResolutionStatus';
import { ResolutionTimeline } from '@/components/markets/ResolutionTimeline';
import { ArrowLeft, BarChart3, Droplets, TrendingUp, Calendar } from 'lucide-react';

function formatVolume(n: number): string {
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n}`;
}

const MarketDetail = () => {
  const { slug } = useParams<{ slug: string }>();
  const market = mockMarkets.find((m) => m.slug === slug);

  if (!market) {
    return (
      <div className="container py-16 text-center">
        <p className="text-muted-foreground">Market not found.</p>
        <Link to="/" className="text-primary text-sm mt-2 inline-block hover:underline">← Back to markets</Link>
      </div>
    );
  }

  const isResolved = market.resolution.state === 'finalized';

  return (
    <div className="min-h-screen">
      <div className="container py-8 max-w-5xl">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6">
          <ArrowLeft className="h-4 w-4" /> Back to markets
        </Link>

        <div className="mb-6">
          <div className="flex items-start justify-between gap-4 mb-3">
            <h1 className="text-xl font-bold leading-snug">{market.question}</h1>
            <ResolutionStatus state={market.resolution.state} />
          </div>
          <p className="text-sm text-muted-foreground mb-4">{market.description}</p>

          <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <TrendingUp className="h-3.5 w-3.5" />
              <span>24h Vol: <span className="font-mono text-foreground">{formatVolume(market.volume24h)}</span></span>
            </div>
            <div className="flex items-center gap-1">
              <BarChart3 className="h-3.5 w-3.5" />
              <span>Total Vol: <span className="font-mono text-foreground">{formatVolume(market.totalVolume)}</span></span>
            </div>
            <div className="flex items-center gap-1">
              <Droplets className="h-3.5 w-3.5" />
              <span>Liquidity: <span className="font-mono text-foreground">{formatVolume(market.liquidity)}</span></span>
            </div>
            <div className="flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" />
              <span>Ends: <span className="font-mono text-foreground">{new Date(market.endDate).toLocaleDateString()}</span></span>
            </div>
          </div>

          <div className="flex gap-1.5 mt-3">
            {market.tags.map((tag) => (
              <span key={tag} className="rounded-full bg-secondary px-2.5 py-0.5 text-[10px] font-medium text-secondary-foreground">
                {tag}
              </span>
            ))}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 mb-6">
          {market.outcomes.map((outcome) => (
            <OutcomeCard key={outcome.id} outcome={outcome} isResolved={isResolved} />
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-3 mb-6">
          <div className="lg:col-span-2">
            <PriceChart data={market.priceHistory} />
          </div>
          <div>
            <ResolutionTimeline resolution={market.resolution} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default MarketDetail;
