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
 * When the client address is known (behind a trusted proxy, see clientIp), the tight limit is per account AND address:
 * someone guessing from elsewhere cannot lock the real user out, and a looser per-account limit still stops guessing
 * spread over many addresses. Without a trusted address only the per-account limit can apply.
 * Either way, a browser that signed in to the account before (device.ts) has its own limit and is not locked out by
 * guesses made elsewhere; only browsers the account has never used can be held back by someone else's guessing.
 * The lock never reveals whether the account exists - unknown emails are throttled the same way.
 */
export const LIMITS = {
  windowSeconds: 15 * 60,
  /** Per account (and, when the address is known, per account + address). */
  perAccount: 8,
  /** Per account across all addresses, used only when the address is known. */
  perAccountAllAddresses: 50,
  perIp: 40,
  /** Per trusted browser (one that signed in to this account before); the other limits do not apply to it. */
  perTrustedDevice: 8,
} as const;

const hashKey = (v: string) => createHash("sha256").update(v).digest("hex");

/**
 * The client address, ONLY when the deployment says a reverse proxy sets it. Otherwise the headers can be forged, so no
 * per-address limit is applied and only the per-account one is.
 *   AUTH_TRUST_PROXY=cloudflare   behind Cloudflare: cf-connecting-ip (Cloudflare overwrites what the client sends)
 *   AUTH_TRUST_PROXY=1            behind one other proxy (e.g. Traefik): the LAST x-forwarded-for entry, the one that
 *                                 proxy added. Earlier entries come from the client and can be forged.
 */
export function clientIp(req: Request): string | null {
  const mode = (process.env.AUTH_TRUST_PROXY ?? "").trim().toLowerCase();
  let v: string | null | undefined = null;
  if (mode === "cloudflare") v = req.headers.get("cf-connecting-ip");
  else if (mode === "1" || mode === "true" || mode === "proxy") {
    const chain = (req.headers.get("x-forwarded-for") ?? "").split(",").map((x) => x.trim()).filter(Boolean);
    v = chain.at(-1) ?? req.headers.get("x-real-ip");
  }
  const ip = v?.trim();
  return ip && ip.length <= 64 && /^[0-9a-fA-F:.]+$/.test(ip) ? ip : null;
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

/**
 * `deviceId` is set when the browser proved it signed in to this account before (device.ts). Such an attempt counts
 * only against that browser's own limit: guesses from other browsers or addresses cannot lock it out, and it cannot be
 * used to guess further, because a valid token exists only after a correct password and dies when the password changes.
 */
export async function beginAttempt(email: string, ip: string | null, deviceId: string | null = null): Promise<Attempt> {
  const ids: string[] = [];
  const refuse = async (retryAfterSeconds: number): Promise<Attempt> => {
    for (const id of ids) await getDb().delete(loginAttempts).where(eq(loginAttempts.id, id));
    return { allowed: false, retryAfterSeconds };
  };
  if (deviceId) {
    const device = await take("account", `${email}|device|${deviceId}`, LIMITS.perTrustedDevice);
    return device.over ? refuse(device.retryAfterSeconds) : { allowed: true, ids: [device.id] };
  }
  // Without a trusted address: one limit per account. With one: per account + address, and a looser per-account limit.
  const account = await take("account", ip ? `${email}|${ip}` : email, LIMITS.perAccount);
  if (account.over) return refuse(account.retryAfterSeconds);
  ids.push(account.id);
  if (ip) {
    const all = await take("account", `${email}|*`, LIMITS.perAccountAllAddresses);
    if (all.over) return refuse(all.retryAfterSeconds);
    ids.push(all.id);
    const byIp = await take("ip", ip, LIMITS.perIp);
    if (byIp.over) return refuse(byIp.retryAfterSeconds);
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
