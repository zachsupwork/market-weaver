import { useAccount } from "wagmi";

/**
 * Step 1: "Deploy Proxy Wallet"
 *
 * For EOA-based trading (MetaMask / RainbowKit), the connected wallet
 * IS the trading wallet — no Safe proxy deployment is needed.
 *
 * Polymarket.com deploys a Gnosis Safe via their builder relayer,
 * but that requires builder API credentials we don't have.
 * For direct EOA trading on the CLOB, a connected wallet is sufficient.
 *
 * This hook simply checks whether a wallet is connected.
 */
export function useProxyWallet() {
  const { address, isConnected } = useAccount();

  return {
    /** True when a wallet is connected — EOA is ready to trade */
    isDeployed: isConnected && !!address,
    /** No deployment transaction needed for EOA users */
    deploy: () => {
      // No-op: EOA wallet is already "deployed"
    },
    isDeploying: false,
    /** Wallet address (acts as the proxy) */
    proxyAddress: address ?? null,
  };
}
