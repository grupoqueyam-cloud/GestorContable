import { decryptData, encryptData } from "./crypto";
import type { AppData, EncryptedEnvelope } from "./types";

export const VAULT_KEY = "sustainability-editorial-vault-v2";

export const hasVault = () =>
  typeof window !== "undefined" && Boolean(localStorage.getItem(VAULT_KEY));

export const saveVault = async (data: AppData, passphrase: string) => {
  const encrypted = await encryptData(data, passphrase);
  localStorage.setItem(VAULT_KEY, JSON.stringify(encrypted));
  localStorage.setItem(`${VAULT_KEY}:last-save`, new Date().toISOString());
  return encrypted;
};

export const unlockVault = async (passphrase: string) => {
  const raw = localStorage.getItem(VAULT_KEY);
  if (!raw) throw new Error("No existe una base local configurada.");
  return decryptData(JSON.parse(raw) as EncryptedEnvelope, passphrase);
};

export const clearVault = () => {
  localStorage.removeItem(VAULT_KEY);
  localStorage.removeItem(`${VAULT_KEY}:last-save`);
};

export const lastSavedAt = () => localStorage.getItem(`${VAULT_KEY}:last-save`) || "";
