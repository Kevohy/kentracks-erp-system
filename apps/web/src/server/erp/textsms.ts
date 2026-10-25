import "server-only";
import { ApiError } from "../crm/http";

/**
 * TextSMS (https://sms.textsms.co.ke) — every SMS the system sends goes through here.
 *
 * The account comes from the server environment, never from the database or the browser:
 *   TEXTSMS_API_KEY      the API key        (never logged or returned)
 *   TEXTSMS_PARTNER_ID   the partner ID     (never returned)
 *   TEXTSMS_SENDER_ID    the sender ID / shortcode the messages come from
 * TEXTSMS_API_URL may point at a fake TextSMS for tests; real use always goes to the live API.
 */

const LIVE_URL = "https://sms.textsms.co.ke";
/** TextSMS takes up to 20 messages per sendbulk request. */
export const TEXTSMS_BULK_MAX = 20;

export type TextSmsCreds = { apiKey: string; partnerId: string; senderId: string };

function baseUrl(): string {
  const raw = (process.env.TEXTSMS_API_URL ?? "").trim().replace(/\/+$/, "");
  return /^https?:\/\//.test(raw) ? raw : LIVE_URL;
}

function envCreds(): TextSmsCreds | null {
  const apiKey = (process.env.TEXTSMS_API_KEY ?? "").trim();
  const partnerId = (process.env.TEXTSMS_PARTNER_ID ?? "").trim();
  const senderId = (process.env.TEXTSMS_SENDER_ID ?? "").trim();
  return apiKey && partnerId && senderId ? { apiKey, partnerId, senderId } : null;
}

export const textSmsConfigured = () => !!envCreds();
export const textSmsCreds = () => envCreds();

export function textSmsCredsOrThrow(): TextSmsCreds {
  const c = envCreds();
  if (!c) throw new ApiError(422, "TextSMS is not set up yet. Ask the system administrator to set it up.", { form: "TextSMS is not set up yet." });
  return c;
}

/** TextSMS result codes, in words a person can act on. Never mentions the key or the partner ID. */
const CODES: Record<number, string> = {
  1001: "TextSMS rejected the sender ID. Ask the system administrator to check it.",
  1002: "TextSMS does not deliver to this network.",
  1003: "Invalid mobile number.",
  1004: "Not enough SMS credit. Top up the TextSMS account.",
  1005: "TextSMS system error. Try again later.",
  1006: "TextSMS refused the account. Ask the system administrator to check it.",
  1007: "TextSMS system error. Try again later.",
  1008: "No delivery report yet.",
  1009: "TextSMS did not accept the message format.",
  1010: "TextSMS did not accept the request.",
  4090: "TextSMS internal error. Try again after 5 minutes.",
  4091: "TextSMS account is not set up correctly. Ask the system administrator to check it.",
  4092: "TextSMS account is not set up correctly. Ask the system administrator to check it.",
  4093: "TextSMS could not find the details.",
};
export const textSmsCodeText = (code: number | null, fallback?: string | null) =>
  (code !== null && CODES[code]) || (fallback ? fallback.slice(0, 200) : code !== null ? `Not accepted by TextSMS (code ${code}).` : "Not accepted by TextSMS.");

type Entry = Record<string, unknown>;
const codeOf = (e: Entry): number | null => {
  const v = e["respose-code"] ?? e["response-code"] ?? e["responseCode"] ?? e["code"];
  const n = typeof v === "number" ? v : typeof v === "string" && /^\d+$/.test(v.trim()) ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const textOf = (v: unknown, max = 200) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : typeof v === "number" ? String(v) : null);

/** POST JSON; null when TextSMS could not be reached or did not answer in time. */
async function post(path: string, body: unknown, timeoutMs = 30_000): Promise<{ status: number; json: unknown } | null> {
  try {
    const res = await fetch(`${baseUrl()}${path}`, {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await res.text();
    let json: unknown = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    return { status: res.status, json };
  } catch {
    return null;
  }
}

/** "+254712345678" -> "254712345678" (the format TextSMS takes). */
const mobile = (e164: string) => e164.replace(/^\+/, "");

export type SmsOutcome = { ok: true; messageId: string | null } | { ok: false; error: string };

/**
 * Sends up to 20 messages in one request (sendbulk). Returns the outcome per clientId, or null when TextSMS did not
 * answer (the messages may or may not have gone).
 */
export async function textSmsSendBulk(c: TextSmsCreds, items: { clientId: number; phone: string; message: string }[]): Promise<Map<number, SmsOutcome> | null> {
  if (items.length > TEXTSMS_BULK_MAX) throw new Error("Too many messages for one TextSMS request");
  const r = await post("/api/services/sendbulk/", {
    count: items.length,
    smslist: items.map((i) => ({
      partnerID: c.partnerId,
      apikey: c.apiKey,
      pass_type: "plain",
      clientsmsid: i.clientId,
      mobile: mobile(i.phone),
      message: i.message,
      shortcode: c.senderId,
    })),
  });
  if (!r) return null;
  const out = new Map<number, SmsOutcome>();
  const responses = (r.json && typeof r.json === "object" && Array.isArray((r.json as { responses?: unknown }).responses) ? (r.json as { responses: Entry[] }).responses : []) as Entry[];
  for (const i of items) {
    const e = responses.find((x) => String(x.clientsmsid ?? "") === String(i.clientId));
    if (!e) {
      out.set(i.clientId, { ok: false, error: responses.length === 1 && responses[0].clientsmsid === undefined ? textSmsCodeText(codeOf(responses[0]), textOf(responses[0]["response-description"])) : `Not accepted by TextSMS (HTTP ${r.status}).` });
      continue;
    }
    const code = codeOf(e);
    out.set(i.clientId, code === 200 ? { ok: true, messageId: textOf(e.messageid, 60) } : { ok: false, error: textSmsCodeText(code, textOf(e["response-description"])) });
  }
  return out;
}

/** One message held by TextSMS until `timeToSend` ("2026-11-30 18:00", Nairobi time). Null when TextSMS did not answer. */
export async function textSmsSendScheduled(c: TextSmsCreds, item: { phone: string; message: string }, timeToSend: string): Promise<SmsOutcome | null> {
  const r = await post("/api/services/sendsms/", {
    apikey: c.apiKey,
    partnerID: c.partnerId,
    message: item.message,
    shortcode: c.senderId,
    mobile: mobile(item.phone),
    pass_type: "plain",
    timeToSend,
  });
  if (!r) return null;
  const e = (r.json && typeof r.json === "object" && Array.isArray((r.json as { responses?: unknown }).responses) ? (r.json as { responses: Entry[] }).responses[0] : null) as Entry | null;
  if (!e) return { ok: false, error: `Not accepted by TextSMS (HTTP ${r.status}).` };
  const code = codeOf(e);
  return code === 200 ? { ok: true, messageId: textOf(e.messageid, 60) } : { ok: false, error: textSmsCodeText(code, textOf(e["response-description"])) };
}

/** The SMS credit balance. Never throws; returns the message for a refusal. */
export async function textSmsBalance(c: TextSmsCreds): Promise<{ ok: true; balance: string } | { ok: false; message: string }> {
  const r = await post("/api/services/getbalance/", { apikey: c.apiKey, partnerID: c.partnerId }, 15_000);
  if (!r) return { ok: false, message: "Could not reach TextSMS. Check the internet connection and try again." };
  const j = (r.json && typeof r.json === "object" ? r.json : {}) as Entry;
  const code = codeOf(j);
  const raw = j.credit ?? j.balance ?? j.Credit ?? j.Balance;
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw.replace(/,/g, "")) : NaN;
  if (Number.isFinite(n)) return { ok: true, balance: n.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) };
  return { ok: false, message: code !== null && code !== 200 ? textSmsCodeText(code) : `Could not read the TextSMS balance (HTTP ${r.status}).` };
}

export type DlrResult = { status: "Delivered" | "Failed" | "Sent"; text: string | null };

/** The delivery report of one message. Null when TextSMS did not answer. */
export async function textSmsDlr(c: TextSmsCreds, messageId: string): Promise<DlrResult | null> {
  const r = await post("/api/services/getdlr/", { apikey: c.apiKey, partnerID: c.partnerId, messageID: messageId }, 15_000);
  if (!r) return null;
  let j = (r.json && typeof r.json === "object" ? r.json : {}) as Entry;
  if (Array.isArray((j as { responses?: unknown }).responses)) j = ((j as { responses: Entry[] }).responses[0] ?? {}) as Entry;
  const code = codeOf(j);
  const text = textOf(j["delivery-description"] ?? j["delivery-status-description"] ?? j["delivery-status"] ?? j["dlr-status"], 80);
  if (code !== null && code !== 200) return { status: "Sent", text: code === 1008 ? "No delivery report yet" : textSmsCodeText(code) };
  if (text && /deliveredtoterminal|^delivered|delivrd/i.test(text)) return { status: "Delivered", text };
  if (text && /fail|reject|expired|undeliv|blacklist|invalid|absent|blocked|dnd/i.test(text)) return { status: "Failed", text };
  return { status: "Sent", text: text ?? "No delivery report yet" };
}
