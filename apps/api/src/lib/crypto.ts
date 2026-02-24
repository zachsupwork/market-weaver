import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";

function deriveKey(masterKey: string): Buffer {
  return crypto.createHash("sha256").update(masterKey).digest();
}

export function encrypt(plaintext: string, masterKey: string): { encrypted: string; iv: string; authTag: string } {
  const key = deriveKey(masterKey);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(plaintext, "utf8", "base64");
  encrypted += cipher.final("base64");
  const authTag = cipher.getAuthTag().toString("base64");

  return { encrypted, iv: iv.toString("base64"), authTag };
}

export function decrypt(encrypted: string, iv: string, authTag: string, masterKey: string): string {
  const key = deriveKey(masterKey);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(authTag, "base64"));

  let decrypted = decipher.update(encrypted, "base64", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}
