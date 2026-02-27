import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseUnits } from "viem";
import { useState, useEffect } from "react";

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
 * Approves USDC.e spending for both CTF Exchange and Neg Risk Exchange.
 */
export function useUsdcApproval(amountUsdc: number) {
  const { address } = useAccount();
  const [needsApproval, setNeedsApproval] = useState(false);

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

  const { writeContract: write1, data: tx1, isPending: pending1 } = useWriteContract();
  const { writeContract: write2, data: tx2, isPending: pending2 } = useWriteContract();

  const { isLoading: confirming1, isSuccess: confirmed1 } = useWaitForTransactionReceipt({ hash: tx1 });
  const { isLoading: confirming2, isSuccess: confirmed2 } = useWaitForTransactionReceipt({ hash: tx2 });

  useEffect(() => {
    if (confirmed1 || confirmed2) {
      refetchCtf();
      refetchNeg();
    }
  }, [confirmed1, confirmed2, refetchCtf, refetchNeg]);

  useEffect(() => {
    if (ctfAllowance !== undefined && negAllowance !== undefined && amountUsdc > 0) {
      const required = parseUnits(amountUsdc.toFixed(6), 6);
      const ctfOk = (ctfAllowance as bigint) >= required;
      const negOk = (negAllowance as bigint) >= required;
      setNeedsApproval(!ctfOk || !negOk);
    } else if (amountUsdc <= 0) {
      // When no amount specified, check if we have any allowance at all
      const ctfOk = ctfAllowance !== undefined && (ctfAllowance as bigint) > 0n;
      const negOk = negAllowance !== undefined && (negAllowance as bigint) > 0n;
      setNeedsApproval(!ctfOk || !negOk);
    }
  }, [ctfAllowance, negAllowance, amountUsdc]);

  const approve = () => {
    if (!address) return;
    const ctfOk = ctfAllowance !== undefined && (ctfAllowance as bigint) > 0n;
    const negOk = negAllowance !== undefined && (negAllowance as bigint) > 0n;

    if (!ctfOk) {
      write1({
        address: USDC_ADDRESS,
        abi: erc20Abi,
        functionName: "approve",
        args: [CTF_EXCHANGE, MAX_APPROVAL],
        account: address,
        chain: polygon,
      });
    }
    if (!negOk) {
      write2({
        address: USDC_ADDRESS,
        abi: erc20Abi,
        functionName: "approve",
        args: [NEG_RISK_EXCHANGE, MAX_APPROVAL],
        account: address,
        chain: polygon,
      });
    }
  };

  const usdcBalance = balance ? Number(balance) / 1e6 : 0;

  return {
    needsApproval,
    approve,
    isApproving: pending1 || pending2 || confirming1 || confirming2,
    isConfirmed: !needsApproval,
    usdcBalance,
  };
}
