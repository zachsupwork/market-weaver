import { Router } from "express";
import pino from "pino";
import { requireAdmin } from "../middleware/admin-auth.js";
import { storeCreds, loadCreds, hasCreds as hasCredsStore } from "../lib/secret-store.js";
import { deriveApiCredentials, testCredentials, type PolymarketCreds } from "../lib/polymarket.js";

const log = pino({ transport: { target: "pino-pretty" } });
const router = Router();
const CRED_NAME = "polymarket_api_creds";

function getMasterKey(): string {
  const key = process.env.MASTER_KEY;
  if (!key) throw new Error("MASTER_KEY not configured");
  return key;
}

// GET /polymarket/health
router.get("/health", async (_req, res) => {
  const checks: Record<string, boolean> = { api: true };

  // Check Supabase
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (supabaseUrl && supabaseKey) {
      const r = await fetch(`${supabaseUrl}/rest/v1/polymarket_secrets?select=name&limit=1`, {
        headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
      });
      checks.supabase = r.ok;
    } else {
      checks.supabase = false;
    }
  } catch {
    checks.supabase = false;
  }

  // Check Polymarket CLOB
  try {
    const clobHost = process.env.CLOB_HOST || "https://clob.polymarket.com";
    const r = await fetch(`${clobHost}/time`);
    checks.polymarket = r.ok;
  } catch {
    checks.polymarket = false;
  }

  res.json({ ok: Object.values(checks).every(Boolean), ...checks });
});

// POST /polymarket/derive-api-creds
router.post("/derive-api-creds", requireAdmin, async (_req, res) => {
  try {
    const creds = await deriveApiCredentials();
    const masterKey = getMasterKey();
    const updatedAt = storeCreds(CRED_NAME, JSON.stringify(creds), masterKey);

    if (process.env.NODE_ENV !== "production") {
      log.info({ apiKey: creds.apiKey, secret: "***", passphrase: "***" }, "Credentials derived (dev only)");
    }

    res.json({ ok: true, createdAt: updatedAt });
  } catch (err: any) {
    log.error(err, "Failed to derive credentials");
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /polymarket/rotate-api-creds
router.post("/rotate-api-creds", requireAdmin, async (_req, res) => {
  try {
    const creds = await deriveApiCredentials();
    const masterKey = getMasterKey();
    const updatedAt = storeCreds(CRED_NAME, JSON.stringify(creds), masterKey);
    log.warn("Credentials rotated — previous credentials are now invalid");
    res.json({ ok: true, rotated: true, createdAt: updatedAt });
  } catch (err: any) {
    log.error(err, "Failed to rotate credentials");
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /polymarket/has-creds
router.get("/has-creds", (_req, res) => {
  const status = hasCredsStore(CRED_NAME);
  res.json(status);
});

// POST /polymarket/test-auth
router.post("/test-auth", requireAdmin, async (_req, res) => {
  try {
    const masterKey = getMasterKey();
    const stored = loadCreds(CRED_NAME, masterKey);
    if (!stored) {
      return res.status(404).json({ ok: false, error: "No stored credentials found" });
    }
    const creds: PolymarketCreds = JSON.parse(stored.value);
    const isValid = await testCredentials(creds);
    res.json({ ok: isValid, ...(isValid ? {} : { error: "Authentication failed against CLOB API" }) });
  } catch (err: any) {
    log.error(err, "Test auth failed");
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /polymarket/positions
router.get("/positions", requireAdmin, async (_req, res) => {
  try {
    const masterKey = getMasterKey();
    const stored = loadCreds(CRED_NAME, masterKey);
    if (!stored) {
      return res.status(404).json({ ok: false, error: "No stored credentials found" });
    }
    const creds: PolymarketCreds = JSON.parse(stored.value);

    // Use CLOB client for positions
    const { ClobClient } = await import("@polymarket/clob-client");
    const { ethers } = await import("ethers");
    const wallet = new ethers.Wallet(process.env.PM_PRIVATE_KEY!);
    const chainId = parseInt(process.env.CHAIN_ID || "137");
    const clobHost = process.env.CLOB_HOST || "https://clob.polymarket.com";

    const client = new ClobClient(clobHost, chainId, wallet, creds);
    // Attempt to get open orders as a proxy for positions
    const orders = await client.getOpenOrders();
    res.json({ ok: true, positions: orders || [] });
  } catch (err: any) {
    log.error(err, "Failed to fetch positions");
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /polymarket/orders
router.post("/orders", requireAdmin, async (req, res) => {
  try {
    const { tokenId, side, price, size } = req.body;
    if (!tokenId || !side || !price || !size) {
      return res.status(400).json({ ok: false, error: "Missing: tokenId, side, price, size" });
    }

    const masterKey = getMasterKey();
    const stored = loadCreds(CRED_NAME, masterKey);
    if (!stored) {
      return res.status(404).json({ ok: false, error: "No stored credentials" });
    }
    const creds: PolymarketCreds = JSON.parse(stored.value);

    const { ClobClient } = await import("@polymarket/clob-client");
    const { ethers } = await import("ethers");
    const wallet = new ethers.Wallet(process.env.PM_PRIVATE_KEY!);
    const chainId = parseInt(process.env.CHAIN_ID || "137");
    const clobHost = process.env.CLOB_HOST || "https://clob.polymarket.com";

    const client = new ClobClient(clobHost, chainId, wallet, creds);

    const order = await client.createAndPostOrder({
      tokenID: tokenId,
      side: side.toUpperCase() === "BUY" ? 0 : 1,
      price: parseFloat(price),
      size: parseFloat(size),
    });

    res.json({ ok: true, order });
  } catch (err: any) {
    log.error(err, "Failed to place order");
    res.status(500).json({ ok: false, error: err.message });
  }
});

// DELETE /polymarket/orders/:id
router.delete("/orders/:id", requireAdmin, async (req, res) => {
  try {
    const masterKey = getMasterKey();
    const stored = loadCreds(CRED_NAME, masterKey);
    if (!stored) {
      return res.status(404).json({ ok: false, error: "No stored credentials" });
    }
    const creds: PolymarketCreds = JSON.parse(stored.value);

    const { ClobClient } = await import("@polymarket/clob-client");
    const { ethers } = await import("ethers");
    const wallet = new ethers.Wallet(process.env.PM_PRIVATE_KEY!);
    const chainId = parseInt(process.env.CHAIN_ID || "137");
    const clobHost = process.env.CLOB_HOST || "https://clob.polymarket.com";

    const client = new ClobClient(clobHost, chainId, wallet, creds);
    await client.cancelOrder(req.params.id);

    res.json({ ok: true });
  } catch (err: any) {
    log.error(err, "Failed to cancel order");
    res.status(500).json({ ok: false, error: err.message });
  }
});

export { router as polymarketRouter };
