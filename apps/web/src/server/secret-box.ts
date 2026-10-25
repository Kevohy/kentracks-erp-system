import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Encryption at rest for secrets the app must be able to use again (GPS platform logins), with AES-256-GCM.
 *
 *   GPS_CREDENTIALS_KEY   32 random bytes, base64 or hex. Generate one with:
 *                         node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 *
 * Stored format: v1:<iv>:<tag>:<ciphertext> (base64url). `context` (e.g. the company id) is authenticated with the
 * value, so a stored secret copied to another company's row cannot be decrypted there. The key never leaves the server.
 */

const PREFIX = "v1:";

function key(): Buffer | null {
  const raw = (process.env.GPS_CREDENTIALS_KEY ?? "").trim();
  if (!raw) return null;
  const k = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  return k.length === 32 ? k : null;
}

export const secretKeyConfigured = () => key() !== null;
export const isSealed = (stored: string) => stored.startsWith(PREFIX);

export class SecretKeyError extends Error {}

/** Encrypts `plain`. Throws SecretKeyError when GPS_CREDENTIALS_KEY is missing or not 32 bytes. */
export function seal(plain: string, context: string): string {
  const k = key();
  if (!k) throw new SecretKeyError("GPS_CREDENTIALS_KEY is not set (or is not 32 bytes).");
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", k, iv);
  c.setAAD(Buffer.from(context, "utf8"));
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return `${PREFIX}${iv.toString("base64url")}:${c.getAuthTag().toString("base64url")}:${ct.toString("base64url")}`;
}

/**
 * Decrypts a stored value. A value saved before encryption was added (not sealed) is returned as it is, so existing
 * accounts keep working; callers re-save it sealed. Throws SecretKeyError when the key is missing or wrong.
 */
export function open(stored: string, context: string): string {
  if (!isSealed(stored)) return stored;
  const k = key();
  if (!k) throw new SecretKeyError("GPS_CREDENTIALS_KEY is not set, so the saved login cannot be read.");
  const [iv, tag, ct] = stored.slice(PREFIX.length).split(":");
  try {
    const d = createDecipheriv("aes-256-gcm", k, Buffer.from(iv, "base64url"));
    d.setAAD(Buffer.from(context, "utf8"));
    d.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([d.update(Buffer.from(ct, "base64url")), d.final()]).toString("utf8");
  } catch {
    throw new SecretKeyError("The saved login cannot be read with the current GPS_CREDENTIALS_KEY.");
  }
}
