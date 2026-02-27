import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseUnits } from "viem";
import { useState, useEffect, useCallback } from "react";

// USDC.e (bridged) on Polygon — used by Polymarket CTF Exchange
const USDC_ADDRESS = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174" as const;
// Polymarket CTF Exchange on Polygon
const CTF_EXCHANGE = "0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E" as const;
// Neg Risk CTF Exchange on Polygon
const NEG_RISK_EXCHANGE = "0xC5d563A36AE78145C45a50134d48A1215220f80a" as const;

const MAX_APPROVAL = parseUnits("100000000", 6); // 100M USDC.e — effectively unlimited

const erc20Abi = [
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

const polygon = {
  id: 137,
  name: "Polygon",
  nativeCurrency: { name: "POL", symbol: "POL", decimals: 18 },
  rpcUrls: { default: { http: ["https://polygon-rpc.com"] } },
} as const;

/**
 * Step 3: "Approve Tokens"
 * Approves USDC.e spending for CTF Exchange and Neg Risk Exchange.
 * This is a standard ERC-20 approve — MetaMask shows "Spending cap request".
 * NO ERC-1155 setApprovalForAll (which triggers "NFT Withdrawal" warnings).
 */
export function useUsdcApproval(amountUsdc: number) {
  const { address } = useAccount();
  const [approvalTarget, setApprovalTarget] = useState<"ctf" | "neg" | null>(null);

  // Check CTF Exchange allowance
  const { data: ctfAllowance, refetch: refetchCtf } = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: "allowance",
    args: address ? [address, CTF_EXCHANGE] : undefined,
  });

  // Check Neg Risk Exchange allowance
  const { data: negAllowance, refetch: refetchNeg } = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: "allowance",
    args: address ? [address, NEG_RISK_EXCHANGE] : undefined,
  });

  const { data: balance } = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
  });

  const { writeContract, data: txHash, isPending } = useWriteContract();
  const { isLoading: confirming, isSuccess: confirmed } = useWaitForTransactionReceipt({ hash: txHash });

  // After confirmation, refetch and fire next approval if needed
  useEffect(() => {
    if (confirmed) {
      refetchCtf();
      refetchNeg();
      // If we just approved CTF and neg still needs approval, queue it
      if (approvalTarget === "ctf") {
        const negOk = negAllowance !== undefined && (negAllowance as bigint) > 0n;
        if (!negOk && address) {
          setApprovalTarget("neg");
          // Small delay to let refetch settle
          setTimeout(() => {
            writeContract({
              address: USDC_ADDRESS,
              abi: erc20Abi,
              functionName: "approve",
              args: [NEG_RISK_EXCHANGE, MAX_APPROVAL],
              account: address,
              chain: polygon,
            });
          }, 1000);
        } else {
          setApprovalTarget(null);
        }
      } else {
        setApprovalTarget(null);
      }
    }
  }, [confirmed]);

  const ctfOk = ctfAllowance !== undefined && (ctfAllowance as bigint) > 0n;
  const negOk = negAllowance !== undefined && (negAllowance as bigint) > 0n;
  const needsApproval = !ctfOk || !negOk;

  const approve = useCallback(() => {
    if (!address) return;
    if (!ctfOk) {
      setApprovalTarget("ctf");
      writeContract({
        address: USDC_ADDRESS,
        abi: erc20Abi,
        functionName: "approve",
        args: [CTF_EXCHANGE, MAX_APPROVAL],
        account: address,
        chain: polygon,
      });
    } else if (!negOk) {
      setApprovalTarget("neg");
      writeContract({
        address: USDC_ADDRESS,
        abi: erc20Abi,
        functionName: "approve",
        args: [NEG_RISK_EXCHANGE, MAX_APPROVAL],
        account: address,
        chain: polygon,
      });
    }
  }, [address, ctfOk, negOk, writeContract]);

  const approvalProgress = (ctfOk ? 1 : 0) + (negOk ? 1 : 0);
  const usdcBalance = balance ? Number(balance) / 1e6 : 0;

  return {
    needsApproval,
    approve,
    isApproving: isPending || confirming,
    isConfirmed: !needsApproval,
    usdcBalance,
    approvalProgress, // 0, 1, or 2
    ctfApproved: ctfOk,
    negApproved: negOk,
  };
}
