// Test stubs for encryption/decryption
// Run with: npx tsx --test src/__tests__/crypto.test.ts

import { encrypt, decrypt } from "../lib/crypto.js";
import assert from "node:assert";
import { describe, it } from "node:test";

describe("AES-256-GCM Encryption", () => {
  const masterKey = "test-master-key-that-is-long-enough-for-security";

  it("should encrypt and decrypt a string", () => {
    const plaintext = JSON.stringify({ apiKey: "test123", secret: "sec", passphrase: "pass" });
    const { encrypted, iv, authTag } = encrypt(plaintext, masterKey);

    assert.ok(encrypted.length > 0);
    assert.ok(iv.length > 0);
    assert.ok(authTag.length > 0);

    const decrypted = decrypt(encrypted, iv, authTag, masterKey);
    assert.strictEqual(decrypted, plaintext);
  });

  it("should fail with wrong master key", () => {
    const plaintext = "secret data";
    const { encrypted, iv, authTag } = encrypt(plaintext, masterKey);

    assert.throws(() => {
      decrypt(encrypted, iv, authTag, "wrong-key");
    });
  });

  it("should produce different ciphertexts for same input", () => {
    const plaintext = "same input";
    const result1 = encrypt(plaintext, masterKey);
    const result2 = encrypt(plaintext, masterKey);

    assert.notStrictEqual(result1.encrypted, result2.encrypted);
    assert.notStrictEqual(result1.iv, result2.iv);
  });
});
