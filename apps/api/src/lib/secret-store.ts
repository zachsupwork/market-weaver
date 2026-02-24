import fs from "node:fs";
import path from "node:path";
import { encrypt, decrypt } from "./crypto.js";

const SECRETS_DIR = path.resolve(process.cwd(), ".secrets");
const DEV_FILE = path.join(SECRETS_DIR, "dev-polymarket.json");

interface StoredSecret {
  name: string;
  value_encrypted: string;
  iv: string;
  auth_tag: string;
  updated_at: string;
}

function ensureDir() {
  if (!fs.existsSync(SECRETS_DIR)) {
    fs.mkdirSync(SECRETS_DIR, { recursive: true });
  }
}

function readStore(): StoredSecret[] {
  ensureDir();
  if (!fs.existsSync(DEV_FILE)) return [];
  return JSON.parse(fs.readFileSync(DEV_FILE, "utf8"));
}

function writeStore(secrets: StoredSecret[]) {
  ensureDir();
  fs.writeFileSync(DEV_FILE, JSON.stringify(secrets, null, 2));
}

export function storeCreds(name: string, value: string, masterKey: string): string {
  const { encrypted, iv, authTag } = encrypt(value, masterKey);
  const now = new Date().toISOString();
  const secrets = readStore().filter(s => s.name !== name);
  secrets.push({ name, value_encrypted: encrypted, iv, auth_tag: authTag, updated_at: now });
  writeStore(secrets);
  return now;
}

export function loadCreds(name: string, masterKey: string): { value: string; updatedAt: string } | null {
  const secrets = readStore();
  const entry = secrets.find(s => s.name === name);
  if (!entry) return null;
  const value = decrypt(entry.value_encrypted, entry.iv, entry.auth_tag, masterKey);
  return { value, updatedAt: entry.updated_at };
}

export function hasCreds(name: string): { hasCreds: boolean; updatedAt: string | null } {
  const secrets = readStore();
  const entry = secrets.find(s => s.name === name);
  return { hasCreds: !!entry, updatedAt: entry?.updated_at ?? null };
}
