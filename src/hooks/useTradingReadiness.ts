import { useAccount } from "wagmi";
import { useProxyWallet } from "./useProxyWallet";
import { useUsdcApproval } from "./useUsdcApproval";
import { useState, useEffect, useCallback } from "react";
import { checkUserCredsStatus } from "@/lib/polymarket-api";
import { supabase } from "@/integrations/supabase/client";

export type TradingStep = "proxy" | "creds" | "usdc" | "ready";

export interface TradingReadiness {
  currentStep: TradingStep;
  proxyReady: boolean;
  credsReady: boolean;
  usdcReady: boolean;
  allReady: boolean;
  // Sub-hook state
  proxy: ReturnType<typeof useProxyWallet>;
  usdc: ReturnType<typeof useUsdcApproval>;
  credsLoading: boolean;
  refreshCreds: () => Promise<void>;
}

export function useTradingReadiness(orderAmountUsdc: number): TradingReadiness {
  const { isConnected } = useAccount();
  const proxy = useProxyWallet();
  const usdc = useUsdcApproval(orderAmountUsdc);
  const [credsReady, setCredsReady] = useState(false);
  const [credsLoading, setCredsLoading] = useState(true);

  const refreshCreds = useCallback(async () => {
    setCredsLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setCredsReady(false);
        return;
      }
      const status = await checkUserCredsStatus();
      setCredsReady(status.hasCreds);
    } catch {
      setCredsReady(false);
    } finally {
      setCredsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isConnected) refreshCreds();
  }, [isConnected, refreshCreds]);

  const proxyReady = proxy.isDeployed;
  const usdcReady = !usdc.needsApproval || orderAmountUsdc <= 0;

  let currentStep: TradingStep = "proxy";
  if (proxyReady) currentStep = "creds";
  if (proxyReady && credsReady) currentStep = "usdc";
  if (proxyReady && credsReady && usdcReady) currentStep = "ready";

  return {
    currentStep,
    proxyReady,
    credsReady,
    usdcReady,
    allReady: proxyReady && credsReady && usdcReady,
    proxy,
    usdc,
    credsLoading,
    refreshCreds,
  };
}
