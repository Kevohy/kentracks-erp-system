import "server-only";
import { createHash } from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import { GPS_PLATFORMS, isGpsPlatformId, type GpsAccountStatus, type GpsPlatformId, type GpsPlatformInfo } from "@/lib/gps-platforms";
import { requireAdmin, type AuthContext } from "../crm/auth";
import { getDb } from "../crm/db";
import { isUuid, uniqueViolation } from "../crm/http";
import { throwValidation, type Body, Reader } from "./body";
import { gpsPlatformAccounts } from "./schema";
import { isSealed, open, seal, SecretKeyError, secretKeyConfigured } from "../secret-box";

/**
 * GPS platforms → access token (API doc 2.1 "Get access token"). Kentracks (api.kentracksgps.com) and iTrack
 * (api.itrack.top) use the same request:
 *
 *   GET {platform url}/api/authorization?time={unix seconds}&account={account}&signature={md5(md5(password) + time)}
 *   → { "code": 0, "record": { "access_token": "…", "expires_in": 7200 } }
 *
 * A company adds one or more API accounts per platform (account and password only) in Communication → GPS Platform. Only
 * md5(password) is kept, which is all the signature needs; the password as typed is never stored. Every other API
 * request needs a token. A token lives 2 hours and asking for a new one cancels the old one immediately, so the server
 * keeps ONE token per account, shares it between requests, and asks again only every 90 minutes (or sooner if it is
 * about to expire or the API rejects it). Only one token request per account runs at a time. The password hash, the
 * signature and the token are never sent to the browser or written to logs.
 */

/** Each platform's API address comes from GPS_PLATFORMS. GPS_API_URL may override them all (tests use a fake API). */
export type GpsCredentials = { platform: GpsPlatformId; baseUrl: string; account: string; passwordMd5: string; keyProblem?: string };

export const platformName = (id: GpsPlatformId) => GPS_PLATFORMS.find((p) => p.id === id)?.name ?? "The GPS platform";

export type GpsAuthErrorCode = "not-configured" | "network" | "timeout" | "rejected" | "bad-response";

export class GpsAuthError extends Error {
  constructor(
    readonly code: GpsAuthErrorCode,
    message: string,
    readonly apiCode?: number,
  ) {
    super(message);
  }
}

/** Ask for a new token every 90 minutes (the API doc's advice), or after 3/4 of a shorter lifetime. */
const REFRESH_AFTER_MS = 90 * 60_000;
const REQUEST_TIMEOUT_MS = 10_000;
const DEFAULT_LIFETIME_S = 7200;
const MAX_ACCOUNT = 64;
const MAX_PASSWORD = 128;

/** Hosts whose https could not be reached, with when to try https again (only used with GPS_ALLOW_HTTP=1). */
const httpOnlyUntil = new Map<string, number>();

/**
 * GET a GPS platform URL. Always https; plain http is used only when the server sets GPS_ALLOW_HTTP=1 and the https
 * request could not connect (a provider without https). That choice is remembered for an hour per host.
 */
export async function gpsFetch(url: URL, timeoutMs = REQUEST_TIMEOUT_MS): Promise<Response> {
  const init = () => ({ method: "GET", cache: "no-store" as const, headers: { Accept: "application/json" }, signal: AbortSignal.timeout(timeoutMs) });
  const allowHttp = process.env.GPS_ALLOW_HTTP === "1" && url.protocol === "https:";
  const plain = () => { const u = new URL(url); u.protocol = "http:"; return u; };
  if (allowHttp && (httpOnlyUntil.get(url.host) ?? 0) > Date.now()) return fetch(plain(), init());
  try {
    return await fetch(url, init());
  } catch (e) {
    if (!allowHttp) throw e;
    httpOnlyUntil.set(url.host, Date.now() + 60 * 60_000);
    return fetch(plain(), init());
  }
}

export const md5 = (s: string) => createHash("md5").update(s, "utf8").digest("hex");
/** md5(md5(password) + time), 32 lower-case hex characters. Takes md5(password), which is what is stored. */
export const gpsSignature = (passwordMd5: string, time: number) => md5(passwordMd5 + String(time));

function baseUrl(platform: GpsPlatformId): string {
  const fallback: string = GPS_PLATFORMS.find((p) => p.id === platform)?.url ?? GPS_PLATFORMS[0].url;
  const raw = (process.env.GPS_API_URL ?? "").trim().replace(/\/+$/, "");
  if (!raw) return fallback;
  try {
    const u = new URL(raw);
    return u.protocol === "http:" || u.protocol === "https:" ? raw : fallback;
  } catch {
    return fallback;
  }
}

type TokenState = {
  token: string | null;
  obtainedAt: number;
  refreshAt: number;
  expiresAt: number;
  pending: Promise<string> | null;
  lastError: { code: GpsAuthErrorCode; message: string; at: number } | null;
  requests: number;
};

// One token per GPSPlatform account, kept on globalThis so a development reload does not throw it away
// (asking again would cancel it).
const g = globalThis as typeof globalThis & { __ktGpsTokens?: Map<string, TokenState> };
const tokens = (g.__ktGpsTokens ??= new Map());
const keyOf = (c: GpsCredentials) => `${c.platform}|${c.baseUrl}|${c.account.toLowerCase()}|${c.passwordMd5}`;
function state(c: GpsCredentials): TokenState {
  const k = keyOf(c);
  let s = tokens.get(k);
  if (!s) {
    s = { token: null, obtainedAt: 0, refreshAt: 0, expiresAt: 0, pending: null, lastError: null, requests: 0 };
    tokens.set(k, s);
  }
  return s;
}

async function requestToken(c: GpsCredentials): Promise<{ token: string; lifetimeS: number }> {
  const name = platformName(c.platform);
  const time = Math.floor(Date.now() / 1000);
  const url = new URL(`${c.baseUrl}/api/authorization`);
  url.searchParams.set("time", String(time));
  url.searchParams.set("account", c.account);
  url.searchParams.set("signature", gpsSignature(c.passwordMd5, time));

  let res: Response;
  try {
    if (!c.passwordMd5) throw new GpsAuthError("not-configured", c.keyProblem ?? "The saved login cannot be read. Ask the system administrator to check GPS_CREDENTIALS_KEY.");
    res = await gpsFetch(url);
  } catch (e) {
    if (e instanceof GpsAuthError) throw e;
    const timeout = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    // The URL holds the account and signature, so it is never part of the message.
    throw timeout
      ? new GpsAuthError("timeout", `${name} did not answer within ${REQUEST_TIMEOUT_MS / 1000} seconds. Try again.`)
      : new GpsAuthError("network", url.protocol === "https:" && process.env.GPS_ALLOW_HTTP !== "1"
        ? `Could not reach ${name} over a secure (https) connection. Check the internet connection and try again. If ${name} has no https, the system administrator can allow plain http (GPS_ALLOW_HTTP=1).`
        : `Could not reach ${name}. Check the internet connection and try again.`);
  }
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new GpsAuthError("bad-response", `${name} answered with something that is not JSON (HTTP ${res.status}).`);
  }
  const b = (body ?? {}) as { code?: unknown; message?: unknown; msg?: unknown; record?: { access_token?: unknown; expires_in?: unknown } };
  const code = typeof b.code === "number" ? b.code : Number(b.code);
  if (!res.ok || code !== 0) {
    const said = typeof b.message === "string" ? b.message : typeof b.msg === "string" ? b.msg : "";
    throw new GpsAuthError(
      "rejected",
      `${name} refused the sign-in${Number.isFinite(code) ? ` (code ${code})` : ` (HTTP ${res.status})`}${said ? `: ${said.slice(0, 200)}` : ""}. Check the account and password.`,
      Number.isFinite(code) ? code : undefined,
    );
  }
  const token = b.record?.access_token;
  if (typeof token !== "string" || !token.trim()) throw new GpsAuthError("bad-response", `${name} did not return an access token.`);
  const lifetime = Number(b.record?.expires_in);
  return { token, lifetimeS: Number.isFinite(lifetime) && lifetime > 0 ? lifetime : DEFAULT_LIFETIME_S };
}

/**
 * The access token for these credentials, asking GPSPlatform for a new one only when there is none, it is 90 minutes
 * old, or it is about to expire. Callers at the same moment share one request.
 */
export async function tokenFor(c: GpsCredentials): Promise<string> {
  const s = state(c);
  const now = Date.now();
  if (s.token && now < s.refreshAt && now < s.expiresAt) return s.token;
  if (s.pending) return s.pending;
  s.requests++;
  s.pending = requestToken(c)
    .then(({ token, lifetimeS }) => {
      const at = Date.now();
      s.token = token;
      s.obtainedAt = at;
      s.expiresAt = at + lifetimeS * 1000;
      s.refreshAt = at + Math.min(REFRESH_AFTER_MS, lifetimeS * 750);
      s.lastError = null;
      return token;
    })
    .catch((e: unknown) => {
      const err = e instanceof GpsAuthError ? e : new GpsAuthError("network", `Could not reach ${platformName(c.platform)}.`);
      s.lastError = { code: err.code, message: err.message, at: Date.now() };
      throw err;
    })
    .finally(() => {
      s.pending = null;
    });
  return s.pending;
}

/** For the other GPSPlatform requests: forget a token GPSPlatform said is invalid, so the next call gets a new one. */
export function invalidateAccessToken(token: string) {
  for (const s of tokens.values()) {
    if (s.token === token) {
      s.token = null;
      s.refreshAt = 0;
      s.expiresAt = 0;
    }
  }
}

type AccountRow = typeof gpsPlatformAccounts.$inferSelect;
/** The stored login is encrypted (secret-box) and bound to its company. */
const secretContext = (tenantId: string) => `gps-account:${tenantId}`;
function credsOf(r: AccountRow): GpsCredentials {
  const base = { platform: r.platform as GpsPlatformId, baseUrl: baseUrl(r.platform as GpsPlatformId), account: r.account };
  try {
    return { ...base, passwordMd5: open(r.passwordMd5, secretContext(r.tenantId)) };
  } catch (e) {
    return { ...base, passwordMd5: "", keyProblem: e instanceof SecretKeyError ? `${e.message} Ask the system administrator.` : "The saved login cannot be read." };
  }
}

/** Encrypts the login for storage. Refuses (422) when the server has no GPS_CREDENTIALS_KEY: never stored in the clear. */
function sealed(tenantId: string, passwordMd5: string): string {
  try {
    return seal(passwordMd5, secretContext(tenantId));
  } catch {
    return throwValidation({ form: "GPS platform logins cannot be saved securely yet: the server has no GPS_CREDENTIALS_KEY. Ask the system administrator to set it." });
  }
}

/** Logins saved before encryption was added are encrypted the next time they are read (when the key is set). */
async function upgradeLegacy(rows: AccountRow[]): Promise<void> {
  if (!secretKeyConfigured()) return;
  for (const r of rows) {
    if (isSealed(r.passwordMd5) || !/^[0-9a-f]{32}$/.test(r.passwordMd5)) continue;
    const enc = seal(r.passwordMd5, secretContext(r.tenantId));
    await getDb().update(gpsPlatformAccounts).set({ passwordMd5: enc }).where(and(eq(gpsPlatformAccounts.id, r.id), eq(gpsPlatformAccounts.passwordMd5, r.passwordMd5)));
    r.passwordMd5 = enc;
  }
}

function statusOf(r: AccountRow): GpsAccountStatus {
  const s = state(credsOf(r));
  const iso = (t: number) => (t ? new Date(t).toISOString() : null);
  const live = !!s.token && Date.now() < s.expiresAt;
  return {
    id: r.id,
    platform: r.platform as GpsPlatformId,
    account: r.account,
    connected: live,
    obtainedAt: live ? iso(s.obtainedAt) : null,
    refreshAt: live ? iso(s.refreshAt) : null,
    expiresAt: live ? iso(s.expiresAt) : null,
    lastError: s.lastError ? { ...s.lastError, at: new Date(s.lastError.at).toISOString() } : null,
    updatedAt: r.updatedAt.toISOString(),
  };
}

const serverOf = (platform: GpsPlatformId) => {
  const u = new URL(baseUrl(platform));
  return `${u.protocol}//${u.host}`;
};

async function accountRow(ctx: AuthContext, id: string): Promise<AccountRow | null> {
  if (!isUuid(id)) return null;
  const [r] = await getDb().select().from(gpsPlatformAccounts).where(and(eq(gpsPlatformAccounts.id, id), eq(gpsPlatformAccounts.tenantId, ctx.tenantId)));
  if (r) await upgradeLegacy([r]);
  return r ?? null;
}

/** The company's saved accounts on a platform, oldest first (for the requests that come next, e.g. IMEI lookups). */
export async function platformAccounts(tenantId: string, platform: GpsPlatformId = "kentracks"): Promise<{ id: string; account: string; credentials: GpsCredentials }[]> {
  const rows = await getDb().select().from(gpsPlatformAccounts)
    .where(and(eq(gpsPlatformAccounts.tenantId, tenantId), eq(gpsPlatformAccounts.platform, platform)))
    .orderBy(asc(gpsPlatformAccounts.createdAt), asc(gpsPlatformAccounts.id));
  await upgradeLegacy(rows);
  return rows.map((r) => ({ id: r.id, account: r.account, credentials: credsOf(r) }));
}

/** GET /api/settings/gps-platforms — every platform with the company's accounts on it. */
export async function listGpsPlatforms(ctx: AuthContext): Promise<GpsPlatformInfo[]> {
  const rows = await getDb().select().from(gpsPlatformAccounts).where(eq(gpsPlatformAccounts.tenantId, ctx.tenantId))
    .orderBy(asc(gpsPlatformAccounts.createdAt), asc(gpsPlatformAccounts.id));
  await upgradeLegacy(rows);
  return GPS_PLATFORMS.map((p) => ({ id: p.id, name: p.name, server: serverOf(p.id), accounts: rows.filter((r) => r.platform === p.id).map(statusOf) }));
}

/** POST …/accounts/{id}/test — make sure the account holds a valid token (asks the API only when needed). */
export async function testGpsAccount(ctx: AuthContext, id: string): Promise<{ ok: boolean; message?: string; account: GpsAccountStatus } | null> {
  requireAdmin(ctx, "manage GPS platform accounts");
  const r = await accountRow(ctx, id);
  if (!r) return null;
  try {
    await tokenFor(credsOf(r));
    return { ok: true, account: statusOf(r) };
  } catch (e) {
    return { ok: false, message: e instanceof GpsAuthError ? e.message : "Could not reach the GPS platform.", account: statusOf(r) };
  }
}

function readAccount(body: Body, passwordRequired: boolean) {
  const r = new Reader(body, ["account", "password"]);
  const account = r.text("account").trim();
  const password = r.text("password");
  r.done();
  const errors: Record<string, string> = {};
  if (!account) errors.account = "Enter the account";
  else if (account.length > MAX_ACCOUNT) errors.account = `Account must be ${MAX_ACCOUNT} characters or fewer`;
  else if (/[\u0000-\u001f\u007f]/.test(account)) errors.account = "Account contains characters that are not allowed";
  if (password.length > MAX_PASSWORD) errors.password = `Password must be ${MAX_PASSWORD} characters or fewer`;
  else if (passwordRequired && !password) errors.password = "Enter the password";
  if (Object.keys(errors).length) throwValidation(errors);
  return { account, password };
}

/** Signs in with the details; wrong details (or an unreachable platform) stop the save. */
async function mustSignIn(c: GpsCredentials) {
  try {
    await tokenFor(c);
  } catch (e) {
    const err = e instanceof GpsAuthError ? e : new GpsAuthError("network", "Could not reach the GPS platform.");
    throwValidation(err.code === "rejected" ? { password: err.message } : { form: `${err.message} The account was not saved.` });
  }
}

const duplicate = () => throwValidation({ account: "This account is already added" });

/** POST /api/settings/gps-platforms/{platform}/accounts { account, password } — add an account the platform accepts. */
export async function addGpsAccount(ctx: AuthContext, platform: string, body: Body): Promise<GpsAccountStatus | null> {
  requireAdmin(ctx, "manage GPS platform accounts");
  if (!isGpsPlatformId(platform)) return null;
  const { account, password } = readAccount(body, true);
  const db = getDb();
  const [dupe] = await db.select({ id: gpsPlatformAccounts.id }).from(gpsPlatformAccounts)
    .where(and(eq(gpsPlatformAccounts.tenantId, ctx.tenantId), eq(gpsPlatformAccounts.platform, platform), sql`lower(${gpsPlatformAccounts.account}) = lower(${account})`));
  if (dupe) duplicate();
  const c: GpsCredentials = { platform, baseUrl: baseUrl(platform), account, passwordMd5: md5(password) };
  const stored = sealed(ctx.tenantId, c.passwordMd5); // refuse before contacting the platform if it cannot be stored encrypted
  await mustSignIn(c);
  try {
    const [row] = await db.insert(gpsPlatformAccounts)
      .values({ tenantId: ctx.tenantId, platform, account, passwordMd5: stored, createdBy: ctx.userId })
      .returning();
    return statusOf(row);
  } catch (e) {
    if (uniqueViolation(e) === "gps_platform_accounts_uq") duplicate();
    throw e;
  }
}

/** PUT …/accounts/{id} { account, password } — change an account; an empty password keeps the saved one. */
export async function updateGpsAccount(ctx: AuthContext, id: string, body: Body): Promise<GpsAccountStatus | null> {
  requireAdmin(ctx, "manage GPS platform accounts");
  const existing = await accountRow(ctx, id);
  if (!existing) return null;
  const { account, password } = readAccount(body, false);
  const db = getDb();
  const [dupe] = await db.select({ id: gpsPlatformAccounts.id }).from(gpsPlatformAccounts)
    .where(and(eq(gpsPlatformAccounts.tenantId, ctx.tenantId), eq(gpsPlatformAccounts.platform, existing.platform), sql`lower(${gpsPlatformAccounts.account}) = lower(${account})`, sql`${gpsPlatformAccounts.id} <> ${id}::uuid`));
  if (dupe) duplicate();
  const c: GpsCredentials = { platform: existing.platform as GpsPlatformId, baseUrl: baseUrl(existing.platform as GpsPlatformId), account, passwordMd5: password ? md5(password) : credsOf(existing).passwordMd5 };
  const stored = sealed(ctx.tenantId, c.passwordMd5);
  await mustSignIn(c);
  try {
    const [row] = await db.update(gpsPlatformAccounts)
      .set({ account, passwordMd5: stored, updatedAt: new Date() })
      .where(and(eq(gpsPlatformAccounts.id, id), eq(gpsPlatformAccounts.tenantId, ctx.tenantId)))
      .returning();
    return row ? statusOf(row) : null;
  } catch (e) {
    if (uniqueViolation(e) === "gps_platform_accounts_uq") duplicate();
    throw e;
  }
}

/** DELETE …/accounts/{id} — remove an account from the ERP. */
export async function removeGpsAccount(ctx: AuthContext, id: string): Promise<{ id: string } | null> {
  requireAdmin(ctx, "manage GPS platform accounts");
  if (!isUuid(id)) return null;
  const rows = await getDb().delete(gpsPlatformAccounts)
    .where(and(eq(gpsPlatformAccounts.id, id), eq(gpsPlatformAccounts.tenantId, ctx.tenantId)))
    .returning({ id: gpsPlatformAccounts.id });
  return rows[0] ?? null;
}
