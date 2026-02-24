import "dotenv/config";
import pino from "pino";
import { deriveApiCredentials } from "../lib/polymarket.js";
import { storeCreds } from "../lib/secret-store.js";

const log = pino({ transport: { target: "pino-pretty" } });

async function main() {
  log.info("Deriving Polymarket CLOB API credentials...");

  const masterKey = process.env.MASTER_KEY;
  if (!masterKey) {
    log.error("MASTER_KEY is required");
    process.exit(1);
  }

  try {
    const creds = await deriveApiCredentials();
    const updatedAt = storeCreds("polymarket_api_creds", JSON.stringify(creds), masterKey);

    log.info("=== CREDENTIALS (shown ONCE — save securely) ===");
    log.info(`API Key:    ${creds.apiKey}`);
    log.info(`Secret:     ${creds.secret}`);
    log.info(`Passphrase: ${creds.passphrase}`);
    log.info(`Stored at:  ${updatedAt}`);
    log.info("================================================");
  } catch (err) {
    log.error(err, "Failed to derive credentials");
    process.exit(1);
  }
}

main();
