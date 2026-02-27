import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { useState, useEffect } from "react";

// Polymarket Conditional Tokens Framework on Polygon
const CONDITIONAL_TOKENS = "0x4D97DCd97eC945f40cF65F87097ACe5EA0476045" as const;
// CTF Exchange (operator that needs approval)
const CTF_EXCHANGE = "0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E" as const;
// Neg Risk CTF Exchange
const NEG_RISK_EXCHANGE = "0xC5d563A36AE78145C45a50134d48A1215220f80a" as const;
// Neg Risk Adapter
const NEG_RISK_ADAPTER = "0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296" as const;

const erc1155Abi = [
  {
    name: "isApprovedForAll",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "account", type: "address" },
      { name: "operator", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "setApprovalForAll",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "operator", type: "address" },
      { name: "approved", type: "bool" },
    ],
    outputs: [],
  },
] as const;

const polygon = {
  id: 137,
  name: "Polygon",
  nativeCurrency: { name: "POL", symbol: "POL", decimals: 18 },
  rpcUrls: { default: { http: ["https://polygon-rpc.com"] } },
} as const;

/**
 * Step 1: "Deploy Proxy Wallet"
 * Approves the CTF Exchange + Neg Risk Exchange + Neg Risk Adapter
 * as operators on the Conditional Tokens (ERC-1155) contract.
 * This is required before any trading can occur.
 */
export function useProxyWallet() {
  const { address } = useAccount();

  // Check each operator approval
  const { data: ctfApproved, refetch: refetchCtf } = useReadContract({
    address: CONDITIONAL_TOKENS,
    abi: erc1155Abi,
    functionName: "isApprovedForAll",
    args: address ? [address, CTF_EXCHANGE] : undefined,
  });

  const { data: negRiskApproved, refetch: refetchNegRisk } = useReadContract({
    address: CONDITIONAL_TOKENS,
    abi: erc1155Abi,
    functionName: "isApprovedForAll",
    args: address ? [address, NEG_RISK_EXCHANGE] : undefined,
  });

  const { data: negAdapterApproved, refetch: refetchAdapter } = useReadContract({
    address: CONDITIONAL_TOKENS,
    abi: erc1155Abi,
    functionName: "isApprovedForAll",
    args: address ? [address, NEG_RISK_ADAPTER] : undefined,
  });

  // We need up to 3 approval txns
  const { writeContract: write1, data: tx1, isPending: pending1 } = useWriteContract();
  const { writeContract: write2, data: tx2, isPending: pending2 } = useWriteContract();
  const { writeContract: write3, data: tx3, isPending: pending3 } = useWriteContract();

  const { isLoading: confirming1, isSuccess: confirmed1 } = useWaitForTransactionReceipt({ hash: tx1 });
  const { isLoading: confirming2, isSuccess: confirmed2 } = useWaitForTransactionReceipt({ hash: tx2 });
  const { isLoading: confirming3, isSuccess: confirmed3 } = useWaitForTransactionReceipt({ hash: tx3 });

  useEffect(() => {
    if (confirmed1 || confirmed2 || confirmed3) {
      refetchCtf();
      refetchNegRisk();
      refetchAdapter();
    }
  }, [confirmed1, confirmed2, confirmed3, refetchCtf, refetchNegRisk, refetchAdapter]);

  const isDeployed = !!ctfApproved && !!negRiskApproved && !!negAdapterApproved;

  const deploy = () => {
    if (!address) return;
    if (!ctfApproved) {
      write1({
        address: CONDITIONAL_TOKENS,
        abi: erc1155Abi,
        functionName: "setApprovalForAll",
        args: [CTF_EXCHANGE, true],
        account: address,
        chain: polygon,
      });
    }
    if (!negRiskApproved) {
      write2({
        address: CONDITIONAL_TOKENS,
        abi: erc1155Abi,
        functionName: "setApprovalForAll",
        args: [NEG_RISK_EXCHANGE, true],
        account: address,
        chain: polygon,
      });
    }
    if (!negAdapterApproved) {
      write3({
        address: CONDITIONAL_TOKENS,
        abi: erc1155Abi,
        functionName: "setApprovalForAll",
        args: [NEG_RISK_ADAPTER, true],
        account: address,
        chain: polygon,
      });
    }
  };

  return {
    isDeployed,
    ctfApproved: !!ctfApproved,
    negRiskApproved: !!negRiskApproved,
    negAdapterApproved: !!negAdapterApproved,
    deploy,
    isDeploying: pending1 || pending2 || pending3 || confirming1 || confirming2 || confirming3,
  };
}
