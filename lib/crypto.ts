import type { AppData, EncryptedEnvelope } from "./types";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const DEFAULT_ITERATIONS = 250_000;

const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
};

const base64ToBytes = (value: string) => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

const webCryptoAvailable = () => Boolean(globalThis.crypto?.subtle);

const deriveWebKey = async (passphrase: string, salt: Uint8Array, iterations: number) => {
  const material = await globalThis.crypto.subtle.importKey(
    "raw",
    encoder.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return globalThis.crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
};

const deriveRawKey = async (passphrase: string, salt: Uint8Array, iterations: number) => {
  const [{ pbkdf2Async }, { sha256 }] = await Promise.all([
    import("@noble/hashes/pbkdf2.js"),
    import("@noble/hashes/sha2.js"),
  ]);
  return pbkdf2Async(sha256, encoder.encode(passphrase), salt, {
    c: iterations,
    dkLen: 32,
  });
};

export const encryptData = async (
  data: AppData,
  passphrase: string,
): Promise<EncryptedEnvelope> => {
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const iterations = DEFAULT_ITERATIONS;
  const plaintext = encoder.encode(JSON.stringify(data));
  let encrypted: Uint8Array;
  if (webCryptoAvailable()) {
    const key = await deriveWebKey(passphrase, salt, iterations);
    const result = await globalThis.crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
    encrypted = new Uint8Array(result);
  } else {
    const [{ gcm }, key] = await Promise.all([
      import("@noble/ciphers/aes.js"),
      deriveRawKey(passphrase, salt, iterations),
    ]);
    encrypted = gcm(key, iv).encrypt(plaintext);
  }
  return {
    version: 1,
    algorithm: "AES-GCM",
    kdf: "PBKDF2-SHA256",
    iterations,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    data: bytesToBase64(encrypted),
    recordCount: data.records.length,
    generatedAt: new Date().toISOString(),
  };
};

export const decryptData = async (
  envelope: EncryptedEnvelope,
  passphrase: string,
): Promise<AppData> => {
  if (envelope?.algorithm !== "AES-GCM" || !envelope.data) {
    throw new Error("El archivo cifrado no es compatible.");
  }
  const salt = base64ToBytes(envelope.salt);
  const iv = base64ToBytes(envelope.iv);
  const ciphertext = base64ToBytes(envelope.data);
  let decrypted: Uint8Array;
  if (webCryptoAvailable()) {
    const key = await deriveWebKey(passphrase, salt, envelope.iterations || DEFAULT_ITERATIONS);
    const result = await globalThis.crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
    decrypted = new Uint8Array(result);
  } else {
    const [{ gcm }, key] = await Promise.all([
      import("@noble/ciphers/aes.js"),
      deriveRawKey(passphrase, salt, envelope.iterations || DEFAULT_ITERATIONS),
    ]);
    decrypted = gcm(key, iv).decrypt(ciphertext);
  }
  const parsed = JSON.parse(decoder.decode(decrypted)) as AppData;
  if (!Array.isArray(parsed.records)) throw new Error("La base no contiene registros válidos.");
  return parsed;
};

export const downloadJson = (value: unknown, filename: string) => {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};
