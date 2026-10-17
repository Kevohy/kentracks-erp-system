import { cleanText, stripControlChars, type FieldResult } from "./validation";

/**
 * GPSPlatform integration boundary.
 *
 * The app talks to GPSPlatform only through `GpsPlatformClient`. No real client exists yet
 * because there is no backend: calling GPSPlatform from the browser would expose its
 * credentials. Until a server-side proxy is built, `gpsPlatformClient` is a MOCK that serves
 * a few sample devices, and every result carries `source: "mock"` so the UI never presents it
 * as a real verification. See the README ("GPSPlatform integration") for what the real one needs.
 */

/** What the app needs about a tracker. Everything except `imei` and `model` may be missing. */
export type GpsStatus = "Online" | "Offline" | "Expired";

export type GpsDevice = {
  imei: string;
  model: string;
  /** Platform status. Reported by the API, or Expired when the platform expiration date has passed. */
  status?: GpsStatus;
  /** Device name on GPSPlatform (often the number plate). */
  name?: string;
  simCard?: string;
  vehiclePlate?: string;
  /** Last update from the platform. */
  lastSeen?: string;
  /** Platform expiration date. */
  expirationDate?: string;
  activationDate?: string;
  account?: string;
  contact?: { name?: string; phone?: string; email?: string };
};

export type GpsSource = "mock" | "gpsplatform";

export type VerifyErrorCode = "invalid-imei" | "not-found" | "api-error" | "incomplete-response";

export type VerifyOutcome =
  | { ok: true; device: GpsDevice; /** Display names of details the API did not return. */ missing: string[]; source: GpsSource }
  | { ok: false; code: VerifyErrorCode; message: string };

export class GpsPlatformError extends Error {
  constructor(
    readonly code: Exclude<VerifyErrorCode, "invalid-imei" | "incomplete-response">,
    message: string,
  ) {
    super(message);
  }
}

export interface GpsPlatformClient {
  readonly source: GpsSource;
  /** Resolves with the raw response body for a known device. Throws GpsPlatformError otherwise. */
  verifyImei(imei: string): Promise<unknown>;
}

// ---------------------------------------------------------------- IMEI input

/** Typing / pasting: drop control characters, spaces and hyphens (common IMEI formatting). */
export const sanitizeImeiInput = (value: string): string => stripControlChars(value).replace(/[\s-]/g, "");

function luhnValid(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

export function validateImei(raw: string): FieldResult {
  const value = sanitizeImeiInput(raw);
  if (!value) return { value, error: "IMEI is required" };
  if (!/^\d+$/.test(value)) return { value, error: "IMEI can only contain digits" };
  if (value.length !== 15) return { value, error: "IMEI must be exactly 15 digits" };
  if (!luhnValid(value)) return { value, error: "This IMEI is not valid. Check the number and try again" };
  return { value };
}

// ---------------------------------------------------------- response handling

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Optional text from an API field: trimmed, control characters removed, length limited. Never HTML. */
function text(v: unknown, max = 120): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = cleanText(v);
  return s ? s.slice(0, max) : undefined;
}

const STATUS_BY_TEXT: Record<string, GpsStatus> = { online: "Online", offline: "Offline", expired: "Expired" };

/** Status from the API's `status` field; an unknown value is ignored. */
function statusFrom(v: unknown): GpsStatus | undefined {
  const t = typeof v === "string" ? v.trim().toLowerCase() : "";
  return STATUS_BY_TEXT[t];
}

/** True when a plain YYYY-MM-DD expiration date is before today (local date). */
function isPast(date: string | undefined): boolean {
  const m = date && /^(\d{4}-\d{2}-\d{2})/.exec(date);
  if (!m) return false;
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return m[1] < today;
}

/** "2026-10-16T14:32:00Z" -> "2026-10-16 14:32"; anything else is kept as plain text. */
function when(v: unknown): string | undefined {
  const s = text(v, 40);
  if (!s) return undefined;
  const m = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}))?/.exec(s);
  return m ? (m[2] ? `${m[1]} ${m[2]}` : m[1]) : s;
}

/** The details shown after verification (the GPSPlatform device page). Missing ones are reported. */
const OPTIONAL_LABELS: [keyof GpsDevice, string][] = [
  ["name", "Name"],
  ["vehiclePlate", "Vehicle Plate Number"],
  ["simCard", "SIM Card"],
  ["lastSeen", "Last Update"],
  ["activationDate", "Activated Date"],
  ["expirationDate", "Platform Expiration Date"],
];

/**
 * Turns a raw API body into a `GpsDevice`. This is the one place that knows the response field
 * names; map the real GPSPlatform schema here when it is known. A body without an IMEI and a
 * model is treated as an incomplete response.
 */
export function normalizeGpsDevice(raw: unknown): { device: GpsDevice; missing: string[] } | null {
  if (!isRecord(raw)) return null;
  const imei = text(raw.imei, 20);
  const model = text(raw.model);
  if (!imei || !model) return null;

  const c = isRecord(raw.contact) ? raw.contact : {};
  const contact = { name: text(c.name), phone: text(c.phone, 40), email: text(c.email, 254) };
  const device: GpsDevice = {
    imei,
    model,
    status: statusFrom(raw.status),
    name: text(raw.name),
    simCard: text(raw.sim_card, 40),
    vehiclePlate: text(raw.plate_number, 30),
    lastSeen: when(raw.last_seen),
    expirationDate: when(raw.expiry_date),
    activationDate: when(raw.activation_date),
    account: text(raw.account),
    contact: contact.name || contact.phone || contact.email ? contact : undefined,
  };
  // A past expiration date always means Expired, whatever else the API says.
  if (isPast(device.expirationDate)) device.status = "Expired";
  const missing = OPTIONAL_LABELS.filter(([k]) => device[k] === undefined).map(([, label]) => label);
  return { device, missing };
}

/** Validates the IMEI, asks the client, and turns every failure into a clear outcome. */
export async function verifyDevice(client: GpsPlatformClient, rawImei: string): Promise<VerifyOutcome> {
  const v = validateImei(rawImei);
  if (v.error) return { ok: false, code: "invalid-imei", message: v.error };

  let body: unknown;
  try {
    body = await client.verifyImei(v.value);
  } catch (e) {
    if (e instanceof GpsPlatformError) return { ok: false, code: e.code, message: e.message };
    return { ok: false, code: "api-error", message: "Could not reach GPSPlatform. Check the connection and try again." };
  }

  const parsed = normalizeGpsDevice(body);
  if (!parsed || parsed.device.imei !== v.value) {
    return {
      ok: false,
      code: "incomplete-response",
      message: "GPSPlatform returned an incomplete or mismatched response for this IMEI, so it could not be verified.",
    };
  }
  return { ok: true, device: parsed.device, missing: parsed.missing, source: client.source };
}

// ------------------------------------------------------------------- MOCK

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Sample devices for development only. These IMEIs are valid but belong to no real tracker. */
export const MOCK_IMEIS = {
  matchByPhone: "352090100000012",
  matchByEmail: "352090100000020",
  noCustomerMatch: "352090100000038",
  ambiguousCustomer: "352090100000046",
  partialDetails: "352090100000053",
  malformedResponse: "352090100000061",
  apiFailure: "352090100000079",
} as const;

const MOCK_BODIES: Record<string, unknown> = {
  [MOCK_IMEIS.matchByPhone]: {
    imei: MOCK_IMEIS.matchByPhone,
    status: "online",
    model: "FMB920",
    name: "KDA 123A",
    sim_card: "0112614341",
    plate_number: "KDA 123A",
    last_seen: "2026-10-16T14:32:00Z",
    expiry_date: "2027-09-30",
    activation_date: "2026-09-30",
    account: "wanjiru.mwangi",
    contact: { name: "Wanjiru Mwangi", phone: "0700 000 102", email: "w.mwangi@mail.example" },
  },
  [MOCK_IMEIS.matchByEmail]: {
    imei: MOCK_IMEIS.matchByEmail,
    status: "offline",
    model: "TK-103 (2G)",
    name: "KCB 456B",
    sim_card: "0733100200",
    plate_number: "KCB 456B",
    last_seen: "2026-10-17 08:05",
    expiry_date: "2027-03-31",
    activation_date: "2026-03-31",
    account: "savanna-fleet",
    contact: { name: "Accounts Dept", phone: "+254711999888", email: "Accounts@Savanna-Logistics.example" },
  },
  [MOCK_IMEIS.noCustomerMatch]: {
    imei: MOCK_IMEIS.noCustomerMatch,
    status: "expired",
    model: "DC-02 Dashcam",
    name: "KDG 789C",
    sim_card: "0100200300",
    plate_number: "KDG 789C",
    last_seen: "2026-10-15T19:10:00Z",
    expiry_date: "2026-09-30",
    activation_date: "2025-12-31",
    account: "p.kimani",
    contact: { name: "Peter Kimani", phone: "+254799000999", email: "peter.kimani@mail.example" },
  },
  [MOCK_IMEIS.ambiguousCustomer]: {
    imei: MOCK_IMEIS.ambiguousCustomer,
    status: "online",
    model: "FMB920",
    name: "KDD 321D",
    sim_card: "0112614342",
    plate_number: "KDD 321D",
    last_seen: "2026-10-16T09:00:00Z",
    expiry_date: "2027-01-15",
    activation_date: "2026-01-15",
    account: "shared-account",
    // Phone belongs to one CRM customer and the email to another, so no match is reliable.
    contact: { name: "Shared Contact", phone: "+254700000103", email: "info@riftvalley-haulage.example" },
  },
  [MOCK_IMEIS.partialDetails]: {
    imei: MOCK_IMEIS.partialDetails,
    model: "LLS-AF 20160",
    plate_number: "KDE 654E",
  },
  [MOCK_IMEIS.malformedResponse]: { plate_number: "KDF 987F" },
};

/** A made-up but consistent device for any valid IMEI. Its contact matches no CRM customer. */
function fakeDeviceFor(imei: string): unknown {
  const tail = imei.slice(-6);
  const letters = "ABCDEFGHJK";
  const models = ["FMB920", "TK-103 (2G)", "LLS-AF 20160", "DC-02 Dashcam"];
  const pick = (i: number) => Number(imei[i]);
  const plate = `K${letters[pick(8)]}${letters[pick(9)]} ${100 + (Number(tail) % 900)}${letters[pick(13)]}`;
  return {
    imei,
    status: "online",
    model: models[Number(imei.slice(-2)) % models.length],
    name: plate,
    sim_card: `0112${tail.slice(-6)}`,
    plate_number: plate,
    last_seen: "2026-10-17T08:00:00Z",
    expiry_date: "2027-10-17",
    activation_date: "2026-10-17",
    account: `test-${tail}`,
    contact: { name: "Test Contact", phone: `+254799${tail}`, email: `test.${tail}@mail.example` },
  };
}

/** True only when the app is opened from this computer (localhost, 127.0.0.1 or ::1). */
export function isLocalhost(): boolean {
  if (typeof window === "undefined") return false;
  const h = window.location.hostname;
  return h === "localhost" || h === "127.0.0.1" || h === "[::1]" || h === "::1" || h.endsWith(".localhost");
}

export const mockGpsPlatformClient: GpsPlatformClient = {
  source: "mock",
  async verifyImei(imei) {
    // The mock exists for local development only. Anywhere else it must not pretend to verify.
    if (!isLocalhost()) {
      throw new GpsPlatformError("api-error", "GPSPlatform is not connected, so IMEIs cannot be verified here yet.");
    }
    await wait(700);
    if (imei === MOCK_IMEIS.apiFailure) {
      throw new GpsPlatformError("api-error", "GPSPlatform is not responding right now. Try again in a few minutes.");
    }
    // For testing, any other valid IMEI gets a made-up device instead of "not found".
    return MOCK_BODIES[imei] ?? fakeDeviceFor(imei);
  },
};

/** The one place to switch from the mock to a real, server-backed client. */
export const gpsPlatformClient: GpsPlatformClient = mockGpsPlatformClient;
