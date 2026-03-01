import { useState, useCallback, useEffect } from "react";
import { useAccount, usePublicClient } from "wagmi";
import { encodeFunctionData, maxUint256, erc20Abi } from "viem";
import { useRelayClient } from "./useRelayClient";
import {
  USDC_E,
  USDC_NATIVE,
  CTF_CONTRACT,
  ERC20_SPENDERS,
  ERC1155_OPERATORS,
} from "@/lib/tokens";

const erc1155Abi = [
  {
    name: "setApprovalForAll",
    type: "function" as const,
    stateMutability: "nonpayable" as const,
    inputs: [
      { name: "operator", type: "address" },
      { name: "approved", type: "bool" },
    ],
    outputs: [],
  },
  {
    name: "isApprovedForAll",
    type: "function" as const,
    stateMutability: "view" as const,
    inputs: [
      { name: "account", type: "address" },
      { name: "operator", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

const balanceOfAbi = [
  {
    name: "balanceOf",
    type: "function" as const,
    stateMutability: "view" as const,
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

/**
 * Step 2: "Approve Tokens"
 *
 * Checks USDC.e approvals + balances for both USDC.e and native USDC.
 * Approvals execute via the Polymarket Builder Relayer (gasless).
 */
export function useUsdcApproval(traderAddress: string | null) {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { getClient } = useRelayClient();

  const [allApproved, setAllApproved] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [usdcBalance, setUsdcBalance] = useState(0);        // USDC.e
  const [usdcNativeBalance, setUsdcNativeBalance] = useState(0); // native USDC

  const checkApprovals = useCallback(async () => {
    if (!traderAddress || !publicClient) return;
    setIsChecking(true);
    try {
      const traderAddr = traderAddress as `0x${string}`;

      // Check ERC-20 allowances (USDC.e)
      const erc20Checks = await Promise.all(
        ERC20_SPENDERS.map((spender) =>
          publicClient.readContract({
            address: USDC_E.address,
            abi: erc20Abi,
            functionName: "allowance",
            args: [traderAddr, spender],
          } as any)
        )
      );

      // Check ERC-1155 approvals
      const erc1155Checks = await Promise.all(
        ERC1155_OPERATORS.map((operator) =>
          publicClient.readContract({
            address: CTF_CONTRACT,
            abi: erc1155Abi,
            functionName: "isApprovedForAll",
            args: [traderAddr, operator],
          } as any)
        )
      );

      // Check USDC.e balance
      const balE = await publicClient.readContract({
        address: USDC_E.address,
        abi: balanceOfAbi,
        functionName: "balanceOf",
        args: [traderAddr],
      } as any);
      setUsdcBalance(Number(balE) / 1e6);

      // Check native USDC balance
      const balNative = await publicClient.readContract({
        address: USDC_NATIVE.address,
        abi: balanceOfAbi,
        functionName: "balanceOf",
        args: [traderAddr],
      } as any);
      setUsdcNativeBalance(Number(balNative) / 1e6);

      const erc20Ok = erc20Checks.every((a) => (a as bigint) > 0n);
      const erc1155Ok = erc1155Checks.every((a) => a === true);
      setAllApproved(erc20Ok && erc1155Ok);
    } catch (err) {
      console.warn("[useUsdcApproval] Check failed:", err);
      setAllApproved(false);
    } finally {
      setIsChecking(false);
    }
  }, [traderAddress, publicClient]);

  useEffect(() => {
    setAllApproved(false);
    if (traderAddress) checkApprovals();
  }, [traderAddress, checkApprovals]);

  // Create batch approval transactions
  const createApprovalTxs = useCallback(() => {
    const txs: Array<{ to: string; data: string; value: string }> = [];

    for (const spender of ERC20_SPENDERS) {
      txs.push({
        to: USDC_E.address,
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: "approve",
          args: [spender, maxUint256],
        }),
        value: "0",
      });
    }

    for (const operator of ERC1155_OPERATORS) {
      txs.push({
        to: CTF_CONTRACT,
        data: encodeFunctionData({
          abi: erc1155Abi,
          functionName: "setApprovalForAll",
          args: [operator, true],
        }),
        value: "0",
      });
    }

    return txs;
  }, []);

  const approve = useCallback(async () => {
    if (!address || allApproved) return;
    setIsApproving(true);
    try {
      const client = await getClient();
      const txs = createApprovalTxs();
      const response = await client.execute(txs, "Set all token approvals for trading");
      await response.wait();
      setAllApproved(true);
      await checkApprovals();
    } catch (err: any) {
      console.error("[useUsdcApproval] Approve failed:", err);
      throw err;
    } finally {
      setIsApproving(false);
    }
  }, [address, allApproved, getClient, createApprovalTxs, checkApprovals]);

  return {
    needsApproval: !allApproved,
    approve,
    isApproving: isApproving || isChecking,
    isConfirmed: allApproved,
    usdcBalance,
    usdcNativeBalance,
    approvalProgress: allApproved ? 1 : 0,
    recheckBalances: checkApprovals,
  };
}
