import { useState, useMemo } from 'react';
import { mockMarkets } from '@/data/mockMarkets';
import { MarketCard } from '@/components/markets/MarketCard';
import { MarketFilters } from '@/components/markets/MarketFilters';
import { Activity } from 'lucide-react';

const Index = () => {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [sortBy, setSortBy] = useState('volume');

  const filtered = useMemo(() => {
    let markets = mockMarkets;

    if (search) {
      const q = search.toLowerCase();
      markets = markets.filter(
        (m) => m.question.toLowerCase().includes(q) || m.tags.some((t) => t.toLowerCase().includes(q))
      );
    }

    if (category !== 'All') {
      markets = markets.filter((m) => m.category === category);
    }

    switch (sortBy) {
      case 'volume':
        return [...markets].sort((a, b) => b.totalVolume - a.totalVolume);
      case 'newest':
        return [...markets].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      case 'ending':
        return [...markets].sort((a, b) => new Date(a.endDate).getTime() - new Date(b.endDate).getTime());
      case 'price':
        return [...markets].sort((a, b) => {
          const aPrice = a.outcomes.find((o) => o.label === 'Yes')?.price ?? 0;
          const bPrice = b.outcomes.find((o) => o.label === 'Yes')?.price ?? 0;
          return bPrice - aPrice;
        });
      default:
        return markets;
    }
  }, [search, category, sortBy]);

  return (
    <div className="min-h-screen">
      <div className="container py-8">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Activity className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold">Prediction Markets</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Browse, search, and track resolution status across all markets.
          </p>
        </div>

        <MarketFilters
          search={search}
          onSearchChange={setSearch}
          category={category}
          onCategoryChange={setCategory}
          sortBy={sortBy}
          onSortChange={setSortBy}
        />

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((market) => (
            <MarketCard key={market.id} market={market} />
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="mt-12 text-center text-muted-foreground">
            <p className="text-sm">No markets found matching your criteria.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Index;
