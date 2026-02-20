import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { categories } from '@/data/mockMarkets';

interface MarketFiltersProps {
  search: string;
  onSearchChange: (v: string) => void;
  category: string;
  onCategoryChange: (v: string) => void;
  sortBy: string;
  onSortChange: (v: string) => void;
}

export function MarketFilters({ search, onSearchChange, category, onCategoryChange, sortBy, onSortChange }: MarketFiltersProps) {
  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search markets..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full rounded-lg border border-border bg-card pl-10 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => onCategoryChange(cat)}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-medium transition-all',
              category === cat
                ? 'bg-primary text-primary-foreground'
                : 'bg-secondary text-secondary-foreground hover:bg-accent'
            )}
          >
            {cat}
          </button>
        ))}

        <select
          value={sortBy}
          onChange={(e) => onSortChange(e.target.value)}
          className="ml-auto rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          <option value="volume">Volume (High → Low)</option>
          <option value="newest">Newest First</option>
          <option value="ending">Ending Soon</option>
          <option value="price">Price (High → Low)</option>
        </select>
      </div>
    </div>
  );
}
