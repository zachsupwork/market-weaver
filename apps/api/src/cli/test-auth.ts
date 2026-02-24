import "dotenv/config";
import pino from "pino";
import { loadCreds } from "../lib/secret-store.js";
import { testCredentials, type PolymarketCreds } from "../lib/polymarket.js";

const log = pino({ transport: { target: "pino-pretty" } });

async function main() {
  const masterKey = process.env.MASTER_KEY;
  if (!masterKey) {
    log.error("MASTER_KEY is required");
    process.exit(1);
  }

  const stored = loadCreds("polymarket_api_creds", masterKey);
  if (!stored) {
    log.error("No stored credentials found. Run `npm run polymarket:derive` first.");
    process.exit(1);
  }

  log.info("Testing Polymarket CLOB API authentication...");
  const creds: PolymarketCreds = JSON.parse(stored.value);
  const ok = await testCredentials(creds);

  if (ok) {
    log.info("✅ Authentication successful");
  } else {
    log.error("❌ Authentication failed — credentials may be invalid or expired");
    process.exit(1);
  }
}

main();
