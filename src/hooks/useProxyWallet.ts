import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { useState, useEffect } from "react";

// Polymarket Conditional Tokens Framework on Polygon
const CONDITIONAL_TOKENS = "0x4D97DCd97eC945f40cF65F87097ACe5EA0476045" as const;
// CTF Exchange (operator that needs approval)
const CTF_EXCHANGE = "0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E" as const;
// Neg Risk CTF Exchange
const NEG_RISK_EXCHANGE = "0xC5d563A36AE78145C45a50134d48A1215220f80a" as const;

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

export function useProxyWallet() {
  const { address } = useAccount();
  const [isDeployed, setIsDeployed] = useState(false);

  // Check if CTF Exchange is approved as operator
  const { data: ctfApproved, refetch: refetchCtf } = useReadContract({
    address: CONDITIONAL_TOKENS,
    abi: erc1155Abi,
    functionName: "isApprovedForAll",
    args: address ? [address, CTF_EXCHANGE] : undefined,
  });

  // Check if Neg Risk Exchange is approved as operator
  const { data: negRiskApproved, refetch: refetchNegRisk } = useReadContract({
    address: CONDITIONAL_TOKENS,
    abi: erc1155Abi,
    functionName: "isApprovedForAll",
    args: address ? [address, NEG_RISK_EXCHANGE] : undefined,
  });

  const { writeContract, data: txHash, isPending: isDeploying } = useWriteContract();
  const { writeContract: writeContract2, data: txHash2, isPending: isDeploying2 } = useWriteContract();

  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash: txHash });
  const { isLoading: isConfirming2, isSuccess: isConfirmed2 } = useWaitForTransactionReceipt({ hash: txHash2 });

  useEffect(() => {
    if (isConfirmed || isConfirmed2) {
      refetchCtf();
      refetchNegRisk();
    }
  }, [isConfirmed, isConfirmed2, refetchCtf, refetchNegRisk]);

  useEffect(() => {
    setIsDeployed(!!ctfApproved && !!negRiskApproved);
  }, [ctfApproved, negRiskApproved]);

  const deploy = () => {
    if (!address) return;
    // Approve CTF Exchange
    if (!ctfApproved) {
      writeContract({
        address: CONDITIONAL_TOKENS,
        abi: erc1155Abi,
        functionName: "setApprovalForAll",
        args: [CTF_EXCHANGE, true],
        account: address,
        chain: polygon,
      });
    }
    // Approve Neg Risk Exchange
    if (!negRiskApproved) {
      writeContract2({
        address: CONDITIONAL_TOKENS,
        abi: erc1155Abi,
        functionName: "setApprovalForAll",
        args: [NEG_RISK_EXCHANGE, true],
        account: address,
        chain: polygon,
      });
    }
  };

  return {
    isDeployed,
    ctfApproved: !!ctfApproved,
    negRiskApproved: !!negRiskApproved,
    deploy,
    isDeploying: isDeploying || isDeploying2 || isConfirming || isConfirming2,
    isConfirmed: isConfirmed && isConfirmed2,
  };
}
