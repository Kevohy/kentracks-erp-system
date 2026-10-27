import "server-only";
import {
  GpsPlatformError,
  kentracksToRaw,
  normalizeGpsDevice,
  validateImei,
  type GpsPlatformClient,
  type KentracksDeviceRecord,
  type KentracksTrackRecord,
  type KentracksUserInfo,
  type VerifyOutcome,
} from "@/lib/gps-platform";
import { GPS_PLATFORMS } from "@/lib/gps-platforms";
import { GpsAuthError, gpsFetch, invalidateAccessToken, platformAccounts, platformName, tokenFor, type GpsCredentials } from "./gps-auth";

/**
 * Device lookup on the GPS platforms. Kentracks (API section 2) and iTrack (API section 2.12) have the same
 * "Get device basic information by IMEIs":
 *
 *   GET {platform}/api/device/detail?access_token={token}&imeis={imei,imei,…}   (at most 100 IMEIs per request)
 *   → { "code": 0, "record": [ { imei, devicename, devicetype, platenumber, simcard, iccid, activatedtime,
 *                                platformduetime, userduetime, onlinetime, customeraccount }, … ] }
 *
 * A company can have several API accounts per platform (Communication → GPS Platform), each seeing its own devices, so the
 * accounts are asked in turn (Kentracks accounts first, then iTrack, oldest first) for the IMEIs not found yet. An IMEI no account knows is "not found".
 * The token goes only in the request to the platform; it is never logged or sent to the browser.
 *
 * "Get account information" (Kentracks section 1, iTrack section 2.11) — the device's owner (its customeraccount):
 *
 *   GET {platform}/api/user/info?access_token={token}&account={customeraccount}
 *   → { "code": 0, "record": { account, username, email, mobile, telephone, contact, roletype, blockstatus, … } }
 *
 * Its contact details are matched against the CRM (or offered as a new customer). It is asked with the API account
 * that found the device, at most once per owner per verification, and remembered for a few minutes. If it fails the
 * IMEI is still verified, just without contact details.
 *
 * "Track" (Kentracks and iTrack section 2.2) — the device's live status and when it last sent data:
 *
 *   GET {platform}/api/track?access_token={token}&imeis={imei,imei,…}   (at most 100 IMEIs per request)
 *   → { "code": 0, "record": [ { imei, datastatus, hearttime, gpstime, … }, … ] }
 *
 * datastatus 2 is Online, 3 Expired, 1 (never online), 4 (offline) and 5 (blocked) Offline. It is asked with the account
 * that found each device. If it fails the devices are still verified, with their status unknown.
 */

export const KENTRACKS_BATCH = 100;
/** A batch of up to 100 IMEIs can take longer than a sign-in. */
const DEVICE_TIMEOUT_MS = 15_000;

type Found = Map<string, { rec: KentracksDeviceRecord; by: GpsCredentials }>;

type Answer = { code: number; message: string; record: unknown };

/** One GET to the account's platform. Throws GpsPlatformError when it cannot be reached or does not answer JSON. */
async function ask(c: GpsCredentials, path: string, params: Record<string, string>): Promise<Answer> {
  const name = platformName(c.platform);
  const url = new URL(`${c.baseUrl}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  let res: Response;
  try {
    res = await gpsFetch(url, DEVICE_TIMEOUT_MS);
  } catch (e) {
    const timeout = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    // The URL holds the token, so it is never part of the message.
    throw new GpsPlatformError("api-error", timeout ? `${name} did not answer in time. Try again.` : `Could not reach ${name}. Check the internet connection and try again.`);
  }
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new GpsPlatformError("api-error", `${name} answered with something that is not JSON (HTTP ${res.status}).`);
  }
  const b = (body ?? {}) as { code?: unknown; message?: unknown; msg?: unknown; record?: unknown };
  const code = typeof b.code === "number" ? b.code : Number(b.code);
  const message = typeof b.message === "string" ? b.message : typeof b.msg === "string" ? b.msg : "";
  return { code: Number.isFinite(code) ? code : -1, message: message.slice(0, 200), record: b.record };
}

async function token(c: GpsCredentials): Promise<string> {
  try {
    return await tokenFor(c);
  } catch (e) {
    throw new GpsPlatformError("api-error", e instanceof GpsAuthError ? e.message : `Could not sign in to ${platformName(c.platform)}.`);
  }
}

/** Asks with the account's token. A refused token is dropped and asked for again once (a newer one may have replaced it). */
async function askSigned(c: GpsCredentials, path: string, params: Record<string, string>): Promise<Answer> {
  let t = await token(c);
  let r = await ask(c, path, { access_token: t, ...params });
  if (r.code !== 0) {
    invalidateAccessToken(t);
    t = await token(c);
    r = await ask(c, path, { access_token: t, ...params });
  }
  return r;
}

/** One account, one batch of at most 100 IMEIs. */
async function detail(c: GpsCredentials, imeis: string[]): Promise<KentracksDeviceRecord[]> {
  const r = await askSigned(c, "/api/device/detail", { imeis: imeis.join(",") });
  if (r.code !== 0) throw new GpsPlatformError("api-error", `${platformName(c.platform)} refused the device request (code ${r.code})${r.message ? `: ${r.message}` : ""}.`);
  return Array.isArray(r.record) ? (r.record.filter((x) => x && typeof x === "object") as KentracksDeviceRecord[]) : [];
}

/** One account, one batch of at most 100 IMEIs: the live status records, by IMEI. */
async function track(c: GpsCredentials, imeis: string[]): Promise<Map<string, KentracksTrackRecord>> {
  // The device lookup just used this token, so one try: a refusal here should not replace the token others are using.
  const r = await ask(c, "/api/track", { access_token: await token(c), imeis: imeis.join(",") });
  if (r.code !== 0) throw new GpsPlatformError("api-error", `${platformName(c.platform)} refused the status request (code ${r.code}).`);
  const out = new Map<string, KentracksTrackRecord>();
  for (const x of Array.isArray(r.record) ? r.record : []) {
    if (!x || typeof x !== "object") continue;
    const rec = x as KentracksTrackRecord;
    const imei = typeof rec.imei === "string" ? rec.imei.trim() : String(rec.imei ?? "");
    if (imeis.includes(imei)) out.set(imei, rec);
  }
  return out;
}

/** The live status of the found devices, asked with the account that found each one. Failures leave them unknown. */
async function statuses(found: Found): Promise<Map<string, KentracksTrackRecord>> {
  const byAccount = new Map<GpsCredentials, string[]>();
  for (const [imei, { by }] of found) byAccount.set(by, [...(byAccount.get(by) ?? []), imei]);
  const out = new Map<string, KentracksTrackRecord>();
  await Promise.all([...byAccount].map(async ([c, imeis]) => {
    for (let i = 0; i < imeis.length; i += KENTRACKS_BATCH) {
      try {
        for (const [imei, rec] of await track(c, imeis.slice(i, i + KENTRACKS_BATCH))) out.set(imei, rec);
      } catch {
        // The status stays unknown for these devices; their details are still verified.
      }
    }
  }));
  return out;
}

// Owner details, remembered briefly per API account and owner so a verify followed by the sale's own check asks once.
const OWNER_TTL_MS = 5 * 60_000;
const g = globalThis as typeof globalThis & { __ktGpsOwners?: Map<string, { at: number; info: KentracksUserInfo | null }> };
const owners = (g.__ktGpsOwners ??= new Map());

/** The device owner's account information, or null when the platform does not give it (never throws). */
async function ownerInfo(c: GpsCredentials, account: string): Promise<KentracksUserInfo | null> {
  const key = `${c.platform}|${c.baseUrl}|${c.account.toLowerCase()}|${account.toLowerCase()}`;
  const hit = owners.get(key);
  if (hit && Date.now() - hit.at < OWNER_TTL_MS) return hit.info;
  let info: KentracksUserInfo | null = null;
  try {
    // One try with the current token: a refusal here usually means the owner is not visible to this API account, and
    // asking for a new token would cancel the one other requests are using.
    const r = await ask(c, "/api/user/info", { access_token: await token(c), account });
    const rec = r.record;
    if (r.code === 0 && rec && typeof rec === "object" && !Array.isArray(rec)) info = rec as KentracksUserInfo;
  } catch {
    info = null; // the IMEI is still verified, just without contact details
  }
  if (owners.size > 2000) owners.clear();
  owners.set(key, { at: Date.now(), info });
  return info;
}

/**
 * Looks the IMEIs up with the company's accounts on every platform. Returns what was found per IMEI, and the first error
 * if an account could not be asked (IMEIs not found and not asked because of that error are reported with it).
 */
async function lookUp(accounts: GpsCredentials[], imeis: string[]): Promise<{ found: Found; error: GpsPlatformError | null }> {
  const found: Found = new Map();
  let error: GpsPlatformError | null = null;
  for (const c of accounts) {
    const left = imeis.filter((i) => !found.has(i));
    if (left.length === 0) break;
    for (let i = 0; i < left.length; i += KENTRACKS_BATCH) {
      try {
        for (const rec of await detail(c, left.slice(i, i + KENTRACKS_BATCH))) {
          const imei = typeof rec.imei === "string" ? rec.imei.trim() : String(rec.imei ?? "");
          if (left.includes(imei) && !found.has(imei)) found.set(imei, { rec, by: c });
        }
      } catch (e) {
        error ??= e instanceof GpsPlatformError ? e : new GpsPlatformError("api-error", `Could not reach ${platformName(c.platform)}.`);
        break; // this account failed; try the next one
      }
    }
  }
  return { found, error };
}

const NAMES = GPS_PLATFORMS.map((p) => p.name).join(" or ");
const NO_ACCOUNT = `No GPS platform is connected: add your ${NAMES} API account in Communication → GPS Platform to verify IMEIs.`;

/** The company's accounts on every platform, in platform order (Kentracks first), oldest first within each. */
export async function allPlatformAccounts(tenantId: string): Promise<GpsCredentials[]> {
  const lists = await Promise.all(GPS_PLATFORMS.map((p) => platformAccounts(tenantId, p.id)));
  return lists.flat().map((a) => a.credentials);
}

/**
 * Verifies IMEIs for a company. With GPS platform accounts: the real Kentracks / iTrack APIs. Without any: the development mock
 * when `mock` is given (GPS_MOCK on a local database only), else a clear "not connected" failure, so nothing is
 * ever recorded against an unverified device.
 */
export async function verifyImeis(
  tenantId: string,
  rawImeis: string[],
  mock: GpsPlatformClient | null,
  /** Also look up each device owner's account information (the sale form); Billing refreshes leave it out. */
  withOwner = true,
): Promise<Map<string, VerifyOutcome>> {
  const out = new Map<string, VerifyOutcome>();
  const valid: string[] = [];
  for (const raw of rawImeis) {
    const v = validateImei(raw);
    if (v.error) out.set(raw, { ok: false, code: "invalid-imei", message: v.error });
    else if (!valid.includes(v.value)) valid.push(v.value);
  }
  if (valid.length === 0) return out;

  const accounts = await allPlatformAccounts(tenantId);
  if (accounts.length === 0) {
    for (const imei of valid) {
      if (!mock) {
        out.set(imei, { ok: false, code: "api-error", message: NO_ACCOUNT });
        continue;
      }
      try {
        const parsed = normalizeGpsDevice(await mock.verifyImei(imei));
        out.set(imei, parsed && parsed.device.imei === imei
          ? { ok: true, device: parsed.device, missing: parsed.missing, source: "mock" }
          : { ok: false, code: "incomplete-response", message: "The GPS platform returned an incomplete or mismatched response for this IMEI, so it could not be verified." });
      } catch (e) {
        out.set(imei, { ok: false, code: e instanceof GpsPlatformError ? e.code : "api-error", message: e instanceof Error ? e.message : "Could not verify the IMEI." });
      }
    }
    return out;
  }

  const { found, error } = await lookUp(accounts, valid);
  const live = found.size ? await statuses(found) : new Map<string, KentracksTrackRecord>();
  const ownerOf = new Map<string, KentracksUserInfo | null>();
  if (withOwner) {
    const pairs = new Map<string, { by: GpsCredentials; account: string }>();
    for (const { rec, by } of found.values()) {
      const account = typeof rec.customeraccount === "string" ? rec.customeraccount.trim() : "";
      if (account) pairs.set(`${by.platform}|${by.account}|${account.toLowerCase()}`, { by, account });
    }
    await Promise.all([...pairs].map(async ([k, p]) => ownerOf.set(k, await ownerInfo(p.by, p.account))));
  }
  for (const imei of valid) {
    const hit = found.get(imei);
    const rec = hit?.rec;
    if (!hit || !rec) {
      out.set(imei, error
        ? { ok: false, code: error.code, message: error.message }
        : { ok: false, code: "not-found", message: `This IMEI was not found on ${[...new Set(accounts.map((c) => platformName(c.platform)))].join(" or ")} under your API accounts. Check the number, or add the account that owns the device in Communication → GPS Platform.` });
      continue;
    }
    const owner = typeof rec.customeraccount === "string" && rec.customeraccount.trim() ? ownerOf.get(`${hit.by.platform}|${hit.by.account}|${rec.customeraccount.trim().toLowerCase()}`) : null;
    const parsed = normalizeGpsDevice({ ...kentracksToRaw(rec, owner, live.get(imei)), platform: platformName(hit.by.platform) });
    out.set(imei, parsed && parsed.device.imei === imei
      // "Last update" comes from the track API and a device that never went online has none: not reported as missing.
      ? { ok: true, device: parsed.device, missing: parsed.missing.filter((m) => m !== "Last Update"), source: "gpsplatform" }
      : { ok: false, code: "incomplete-response", message: `${platformName(hit.by.platform)} returned an incomplete record for this IMEI, so it could not be verified.` });
  }
  return out;
}
