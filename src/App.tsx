import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppHeader } from "@/components/layout/AppHeader";
import { AgeGate } from "@/components/AgeGate";
import Index from "./pages/Index";
import LiveMarkets from "./pages/LiveMarkets";
import Trade from "./pages/Trade";
import Portfolio from "./pages/Portfolio";
import MarketDetail from "./pages/MarketDetail";
import Admin from "./pages/Admin";
import PolymarketSettings from "./pages/PolymarketSettings";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AgeGate>
          <AppHeader />
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/live" element={<LiveMarkets />} />
            <Route path="/trade/:conditionId" element={<Trade />} />
            <Route path="/portfolio" element={<Portfolio />} />
            <Route path="/market/:slug" element={<MarketDetail />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/settings/polymarket" element={<PolymarketSettings />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
          {/* Footer disclaimer */}
          <footer className="border-t border-border py-4 mt-8">
            <div className="container text-center">
              <p className="text-[10px] text-muted-foreground">
                PolyView is a third-party client for Polymarket. Not affiliated with or endorsed by Polymarket Inc.
                Prediction market trading involves substantial risk of loss.
              </p>
            </div>
          </footer>
        </AgeGate>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
