import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { useState, useEffect, useCallback } from "react";

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
 * Fires ONE approval at a time to avoid wallet confusion.
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

  const { writeContract, data: txHash, isPending } = useWriteContract();
  const { isLoading: confirming, isSuccess: confirmed } = useWaitForTransactionReceipt({ hash: txHash });

  // After any confirmation, refetch all approval states
  useEffect(() => {
    if (confirmed) {
      refetchCtf();
      refetchNegRisk();
      refetchAdapter();
    }
  }, [confirmed, refetchCtf, refetchNegRisk, refetchAdapter]);

  const isDeployed = !!ctfApproved && !!negRiskApproved && !!negAdapterApproved;

  // Determine which approval is needed next and its label
  const nextApproval = !ctfApproved
    ? { operator: CTF_EXCHANGE, label: "CTF Exchange" }
    : !negRiskApproved
    ? { operator: NEG_RISK_EXCHANGE, label: "Neg Risk Exchange" }
    : !negAdapterApproved
    ? { operator: NEG_RISK_ADAPTER, label: "Neg Risk Adapter" }
    : null;

  const approvalProgress = [!!ctfApproved, !!negRiskApproved, !!negAdapterApproved].filter(Boolean).length;

  const deploy = useCallback(() => {
    if (!address || !nextApproval) return;
    writeContract({
      address: CONDITIONAL_TOKENS,
      abi: erc1155Abi,
      functionName: "setApprovalForAll",
      args: [nextApproval.operator, true],
      account: address,
      chain: polygon,
    });
  }, [address, nextApproval, writeContract]);

  return {
    isDeployed,
    ctfApproved: !!ctfApproved,
    negRiskApproved: !!negRiskApproved,
    negAdapterApproved: !!negAdapterApproved,
    deploy,
    isDeploying: isPending || confirming,
    nextApprovalLabel: nextApproval?.label ?? null,
    approvalProgress, // 0-3
  };
}
