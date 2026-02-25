import "dotenv/config";
import pino from "pino";
import { ethers } from "ethers";
import { encrypt } from "../lib/crypto.js";

const log = pino({ transport: { target: "pino-pretty" } });

async function main() {
  const privateKey = process.env.PM_PRIVATE_KEY;
  const masterKey = process.env.MASTER_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const chainId = parseInt(process.env.CHAIN_ID || "137");
  const clobHost = process.env.CLOB_HOST || "https://clob.polymarket.com";
  const printCreds = process.env.PRINT_CREDS === "true";

  if (!privateKey) { log.error("PM_PRIVATE_KEY is required"); process.exit(1); }
  if (!masterKey) { log.error("MASTER_KEY is required"); process.exit(1); }
  if (!supabaseUrl || !supabaseServiceKey) {
    log.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
    process.exit(1);
  }

  log.info("Deriving real Polymarket CLOB API credentials via L1 wallet signature...");
  log.info(`Chain ID: ${chainId}, CLOB Host: ${clobHost}`);

  const wallet = new ethers.Wallet(privateKey);
  const address = await wallet.getAddress();
  log.info(`Wallet address: ${address}`);

  try {
    // Try using @polymarket/clob-client if available
    let creds: { apiKey: string; secret: string; passphrase: string };

    try {
      const { ClobClient } = await import("@polymarket/clob-client");
      log.info("Using @polymarket/clob-client for credential derivation...");
      const client = new ClobClient(clobHost, chainId, wallet);
      const result = await client.createOrDeriveApiKey();
      creds = {
        apiKey: result.apiKey || result.key,
        secret: result.secret,
        passphrase: result.passphrase,
      };
    } catch (importErr: any) {
      log.warn(`@polymarket/clob-client not available (${importErr.message}), falling back to manual derivation...`);

      // Manual L1 signature flow
      // Step 1: Get nonce
      const nonceRes = await fetch(`${clobHost}/auth/nonce`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });
      if (!nonceRes.ok) {
        throw new Error(`Failed to get nonce: ${nonceRes.status} ${await nonceRes.text()}`);
      }
      const nonce = await nonceRes.text();

      // Step 2: Sign auth message
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const message = `Login to Polymarket\nTimestamp: ${timestamp}\nNonce: ${nonce}`;
      const signature = await wallet.signMessage(message);

      // Step 3: Derive API key
      const deriveRes = await fetch(`${clobHost}/auth/derive-api-key`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, signature, timestamp, nonce }),
      });

      if (!deriveRes.ok) {
        log.warn("derive-api-key failed, trying create-api-key...");
        const createRes = await fetch(`${clobHost}/auth/create-api-key`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message, signature, timestamp, nonce }),
        });
        if (!createRes.ok) {
          throw new Error(`Both derive and create API key failed: ${await createRes.text()}`);
        }
        const createData = await createRes.json();
        creds = {
          apiKey: createData.apiKey || createData.key,
          secret: createData.secret,
          passphrase: createData.passphrase,
        };
      } else {
        const data = await deriveRes.json();
        creds = {
          apiKey: data.apiKey || data.key,
          secret: data.secret,
          passphrase: data.passphrase,
        };
      }
    }

    log.info("✅ Real credentials derived successfully");

    // Encrypt with AES-256-GCM (same scheme Edge Functions use)
    const payload = JSON.stringify({
      apiKey: creds.apiKey,
      secret: creds.secret,
      passphrase: creds.passphrase,
      address,
      derivedAt: new Date().toISOString(),
    });
    const { encrypted, iv, authTag } = encrypt(payload, masterKey);

    // Upsert into Supabase polymarket_secrets table
    const res = await fetch(`${supabaseUrl}/rest/v1/polymarket_secrets?on_conflict=name`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": supabaseServiceKey,
        "Authorization": `Bearer ${supabaseServiceKey}`,
        "Prefer": "resolution=merge-duplicates",
      },
      body: JSON.stringify({
        name: "polymarket_api_creds",
        value_encrypted: encrypted,
        iv,
        auth_tag: authTag,
        updated_at: new Date().toISOString(),
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Supabase upsert failed: ${res.status} ${errText}`);
    }

    log.info("✅ Stored real Polymarket creds to Supabase (encrypted)");

    if (printCreds) {
      log.info("=== CREDENTIALS (shown because PRINT_CREDS=true) ===");
      log.info(`API Key:    ${creds.apiKey}`);
      log.info(`Secret:     ${creds.secret}`);
      log.info(`Passphrase: ${creds.passphrase}`);
      log.info(`Address:    ${address}`);
      log.info("=====================================================");
    } else {
      log.info("Set PRINT_CREDS=true to display credentials (default: hidden)");
    }

    log.info("You can now use 'Test Auth' in the UI to verify.");
  } catch (err) {
    log.error(err, "Failed to derive and store credentials");
    process.exit(1);
  }
}

main();
