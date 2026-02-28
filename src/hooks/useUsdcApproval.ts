import { useState, useCallback, useEffect, useMemo } from "react";
import { useAccount, usePublicClient } from "wagmi";
import { encodeFunctionData, maxUint256, erc20Abi } from "viem";
import { useRelayClient } from "./useRelayClient";

// ── Contract addresses (Polygon mainnet) ────────────────────────
const USDC_E = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174" as const;
const CTF_CONTRACT = "0x4D97DCd97eC945f40cF65F87097ACe5EA0476045" as const;
const CTF_EXCHANGE = "0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E" as const;
const NEG_RISK_CTF_EXCHANGE = "0xC5d563A36AE78145C45a50134d48A1215220f80a" as const;
const NEG_RISK_ADAPTER = "0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296" as const;

// ERC-20 approve spenders (USDC.e → 4 contracts)
const ERC20_SPENDERS = [CTF_CONTRACT, CTF_EXCHANGE, NEG_RISK_CTF_EXCHANGE, NEG_RISK_ADAPTER] as const;

// ERC-1155 setApprovalForAll operators (CTF → 3 contracts)
const ERC1155_OPERATORS = [CTF_EXCHANGE, NEG_RISK_CTF_EXCHANGE, NEG_RISK_ADAPTER] as const;

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
 * Batch-approves all necessary contracts for USDC.e (ERC-20) and
 * outcome tokens (ERC-1155) via the Polymarket Builder Relayer.
 * All approvals execute in a single gasless transaction — the user
 * only signs once and the relayer pays gas.
 */
export function useUsdcApproval(safeAddress: string | null) {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { getClient } = useRelayClient();

  const [allApproved, setAllApproved] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [usdcBalance, setUsdcBalance] = useState(0);

  // Check all approvals on-chain
  const checkApprovals = useCallback(async () => {
    if (!safeAddress || !publicClient) return;
    setIsChecking(true);
    try {
      const safeAddr = safeAddress as `0x${string}`;

      // Check ERC-20 allowances
      const erc20Checks = await Promise.all(
        ERC20_SPENDERS.map((spender) =>
          publicClient.readContract({
            address: USDC_E,
            abi: erc20Abi,
            functionName: "allowance",
            args: [safeAddr, spender],
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
            args: [safeAddr, operator],
          } as any)
        )
      );

      // Check USDC.e balance
      const balance = await publicClient.readContract({
        address: USDC_E,
        abi: balanceOfAbi,
        functionName: "balanceOf",
        args: [safeAddr],
      } as any);
      setUsdcBalance(Number(balance) / 1e6);

      // All ERC-20 allowances must be > 0, all ERC-1155 must be true
      const erc20Ok = erc20Checks.every((a) => (a as bigint) > 0n);
      const erc1155Ok = erc1155Checks.every((a) => a === true);
      setAllApproved(erc20Ok && erc1155Ok);
    } catch (err) {
      console.warn("[useUsdcApproval] Check failed:", err);
      setAllApproved(false);
    } finally {
      setIsChecking(false);
    }
  }, [safeAddress, publicClient]);

  useEffect(() => {
    if (safeAddress) checkApprovals();
  }, [safeAddress, checkApprovals]);

  // Create batch approval transactions
  const createApprovalTxs = useCallback(() => {
    const txs: Array<{ to: string; data: string; value: string }> = [];

    // ERC-20 approvals (USDC.e → 4 spenders)
    for (const spender of ERC20_SPENDERS) {
      txs.push({
        to: USDC_E,
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: "approve",
          args: [spender, maxUint256],
        }),
        value: "0",
      });
    }

    // ERC-1155 approvals (CTF → 3 operators)
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

  // Execute all approvals in one gasless batch
  const approve = useCallback(async () => {
    if (!address || allApproved) return;
    setIsApproving(true);
    try {
      const client = await getClient();
      const txs = createApprovalTxs();
      const response = await client.execute(txs, "Set all token approvals for trading");
      await response.wait();
      setAllApproved(true);
      // Re-check to confirm
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
    approvalProgress: allApproved ? 1 : 0,
  };
}
