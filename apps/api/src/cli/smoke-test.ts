import "dotenv/config";
import pino from "pino";
import { ethers } from "ethers";
import { ClobClient } from "@polymarket/clob-client";

const log = pino({ transport: { target: "pino-pretty" } });

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const masterKey = process.env.MASTER_KEY;
  const privateKey = process.env.PM_PRIVATE_KEY;
  const chainId = parseInt(process.env.CHAIN_ID || "137");
  const clobHost = process.env.CLOB_HOST || "https://clob.polymarket.com";

  if (!supabaseUrl || !supabaseKey) { log.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required"); process.exit(1); }
  if (!masterKey) { log.error("MASTER_KEY required"); process.exit(1); }
  if (!privateKey) { log.error("PM_PRIVATE_KEY required"); process.exit(1); }

  const wallet = new ethers.Wallet(privateKey);
  const address = await wallet.getAddress();
  log.info(`Wallet: ${address}`);

  // 1. Check Supabase has stored creds
  log.info("Checking Supabase for stored creds...");
  const credsRes = await fetch(
    `${supabaseUrl}/rest/v1/polymarket_secrets?name=eq.polymarket_api_creds&select=name,updated_at`,
    { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } }
  );
  if (!credsRes.ok) {
    log.error(`Supabase check failed: ${credsRes.status}`);
    process.exit(1);
  }
  const rows = await credsRes.json();
  if (!rows.length) {
    log.error("No credentials found in Supabase. Run derive-to-cloud first.");
    process.exit(1);
  }
  log.info(`✅ Credentials found, updated: ${rows[0].updated_at}`);

  // 2. Fetch markets from CLOB
  log.info("Fetching markets from Polymarket...");
  const client = new ClobClient(clobHost, chainId, wallet);
  try {
    const marketsRes = await fetch(`https://gamma-api.polymarket.com/markets?limit=3&closed=false`);
    if (!marketsRes.ok) throw new Error(`Gamma API: ${marketsRes.status}`);
    const markets = await marketsRes.json();
    log.info(`✅ Fetched ${markets.length} markets`);
  } catch (err) {
    log.error(err, "Failed to fetch markets");
    process.exit(1);
  }

  // 3. Check CLOB reachability
  try {
    const timeRes = await fetch(`${clobHost}/time`);
    if (!timeRes.ok) throw new Error(`CLOB /time: ${timeRes.status}`);
    log.info("✅ CLOB API reachable");
  } catch (err) {
    log.error(err, "CLOB API unreachable");
    process.exit(1);
  }

  log.info("🎉 Smoke test passed!");
}

main();
