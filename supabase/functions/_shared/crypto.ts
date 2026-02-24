// AES-256-GCM encryption/decryption for secret storage

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function getKey(masterKey: string): Promise<CryptoKey> {
  // Use first 32 bytes of SHA-256 of master key as AES key
  const encoded = new TextEncoder().encode(masterKey);
  const hash = await crypto.subtle.digest("SHA-256", encoded);
  return crypto.subtle.importKey("raw", hash, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

export async function encrypt(
  plaintext: string,
  masterKey: string
): Promise<{ encrypted: string; iv: string; authTag: string }> {
  const key = await getKey(masterKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, tagLength: 128 },
    key,
    encoded
  );

  const ciphertextBytes = new Uint8Array(ciphertext);
  // In WebCrypto, the auth tag is appended to the ciphertext
  const encryptedData = ciphertextBytes.slice(0, ciphertextBytes.length - 16);
  const authTag = ciphertextBytes.slice(ciphertextBytes.length - 16);

  return {
    encrypted: bytesToBase64(encryptedData),
    iv: bytesToBase64(iv),
    authTag: bytesToBase64(authTag),
  };
}

export async function decrypt(
  encrypted: string,
  iv: string,
  authTag: string,
  masterKey: string
): Promise<string> {
  const key = await getKey(masterKey);
  const ivBytes = base64ToBytes(iv);
  const encryptedBytes = base64ToBytes(encrypted);
  const authTagBytes = base64ToBytes(authTag);

  // Combine encrypted data and auth tag for WebCrypto
  const combined = new Uint8Array(encryptedBytes.length + authTagBytes.length);
  combined.set(encryptedBytes);
  combined.set(authTagBytes, encryptedBytes.length);

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: ivBytes, tagLength: 128 },
    key,
    combined
  );

  return new TextDecoder().decode(decrypted);
}
