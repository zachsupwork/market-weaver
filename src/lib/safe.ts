import { ethers } from "ethers";

const SAFE_ABI = [
  "function nonce() view returns (uint256)",
  "function execTransaction(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, bytes signatures) payable returns (bool success)",
  "function getOwners() view returns (address[])",
];

const ERC20_IFACE = new ethers.utils.Interface([
  "function transfer(address to, uint256 value) returns (bool)",
]);

const SAFE_TX_TYPES = {
  SafeTx: [
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "data", type: "bytes" },
    { name: "operation", type: "uint8" },
    { name: "safeTxGas", type: "uint256" },
    { name: "baseGas", type: "uint256" },
    { name: "gasPrice", type: "uint256" },
    { name: "gasToken", type: "address" },
    { name: "refundReceiver", type: "address" },
    { name: "nonce", type: "uint256" },
  ],
};

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export interface SafeTransaction {
  to: string;
  value: string;
  data: string;
  operation: number;
  safeTxGas: number;
  baseGas: number;
  gasPrice: string;
  gasToken: string;
  refundReceiver: string;
  nonce: number;
}

/** Fetch current nonce from the Safe contract */
export async function getSafeNonce(
  safeAddress: string,
  provider: ethers.providers.Provider
): Promise<number> {
  const safe = new ethers.Contract(safeAddress, SAFE_ABI, provider);
  const nonce = await safe.nonce();
  return nonce.toNumber();
}

/** Build a Safe transaction that transfers an ERC-20 token */
export function buildSafeTransferTx(
  tokenAddress: string,
  recipient: string,
  amount: ethers.BigNumber,
  nonce: number
): SafeTransaction {
  const data = ERC20_IFACE.encodeFunctionData("transfer", [recipient, amount]);
  return {
    to: tokenAddress,
    value: "0",
    data,
    operation: 0,
    safeTxGas: 0,
    baseGas: 0,
    gasPrice: "0",
    gasToken: ZERO_ADDRESS,
    refundReceiver: ZERO_ADDRESS,
    nonce,
  };
}

/** Sign a Safe transaction using EIP-712 */
export async function signSafeTransaction(
  safeTx: SafeTransaction,
  signer: ethers.Signer,
  safeAddress: string,
  chainId: number = 137
): Promise<string> {
  const domain = { chainId, verifyingContract: safeAddress };
  // ethers v5 _signTypedData
  const rawSig = await (signer as any)._signTypedData(domain, SAFE_TX_TYPES, safeTx);
  // Adjust v value for Safe contract (add 4 to indicate eth_sign style)
  const { r, s, v } = ethers.utils.splitSignature(rawSig);
  // For EIP-712 _signTypedData, pass v as-is (27 or 28). Do NOT add 4 (that's for eth_sign).
  return ethers.utils.solidityPack(["bytes32", "bytes32", "uint8"], [r, s, v]);
}

/** Execute a signed Safe transaction on-chain */
export async function executeSafeTransaction(
  safeAddress: string,
  safeTx: SafeTransaction,
  signature: string,
  signer: ethers.Signer
): Promise<ethers.ContractTransaction> {
  const safe = new ethers.Contract(safeAddress, SAFE_ABI, signer);
  return safe.execTransaction(
    safeTx.to,
    safeTx.value,
    safeTx.data,
    safeTx.operation,
    safeTx.safeTxGas,
    safeTx.baseGas,
    safeTx.gasPrice,
    safeTx.gasToken,
    safeTx.refundReceiver,
    signature
  );
}

/**
 * Full withdraw flow: build → sign → execute a USDC.e transfer from Safe to recipient.
 * Returns the transaction receipt.
 */
export async function withdrawFromSafe(params: {
  safeAddress: string;
  tokenAddress: string;
  recipient: string;
  amount: ethers.BigNumber;
  signer: ethers.Signer;
  chainId?: number;
}): Promise<ethers.ContractReceipt> {
  const { safeAddress, tokenAddress, recipient, amount, signer, chainId = 137 } = params;
  const provider = signer.provider!;

  // 1. Fetch nonce
  const nonce = await getSafeNonce(safeAddress, provider);

  // 2. Build transaction
  const safeTx = buildSafeTransferTx(tokenAddress, recipient, amount, nonce);

  // 3. Sign
  const signature = await signSafeTransaction(safeTx, signer, safeAddress, chainId);

  // 4. Execute
  const tx = await executeSafeTransaction(safeAddress, safeTx, signature, signer);
  return tx.wait();
}

// ── CTF Redemption ──────────────────────────────────────────────

/** Polymarket CTF contract on Polygon */
export const CTF_ADDRESS = "0x4D97DCd97eC945f40cF65F87097ACe5EA0476045";

/** USDC.e collateral on Polygon */
const COLLATERAL_TOKEN = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";

const CTF_REDEEM_IFACE = new ethers.utils.Interface([
  "function redeemPositions(address collateralToken, bytes32 parentCollectionId, bytes32 conditionId, uint256[] indexSets)",
]);

/**
 * Build a Safe transaction that calls CTF.redeemPositions for a binary market.
 * indexSets [1, 2] covers both YES (index 0 → 2^0=1) and NO (index 1 → 2^1=2).
 */
export function buildRedeemTx(
  conditionId: string,
  nonce: number,
  indexSets: number[] = [1, 2]
): SafeTransaction {
  const data = CTF_REDEEM_IFACE.encodeFunctionData("redeemPositions", [
    COLLATERAL_TOKEN,
    ethers.constants.HashZero, // parentCollectionId = 0 for top-level
    conditionId,
    indexSets,
  ]);
  return {
    to: CTF_ADDRESS,
    value: "0",
    data,
    operation: 0,
    safeTxGas: 0,
    baseGas: 0,
    gasPrice: "0",
    gasToken: ZERO_ADDRESS,
    refundReceiver: ZERO_ADDRESS,
    nonce,
  };
}

/**
 * Full redeem flow: build → sign → execute CTF.redeemPositions via the user's Safe.
 * Returns the transaction receipt.
 */
export async function redeemFromSafe(params: {
  safeAddress: string;
  conditionId: string;
  signer: ethers.Signer;
  chainId?: number;
  indexSets?: number[];
}): Promise<ethers.ContractReceipt> {
  const { safeAddress, conditionId, signer, chainId = 137, indexSets = [1, 2] } = params;
  const provider = signer.provider!;

  const nonce = await getSafeNonce(safeAddress, provider);
  const safeTx = buildRedeemTx(conditionId, nonce, indexSets);
  const signature = await signSafeTransaction(safeTx, signer, safeAddress, chainId);
  const tx = await executeSafeTransaction(safeAddress, safeTx, signature, signer);
  return tx.wait();
}
