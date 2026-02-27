import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { maxUint256 } from "viem";
import { useMemo, useEffect } from "react";

const FALLBACK_USDC_E = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174" as const;
const FALLBACK_EXCHANGE = "0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E" as const;

const USDC_E_ADDRESS = (import.meta.env.VITE_USDC_E_ADDRESS || FALLBACK_USDC_E) as `0x${string}`;
const POLYMARKET_EXCHANGE_ADDRESS = (import.meta.env.VITE_POLYMARKET_EXCHANGE_ADDRESS || FALLBACK_EXCHANGE) as `0x${string}`;

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
 * Uses ONLY ERC-20 approve() on USDC.e for the Polymarket Exchange spender.
 * No ERC-1155 setApprovalForAll calls are made here.
 */
export function useUsdcApproval(amountUsdc: number) {
  const { address } = useAccount();

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: USDC_E_ADDRESS,
    abi: erc20Abi,
    functionName: "allowance",
    args: address ? [address, POLYMARKET_EXCHANGE_ADDRESS] : undefined,
  });

  const { data: balance } = useReadContract({
    address: USDC_E_ADDRESS,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
  });

  const { writeContract, data: txHash, isPending } = useWriteContract();
  const { isLoading: confirming, isSuccess: confirmed } = useWaitForTransactionReceipt({ hash: txHash });

  useEffect(() => {
    if (confirmed) {
      refetchAllowance();
    }
  }, [confirmed, refetchAllowance]);

  const requiredAllowance = useMemo(() => {
    if (amountUsdc > 0) {
      return BigInt(Math.floor(amountUsdc * 1_000_000));
    }
    return 1n;
  }, [amountUsdc]);

  const currentAllowance = (allowance as bigint | undefined) ?? 0n;
  const needsApproval = currentAllowance < requiredAllowance;

  const approve = () => {
    if (!address) return;
    writeContract({
      address: USDC_E_ADDRESS,
      abi: erc20Abi,
      functionName: "approve",
      args: [POLYMARKET_EXCHANGE_ADDRESS, maxUint256],
      account: address,
      chain: polygon,
    });
  };

  const usdcBalance = balance ? Number(balance) / 1e6 : 0;

  return {
    needsApproval,
    approve,
    isApproving: isPending || confirming,
    isConfirmed: !needsApproval,
    usdcBalance,
    approvalProgress: needsApproval ? 0 : 1,
    ctfApproved: !needsApproval,
    negApproved: true,
  };
}
