import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { WagmiProvider } from "wagmi";
import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import "@rainbow-me/rainbowkit/styles.css";
import { walletConfig, walletConnectConfigured } from "@/lib/wallet-config";
import { AppHeader } from "@/components/layout/AppHeader";
import { AgeGate } from "@/components/AgeGate";
import { OnboardingFlow } from "@/components/onboarding/OnboardingFlow";
import { useEffect } from "react";
import { useAccount } from "wagmi";
import Index from "./pages/Index";
import LiveMarkets from "./pages/LiveMarkets";
import Trade from "./pages/Trade";
import Portfolio from "./pages/Portfolio";
import Leaderboard from "./pages/Leaderboard";
import Account from "./pages/Account";
import MarketDetail from "./pages/MarketDetail";
import ExploreEvents from "./pages/ExploreEvents";
import EventDetail from "./pages/EventDetail";
import Admin from "./pages/Admin";
import PolymarketSettings from "./pages/PolymarketSettings";
import BuilderKeys from "./pages/BuilderKeys";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function WalletDebugLogger() {
  const { address, isConnected, chainId, connector } = useAccount();
  useEffect(() => {
    if (import.meta.env.DEV) {
      console.log("[PolyView Wallet]", { isConnected, address, chainId, connector: connector?.name });
    }
  }, [isConnected, address, chainId, connector]);
  return null;
}

function WalletConnectBanner() {
  if (walletConnectConfigured) return null;
  return (
    <div className="bg-destructive/10 border-b border-destructive/30 px-4 py-2 text-center text-xs text-destructive">
      WalletConnect disabled: set <code className="font-mono">VITE_WALLETCONNECT_PROJECT_ID</code> in your environment.
    </div>
  );
}

const App = () => (
  <WagmiProvider config={walletConfig}>
    <QueryClientProvider client={queryClient}>
      <RainbowKitProvider
        theme={darkTheme({
          accentColor: "hsl(217 91% 60%)",
          borderRadius: "medium",
        })}
      >
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <AgeGate>
              <OnboardingFlow>
                <WalletConnectBanner />
                <WalletDebugLogger />
                <AppHeader />
                <Routes>
                  <Route path="/" element={<Index />} />
                  <Route path="/live" element={<LiveMarkets />} />
                  <Route path="/trade/:conditionId" element={<Trade />} />
                  <Route path="/portfolio" element={<Portfolio />} />
                  <Route path="/account" element={<Account />} />
                  <Route path="/leaderboard" element={<Leaderboard />} />
                  <Route path="/market/:slug" element={<MarketDetail />} />
                  <Route path="/events" element={<ExploreEvents />} />
                  <Route path="/events/:eventId" element={<EventDetail />} />
                  <Route path="/admin" element={<Admin />} />
                  <Route path="/settings/polymarket" element={<PolymarketSettings />} />
                  <Route path="/settings/api-keys" element={<BuilderKeys />} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
                <footer className="border-t border-border py-4 mt-8">
                  <div className="container text-center">
                    <p className="text-[10px] text-muted-foreground">
                      PolyView is a third-party client for Polymarket. Not affiliated with or endorsed by Polymarket Inc.
                      Prediction market trading involves substantial risk of loss.
                    </p>
                  </div>
                </footer>
              </OnboardingFlow>
            </AgeGate>
          </BrowserRouter>
        </TooltipProvider>
      </RainbowKitProvider>
    </QueryClientProvider>
  </WagmiProvider>
);

export default App;
