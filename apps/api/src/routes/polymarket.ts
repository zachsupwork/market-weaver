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

// POST /polymarket/derive-api-creds
router.post("/derive-api-creds", requireAdmin, async (_req, res) => {
  try {
    const creds = await deriveApiCredentials();
    const masterKey = getMasterKey();
    const updatedAt = storeCreds(CRED_NAME, JSON.stringify(creds), masterKey);

    // Log once for dev (never returned to client)
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

export { router as polymarketRouter };
