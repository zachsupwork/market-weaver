import "dotenv/config";
import pino from "pino";
import { deriveApiCredentials } from "../lib/polymarket.js";
import { encrypt } from "../lib/crypto.js";

const log = pino({ transport: { target: "pino-pretty" } });

async function main() {
  const masterKey = process.env.MASTER_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!masterKey) { log.error("MASTER_KEY is required"); process.exit(1); }
  if (!supabaseUrl || !supabaseServiceKey) {
    log.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
    process.exit(1);
  }

  log.info("Deriving Polymarket CLOB API credentials via L1 wallet signature...");

  try {
    const creds = await deriveApiCredentials();
    log.info("✅ Credentials derived successfully");

    // Encrypt with same scheme Edge Functions use (SHA-256 key derivation + AES-256-GCM)
    const payload = JSON.stringify(creds);
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

    log.info("✅ Credentials stored in cloud database");
    log.info("=== CREDENTIALS (shown ONCE — save securely) ===");
    log.info(`API Key:    ${creds.apiKey}`);
    log.info(`Secret:     ${creds.secret}`);
    log.info(`Passphrase: ${creds.passphrase}`);
    log.info("================================================");
    log.info("You can now use 'Test Auth' in the UI to verify.");
  } catch (err) {
    log.error(err, "Failed to derive and store credentials");
    process.exit(1);
  }
}

main();
