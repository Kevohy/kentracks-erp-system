import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, lt, sql } from "drizzle-orm";
import { getDb } from "../crm/db";
import { tenants } from "../crm/schema";
import { sessions, users } from "./schema";

export const SESSION_COOKIE = "kt_session";

/**
 * Session lifetimes. "Absolute" is the hard limit from sign-in; "idle" is how long a session may sit unused.
 * Without "Remember me" the cookie also has no Max-Age, so the browser drops it when it closes.
 */
export const SESSION_POLICY = {
  normal: { absoluteSeconds: 12 * 3600, idleSeconds: 4 * 3600 },
  remember: { absoluteSeconds: 30 * 86400, idleSeconds: 14 * 86400 },
} as const;
/** last_seen_at is refreshed at most this often, so reads do not turn into writes. */
const TOUCH_EVERY_SECONDS = 300;

export type UserRole = "admin" | "staff";
export type SessionUser = { userId: string; tenantId: string; tenantName: string; email: string; fullName: string; role: UserRole };

const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

export function readSessionToken(headers: Headers): string | null {
  const raw = headers.get("cookie");
  if (!raw) return null;
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === SESSION_COOKIE) {
      const v = part.slice(i + 1).trim();
      return TOKEN.test(v) ? v : null;
    }
  }
  return null;
}

/** Creates a session for the user and returns the cookie value. Only its hash is stored. */
export async function createSession(userId: string, remember: boolean, userAgent: string | null): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const policy = remember ? SESSION_POLICY.remember : SESSION_POLICY.normal;
  await getDb().insert(sessions).values({
    tokenHash: sha256(token),
    userId,
    remember,
    userAgent: userAgent ? userAgent.slice(0, 200) : null,
    expiresAt: new Date(Date.now() + policy.absoluteSeconds * 1000),
  });
  return token;
}

/** The signed-in user for a cookie value, or null if it is unknown, expired, idle for too long, or the user is disabled. */
export async function validateSession(token: string | null): Promise<SessionUser | null> {
  if (!token || !TOKEN.test(token)) return null;
  const db = getDb();
  const [row] = await db
    .select({
      hash: sessions.tokenHash,
      remember: sessions.remember,
      expiresAt: sessions.expiresAt,
      lastSeenAt: sessions.lastSeenAt,
      userId: users.id,
      tenantId: users.tenantId,
      tenantName: tenants.name,
      email: users.email,
      fullName: users.fullName,
      role: users.role,
      isActive: users.isActive,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .innerJoin(tenants, eq(tenants.id, users.tenantId))
    .where(eq(sessions.tokenHash, sha256(token)))
    .limit(1);
  if (!row || !row.isActive) return null;
  const now = Date.now();
  const idle = (row.remember ? SESSION_POLICY.remember : SESSION_POLICY.normal).idleSeconds * 1000;
  if (row.expiresAt.getTime() <= now || row.lastSeenAt.getTime() + idle <= now) {
    await db.delete(sessions).where(eq(sessions.tokenHash, row.hash));
    return null;
  }
  if (now - row.lastSeenAt.getTime() > TOUCH_EVERY_SECONDS * 1000) {
    await db.update(sessions).set({ lastSeenAt: new Date(now) }).where(eq(sessions.tokenHash, row.hash));
  }
  return { userId: row.userId, tenantId: row.tenantId, tenantName: row.tenantName, email: row.email, fullName: row.fullName, role: row.role === "admin" ? "admin" : "staff" };
}

export async function destroySession(token: string | null): Promise<void> {
  if (!token || !TOKEN.test(token)) return;
  await getDb().delete(sessions).where(eq(sessions.tokenHash, sha256(token)));
}

/** Removes sessions that have already expired. Called now and then from sign-in; never blocks it. */
export async function purgeExpiredSessions(): Promise<void> {
  await getDb().delete(sessions).where(and(lt(sessions.expiresAt, sql`now()`)));
}

const isLoopbackHost = (host: string) => /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(host);

/** Cookies are Secure everywhere except plain-http localhost. */
export function cookieIsSecure(req: Request): boolean {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";
  return !isLoopbackHost(host) || req.headers.get("x-forwarded-proto") === "https";
}

/** HttpOnly (JavaScript cannot read it), SameSite=Lax (not sent on cross-site requests), Secure everywhere except plain-http localhost. */
export function sessionCookie(req: Request, token: string, remember: boolean): string {
  const secure = cookieIsSecure(req);
  const parts = [`${SESSION_COOKIE}=${token}`, "Path=/", "HttpOnly", "SameSite=Lax"];
  if (secure) parts.push("Secure");
  if (remember) parts.push(`Max-Age=${SESSION_POLICY.remember.absoluteSeconds}`);
  return parts.join("; ");
}

export function clearedSessionCookie(req: Request): string {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";
  const secure = !isLoopbackHost(host) || req.headers.get("x-forwarded-proto") === "https";
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`;
}
