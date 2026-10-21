import "server-only";
import { createHash } from "node:crypto";
import { and, eq, gt, lt, sql } from "drizzle-orm";
import { getDb } from "../crm/db";
import { loginAttempts } from "./schema";

/**
 * Sign-in throttling, kept in the database so it holds across restarts and several server instances.
 * Every attempt is recorded BEFORE the password is checked (so parallel guesses are counted) and its row
 * is removed again when the sign-in succeeds. Once an account or address has too many attempts in the
 * window, further attempts are refused without checking the password at all.
 *
 * Trade-off, accepted: someone who knows an email address can lock that account for the window.
 * The lock never reveals whether the account exists - unknown emails are throttled the same way.
 */
export const LIMITS = {
  windowSeconds: 15 * 60,
  perAccount: 8,
  perIp: 40,
} as const;

const hashKey = (v: string) => createHash("sha256").update(v).digest("hex");

/**
 * The client address, ONLY when the deployment says its reverse proxy sets it (AUTH_TRUST_PROXY=1, for example behind
 * Cloudflare/Traefik). Otherwise the headers can be forged, so no per-address limit is applied and only the per-account one is.
 */
export function clientIp(req: Request): string | null {
  if (process.env.AUTH_TRUST_PROXY !== "1") return null;
  const v = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0] ?? req.headers.get("x-real-ip");
  const ip = v?.trim();
  return ip && ip.length <= 64 ? ip : null;
}

export type Attempt = { allowed: true; ids: string[] } | { allowed: false; retryAfterSeconds: number };

async function take(scope: "account" | "ip", key: string, limit: number): Promise<{ id: string; over: boolean; retryAfterSeconds: number }> {
  const db = getDb();
  const keyHash = hashKey(key);
  const [mine] = await db.insert(loginAttempts).values({ scope, keyHash }).returning({ id: loginAttempts.id });
  const [agg] = await db
    .select({ n: sql<number>`count(*)::int`, oldest: sql<Date>`min(${loginAttempts.createdAt})` })
    .from(loginAttempts)
    .where(and(eq(loginAttempts.scope, scope), eq(loginAttempts.keyHash, keyHash), gt(loginAttempts.createdAt, sql`now() - make_interval(secs => ${LIMITS.windowSeconds})`)));
  const over = (agg?.n ?? 0) > limit;
  const oldestMs = agg?.oldest ? new Date(agg.oldest).getTime() : Date.now();
  const retryAfterSeconds = Math.max(1, Math.ceil((oldestMs + LIMITS.windowSeconds * 1000 - Date.now()) / 1000));
  if (over) await db.delete(loginAttempts).where(eq(loginAttempts.id, mine.id));
  return { id: mine.id, over, retryAfterSeconds };
}

export async function beginAttempt(email: string, ip: string | null): Promise<Attempt> {
  const account = await take("account", email, LIMITS.perAccount);
  if (account.over) return { allowed: false, retryAfterSeconds: account.retryAfterSeconds };
  const ids = [account.id];
  if (ip) {
    const byIp = await take("ip", ip, LIMITS.perIp);
    if (byIp.over) {
      await getDb().delete(loginAttempts).where(eq(loginAttempts.id, account.id));
      return { allowed: false, retryAfterSeconds: byIp.retryAfterSeconds };
    }
    ids.push(byIp.id);
  }
  return { allowed: true, ids };
}

/** A successful sign-in removes only the rows this request created, so it cannot be used to reset someone else's failure count. */
export async function clearAttempts(ids: string[]): Promise<void> {
  const db = getDb();
  for (const id of ids) await db.delete(loginAttempts).where(eq(loginAttempts.id, id));
}

/** Drops old rows; cheap, run occasionally. */
export async function purgeOldAttempts(): Promise<void> {
  await getDb().delete(loginAttempts).where(lt(loginAttempts.createdAt, sql`now() - interval '1 day'`));
}
