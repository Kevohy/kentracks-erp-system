import "server-only";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { sql } from "drizzle-orm";
import { getDb } from "../crm/db";
import { users } from "./schema";

/**
 * Trusted browsers ("device cookies", the OWASP defence against lock-out abuse).
 *
 * After a successful sign-in the browser gets kt_device, a token that names the account and a random device id and is
 * signed with a key derived from that user's stored password hash. Sign-in attempts that carry a valid token are
 * limited per device (see rate-limit.ts) and are NOT held back by the account-wide or per-address limits, so someone
 * guessing passwords from many addresses cannot lock the real user out of a browser they have used before.
 *
 * - It cannot be forged without the password hash, which never leaves the server.
 * - Changing the password changes the hash, so every token issued before stops working.
 * - It is only sent to the sign-in endpoint (Path), is HttpOnly, SameSite=Lax, and Secure like the session cookie.
 * - It is not a session and grants nothing on its own: the password is still checked on every sign-in.
 */
export const DEVICE_COOKIE = "kt_device";
const DEVICE_PATH = "/api/auth/login";
const DEVICE_MAX_AGE_SECONDS = 90 * 24 * 3600;

const b64url = (b: Buffer) => b.toString("base64url");
const keyOf = (passwordHash: string) => createHash("sha256").update(`kt-device-v1|${passwordHash}`).digest();
const macOf = (passwordHash: string, payload: string) => createHmac("sha256", keyOf(passwordHash)).update(payload).digest();

function readCookie(req: Request, name: string): string | null {
  for (const part of (req.headers.get("cookie") ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim() || null;
  }
  return null;
}

/**
 * The device id when the request carries a valid, unexpired token for this email's account; otherwise null (the
 * attempt is then treated as coming from an unknown browser). Never throws.
 */
export async function trustedDevice(req: Request, email: string): Promise<string | null> {
  const raw = readCookie(req, DEVICE_COOKIE);
  if (!raw || raw.length > 300) return null;
  const parts = raw.split(".");
  if (parts.length !== 4) return null;
  const [userId, expRaw, deviceId, mac] = parts;
  const exp = Number(expRaw);
  if (!/^[0-9a-f-]{36}$/i.test(userId) || !Number.isSafeInteger(exp) || exp * 1000 < Date.now() || !/^[A-Za-z0-9_-]{16,64}$/.test(deviceId)) return null;
  try {
    const [u] = await getDb().select({ id: users.id, hash: users.passwordHash, active: users.isActive }).from(users)
      .where(sql`lower(${users.email}) = ${email}`).limit(1);
    if (!u || !u.active || u.id !== userId) return null;
    const want = macOf(u.hash, `${userId}.${exp}.${deviceId}`);
    const got = Buffer.from(mac, "base64url");
    return got.length === want.length && timingSafeEqual(got, want) ? deviceId : null;
  } catch {
    return null;
  }
}

/** Set-Cookie value for a newly signed-in browser. Keeps the device id it already had, so its own limit carries on. */
export function deviceCookie(userId: string, passwordHash: string, deviceId: string | null, secure: boolean): string {
  const id = deviceId ?? b64url(randomBytes(18));
  const exp = Math.floor(Date.now() / 1000) + DEVICE_MAX_AGE_SECONDS;
  const payload = `${userId}.${exp}.${id}`;
  const parts = [`${DEVICE_COOKIE}=${payload}.${b64url(macOf(passwordHash, payload))}`, `Path=${DEVICE_PATH}`, "HttpOnly", "SameSite=Lax", `Max-Age=${DEVICE_MAX_AGE_SECONDS}`];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}
