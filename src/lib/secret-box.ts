import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

/**
 * Authenticated encryption (AES-256-GCM) for secrets stored in Postgres —
 * here: each host's Google refresh token. The key is derived from APP_SECRET
 * with HKDF, so a database dump alone never yields usable Google tokens.
 *
 * Format: `v1.<iv>.<auth tag>.<ciphertext>` (base64url parts).
 */
const VERSION = "v1";

function deriveKey(appSecret: string, purpose: string): Buffer {
  return Buffer.from(hkdfSync("sha256", appSecret, "wedding-qr/secret-box", `${VERSION}:${purpose}`, 32));
}

export function sealSecret(plaintext: string, appSecret: string, purpose: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(appSecret, purpose), iv);
  cipher.setAAD(Buffer.from(purpose, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [VERSION, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
}

/** Returns the plaintext, or null if the value was tampered with or sealed with another key/purpose. */
export function openSecret(sealed: string, appSecret: string, purpose: string): string | null {
  const [version, iv, tag, data] = sealed.split(".");
  if (version !== VERSION || !iv || !tag || data === undefined) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", deriveKey(appSecret, purpose), Buffer.from(iv, "base64url"));
    decipher.setAAD(Buffer.from(purpose, "utf8"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
