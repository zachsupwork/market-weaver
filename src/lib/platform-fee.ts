// Platform fee configuration for client-side USDC.e transfers
export const PLATFORM_FEE_BPS = 50; // 0.5%
export const FEE_WALLET_ADDRESS = "0x37258576A4b2552f4Bec685003f96A314b97C011" as `0x${string}`;

// ERC-20 minimal ABI for transfer
export const ERC20_TRANSFER_ABI = [
  {
    name: "transfer",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

export const MINIMUM_FEE_USD = 0.01; // minimum fee: 1 cent

export function calculatePlatformFee(amountUsd: number): { fee: number; netAmount: number } {
  if (PLATFORM_FEE_BPS <= 0 || FEE_WALLET_ADDRESS === "0x0000000000000000000000000000000000000000") {
    return { fee: 0, netAmount: amountUsd };
  }
  const rawFee = (amountUsd * PLATFORM_FEE_BPS) / 10000;
  // Round up to 2 decimals, enforce minimum fee of 1 cent
  const fee = Math.max(MINIMUM_FEE_USD, Math.ceil(rawFee * 100) / 100);
  return { fee, netAmount: Math.round((amountUsd - fee) * 100) / 100 };
}

export function isFeeEnabled(): boolean {
  return PLATFORM_FEE_BPS > 0 && FEE_WALLET_ADDRESS !== "0x0000000000000000000000000000000000000000";
}
