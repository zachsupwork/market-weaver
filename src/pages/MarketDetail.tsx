import { useParams, Link, Navigate } from "react-router-dom";
import { useMarketBySlug } from "@/hooks/useMarkets";
import { Loader2 } from "lucide-react";

// MarketDetail now resolves slug → condition_id and redirects to /trade/:conditionId
// No mock data is used.

const MarketDetail = () => {
  const { slug } = useParams<{ slug: string }>();
  const { data: market, isLoading } = useMarketBySlug(slug);

  if (isLoading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (market && market.condition_id) {
    return <Navigate to={`/trade/${encodeURIComponent(market.condition_id)}`} replace />;
  }

  return (
    <div className="container py-16 text-center">
      <p className="text-muted-foreground">Market not found.</p>
      <Link to="/live" className="text-primary text-sm mt-2 inline-block hover:underline">
        ← Back to markets
      </Link>
    </div>
  );
};

export default MarketDetail;
