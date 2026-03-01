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
  proxy: ReturnType<typeof useProxyWallet>;
  usdc: ReturnType<typeof useUsdcApproval>;
  credsLoading: boolean;
  refreshCreds: () => Promise<void>;
}

export function useTradingReadiness(orderAmountUsdc: number): TradingReadiness {
  const { isConnected } = useAccount();
  const proxy = useProxyWallet();
  const usdc = useUsdcApproval(proxy.proxyAddress);
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
      // Check if creds exist in DB (don't live-validate to avoid false negatives)
      const result = await checkUserCredsStatus();
      setCredsReady(result.hasCreds);
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
  const usdcReady = !usdc.needsApproval;

  let currentStep: TradingStep = "proxy";
  if (proxyReady) currentStep = "usdc";
  if (proxyReady && usdcReady) currentStep = "creds";
  if (proxyReady && usdcReady && credsReady) currentStep = "ready";

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
