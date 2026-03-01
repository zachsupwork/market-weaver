// ── Polygon Mainnet Token Contracts ──────────────────────────────
export const USDC_E = {
  symbol: "USDC.e",
  address: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174" as `0x${string}`,
  decimals: 6,
  description: "Bridged USDC (USDC.e) — required for Polymarket trading",
} as const;

export const USDC_NATIVE = {
  symbol: "USDC",
  address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359" as `0x${string}`,
  decimals: 6,
  description: "Native USDC (Circle) on Polygon",
} as const;

// Polymarket trading contracts
export const CTF_CONTRACT = "0x4D97DCd97eC945f40cF65F87097ACe5EA0476045" as `0x${string}`;
export const CTF_EXCHANGE = "0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E" as `0x${string}`;
export const NEG_RISK_CTF_EXCHANGE = "0xC5d563A36AE78145C45a50134d48A1215220f80a" as `0x${string}`;
export const NEG_RISK_ADAPTER = "0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296" as `0x${string}`;

export const ERC20_SPENDERS = [CTF_CONTRACT, CTF_EXCHANGE, NEG_RISK_CTF_EXCHANGE, NEG_RISK_ADAPTER] as const;
export const ERC1155_OPERATORS = [CTF_EXCHANGE, NEG_RISK_CTF_EXCHANGE, NEG_RISK_ADAPTER] as const;

// External swap/bridge URLs
export const USDC_TO_USDC_E_SWAP_URL = "https://app.uniswap.org/swap?inputCurrency=0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359&outputCurrency=0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174&chain=polygon";
