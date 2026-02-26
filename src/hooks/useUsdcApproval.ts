import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseUnits } from "viem";
import { useState, useEffect } from "react";

const USDC_ADDRESS = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359" as const;
// Polymarket CTF Exchange on Polygon
const CTF_EXCHANGE = "0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E" as const;

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

export function useUsdcApproval(amountUsdc: number) {
  const { address } = useAccount();
  const [needsApproval, setNeedsApproval] = useState(false);

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: "allowance",
    args: address ? [address, CTF_EXCHANGE] : undefined,
  });

  const { data: balance } = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
  });

  const { writeContract, data: txHash, isPending: isApproving } = useWriteContract();

  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  useEffect(() => {
    if (isConfirmed) {
      refetchAllowance();
    }
  }, [isConfirmed, refetchAllowance]);

  useEffect(() => {
    if (allowance !== undefined && amountUsdc > 0) {
      const required = parseUnits(amountUsdc.toFixed(6), 6);
      setNeedsApproval((allowance as bigint) < required);
    }
  }, [allowance, amountUsdc]);

  const approve = () => {
    if (!address) return;
    writeContract({
      address: USDC_ADDRESS,
      abi: erc20Abi,
      functionName: "approve",
      args: [CTF_EXCHANGE, parseUnits("1000000", 6)],
      account: address,
      chain: { id: 137, name: "Polygon", nativeCurrency: { name: "POL", symbol: "POL", decimals: 18 }, rpcUrls: { default: { http: ["https://polygon-rpc.com"] } } },
    });
  };

  const usdcBalance = balance ? Number(balance) / 1e6 : 0;

  return {
    needsApproval,
    approve,
    isApproving: isApproving || isConfirming,
    isConfirmed,
    usdcBalance,
  };
}
