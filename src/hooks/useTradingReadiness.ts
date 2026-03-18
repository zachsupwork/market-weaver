import { useAccount } from "wagmi";
import { useProxyWallet } from "./useProxyWallet";
import { useUsdcApproval } from "./useUsdcApproval";
import { useState, useEffect, useCallback } from "react";
import { checkUserCredsStatus } from "@/lib/polymarket-api";

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
  const { isConnected, address } = useAccount();
  const proxy = useProxyWallet();
  // Approvals + balance must be checked on the gasless Safe/proxy wallet
  const usdc = useUsdcApproval(proxy.proxyAddress ?? null);
  const [credsReady, setCredsReady] = useState(false);
  const [credsLoading, setCredsLoading] = useState(true);

  const refreshCreds = useCallback(async () => {
    if (!address) {
      setCredsReady(false);
      setCredsLoading(false);
      return;
    }
    setCredsLoading(true);
    try {
      // Check if creds exist by wallet address (no session required)
      const result = await checkUserCredsStatus(address);
      setCredsReady(result.hasCreds);
    } catch {
      setCredsReady(false);
    } finally {
      setCredsLoading(false);
    }
  }, [address]);

  useEffect(() => {
    if (isConnected && address) refreshCreds();
    else {
      setCredsReady(false);
      setCredsLoading(false);
    }
  }, [isConnected, address, refreshCreds]);

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
