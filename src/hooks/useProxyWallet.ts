import { useState, useCallback, useEffect } from "react";
import { useAccount, usePublicClient } from "wagmi";
import { useRelayClient } from "./useRelayClient";
import { getContractConfig } from "@polymarket/builder-relayer-client/dist/config";
import { deriveSafe } from "@polymarket/builder-relayer-client/dist/builder/derive";

/**
 * Step 1: "Deploy Proxy Wallet"
 *
 * Deploys a Gnosis Safe proxy wallet via the Polymarket Builder Relayer.
 * The Safe address is deterministically derived from the user's EOA address.
 * All on-chain gas is paid by the Polymarket relayer (gasless for the user).
 */
export function useProxyWallet() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { getClient } = useRelayClient();
  const [safeAddress, setSafeAddress] = useState<string | null>(null);
  const [isDeployed, setIsDeployed] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const [isChecking, setIsChecking] = useState(false);

  // Derive Safe address deterministically from EOA
  useEffect(() => {
    if (!address) {
      setSafeAddress(null);
      setIsDeployed(false);
      return;
    }
    try {
      const config = getContractConfig(137);
      const derived = deriveSafe(address, config.SafeContracts.SafeFactory);
      setSafeAddress(derived);
    } catch (err) {
      console.warn("[useProxyWallet] Failed to derive Safe address:", err);
      setSafeAddress(null);
    }
  }, [address]);

  // Check if Safe is already deployed
  const checkDeployment = useCallback(async () => {
    if (!safeAddress || !publicClient) return;
    setIsChecking(true);
    try {
      const code = await publicClient.getCode({ address: safeAddress as `0x${string}` });
      setIsDeployed(!!code && code !== "0x");
    } catch {
      setIsDeployed(false);
    } finally {
      setIsChecking(false);
    }
  }, [safeAddress, publicClient]);

  useEffect(() => {
    if (safeAddress && isConnected) {
      checkDeployment();
    }
  }, [safeAddress, isConnected, checkDeployment]);

  // Deploy Safe via relayer (prompts user signature)
  const deploy = useCallback(async () => {
    if (!address || isDeployed) return;
    setIsDeploying(true);
    try {
      const client = await getClient();
      const response = await client.deploy();
      const result = await response.wait();
      if (result?.proxyAddress) {
        setSafeAddress(result.proxyAddress);
        setIsDeployed(true);
      } else {
        throw new Error("Safe deployment failed - no address returned");
      }
    } catch (err: any) {
      console.error("[useProxyWallet] Deploy failed:", err);
      throw err;
    } finally {
      setIsDeploying(false);
    }
  }, [address, isDeployed, getClient]);

  return {
    /** The deterministically derived Safe address */
    proxyAddress: safeAddress,
    /** True when the Safe contract is deployed on-chain */
    isDeployed,
    /** Deploy the Safe via the Polymarket relayer */
    deploy,
    /** True while the deployment transaction is pending */
    isDeploying: isDeploying || isChecking,
  };
}
