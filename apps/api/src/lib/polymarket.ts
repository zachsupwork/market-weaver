import { ethers } from "ethers";
import pino from "pino";

const log = pino({ transport: { target: "pino-pretty" } });

export interface PolymarketCreds {
  apiKey: string;
  secret: string;
  passphrase: string;
}

/**
 * Derives Polymarket CLOB API credentials using L1 wallet signature.
 * 
 * Flow: 
 * 1. Create wallet from PM_PRIVATE_KEY
 * 2. Sign the CLOB auth message
 * 3. Call createOrDeriveApiKey on the CLOB API
 * 4. Return { apiKey, secret, passphrase }
 */
export async function deriveApiCredentials(): Promise<PolymarketCreds> {
  const privateKey = process.env.PM_PRIVATE_KEY;
  const chainId = parseInt(process.env.CHAIN_ID || "137");
  const clobHost = process.env.CLOB_HOST || "https://clob.polymarket.com";

  if (!privateKey) throw new Error("PM_PRIVATE_KEY not set");

  const wallet = new ethers.Wallet(privateKey);
  const address = await wallet.getAddress();
  log.info(`Deriving API credentials for address: ${address}`);

  // Step 1: Get nonce
  const nonceRes = await fetch(`${clobHost}/auth/nonce`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });
  
  if (!nonceRes.ok) {
    throw new Error(`Failed to get nonce: ${nonceRes.status} ${await nonceRes.text()}`);
  }
  
  const nonce = await nonceRes.text();

  // Step 2: Sign the auth message  
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const message = `Login to Polymarket\nTimestamp: ${timestamp}\nNonce: ${nonce}`;
  const signature = await wallet.signMessage(message);

  // Step 3: Derive API key
  const deriveRes = await fetch(`${clobHost}/auth/derive-api-key`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      signature,
      timestamp,
      nonce,
    }),
  });

  if (!deriveRes.ok) {
    const errorText = await deriveRes.text();
    log.error(`Derive API key failed: ${deriveRes.status} ${errorText}`);
    
    // Fallback: try create endpoint
    log.info("Attempting fallback to /auth/create-api-key...");
    const createRes = await fetch(`${clobHost}/auth/create-api-key`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, signature, timestamp, nonce }),
    });

    if (!createRes.ok) {
      throw new Error(`Both derive and create API key failed. Last error: ${await createRes.text()}`);
    }

    const createData = await createRes.json();
    return {
      apiKey: createData.apiKey || createData.key,
      secret: createData.secret,
      passphrase: createData.passphrase,
    };
  }

  const data = await deriveRes.json();
  return {
    apiKey: data.apiKey || data.key,
    secret: data.secret,
    passphrase: data.passphrase,
  };
}

/**
 * Test stored credentials against the CLOB API
 */
export async function testCredentials(creds: PolymarketCreds): Promise<boolean> {
  const clobHost = process.env.CLOB_HOST || "https://clob.polymarket.com";
  
  try {
    const res = await fetch(`${clobHost}/auth/api-key`, {
      headers: {
        "Authorization": `Bearer ${creds.apiKey}`,
        "Content-Type": "application/json",
      },
    });
    return res.ok;
  } catch {
    return false;
  }
}
