import { validatePhone } from "./validation";

/**
 * Communication → Bulk SMS with TextSMS (https://sms.textsms.co.ke). Shared by the browser and the server so both
 * apply the same message rules (GSM-7 characters, length, template fields).
 */

/** Recipients per send (TextSMS takes 20 per request; the server splits a send into requests of 20). */
export const SMS_MAX_RECIPIENTS = 1000;
/** Six SMS parts of 153 characters. */
export const SMS_MAX_CHARS = 918;
export const SMS_TEMPLATE_NAME_MAX = 60;

export type SmsKind = "Customers" | "AirtimeReminder" | "ExpiryReminder" | "OneOff" | "System";
/** What a template or a send is written for (System messages come from other screens, e.g. Remove from airtime). */
export type SmsAudience = Exclude<SmsKind, "System">;
export const SMS_AUDIENCES: readonly SmsAudience[] = ["Customers", "AirtimeReminder", "ExpiryReminder", "OneOff"];
export const audienceLabel: Record<SmsKind, string> = {
  Customers: "Customers",
  AirtimeReminder: "Monthly airtime reminder",
  ExpiryReminder: "Expiry & renewal reminder",
  OneOff: "Phone numbers",
  System: "System",
};

/**
 * Pending: saved, TextSMS not asked yet. Scheduled: TextSMS accepted it for a later time. Sent: TextSMS accepted it.
 * Delivered / Failed: the delivery report. Unknown: TextSMS never answered (check its dashboard before resending).
 */
export type SmsStatus = "Pending" | "Scheduled" | "Sent" | "Delivered" | "Failed" | "Unknown";

export type SmsMessage = {
  id: string;
  customerName: string;
  vehiclePlate: string;
  /** E.164, e.g. +254712345678. */
  phone: string;
  message: string;
  parts: number;
  status: SmsStatus;
  messageId: string | null;
  error: string | null;
  /** The delivery report text from TextSMS, e.g. "DeliveredToTerminal". */
  dlr: string | null;
  updatedAt: string;
};

export type SmsBatch = {
  id: string;
  kind: SmsKind;
  /** The message as written (with {fields}); each message has the filled-in text. */
  message: string;
  templateName: string | null;
  recipients: number;
  /** Accepted by TextSMS (includes delivered and scheduled). */
  sent: number;
  delivered: number;
  failed: number;
  parts: number;
  scheduledFor: string | null;
  error: string | null;
  createdAt: string;
  createdBy: string | null;
  /** Only filled when one send is opened. */
  messages: SmsMessage[] | null;
};

export type SmsTemplate = { id: string; name: string; body: string; audience: SmsAudience; updatedAt: string };

/** Whether TextSMS is set up on the server. Nothing about the account or the API key is ever sent to the browser. */
export type TextSmsStatus = { configured: boolean };

export type SmsOverview = {
  month: string;
  configured: boolean;
  /** TextSMS credit as returned, e.g. "1,250.00"; null when not set up or it could not be read. */
  balance: string | null;
  balanceError: string | null;
  sentThisMonth: number;
  deliveredThisMonth: number;
  failedThisMonth: number;
  partsThisMonth: number;
  scheduled: number;
  airtimeRemindersDue: number;
  expiringSoon: number;
  expired: number;
  customersWithPhone: number;
};

export type SmsLast = { at: string; status: SmsStatus };

export type SmsCustomer = {
  id: string;
  name: string;
  /** People: first name. Companies: the company name. */
  firstName: string;
  account: string;
  type: "End User" | "Distributor" | "Company";
  brandName: string | null;
  /** E.164, null when the customer has no valid phone number. */
  phone: string | null;
  devices: number;
  expired: number;
  expiringSoon: number;
  last: SmsLast | null;
};

export type ReminderState = "Due" | "Sent this month" | "No phone" | "Device expired" | "Blocked" | "Expiring soon" | "Expired";

/** A device (tracker line) for the monthly airtime reminder or the expiry & renewal reminder. */
export type SmsReminderLine = {
  saleId: string;
  customerId: string;
  customerName: string;
  firstName: string;
  phone: string | null;
  vehiclePlate: string;
  imei: string;
  simNumber: string;
  /** YYYY-MM-DD, null when unknown. */
  expiry: string | null;
  /** Days until expiry (negative: expired that many days ago). */
  daysLeft: number | null;
  renewalFeeMinor: number | null;
  state: ReminderState;
  /** Can be picked for this send. */
  selectable: boolean;
  last: SmsLast | null;
  saleType: "Package Sale" | "Hosting Sale";
  soldAt: string;
  /**
   * Monthly airtime reminder only: how the sale came to be on the SMS reminder, from the sale's history. "At sale":
   * ticked when the sale was made. "Changed": switched later (from `from`), e.g. in Sale details or Remove from airtime.
   */
  subscribed: { how: "At sale" | "Changed"; at: string; from: "None" | "Automatic airtime recharge" | null; by: string | null; reason: string } | null;
  /** Reminders this line has been sent in total. */
  reminders: number;
  /** Monthly airtime reminder: the day of the month it goes out (the device's expiry day, else the sale day). */
  smsDay: number;
  /** The device on the GPS platform as last checked; null when not checked yet. */
  connection: "Online" | "Offline" | "Expired" | null;
  /** The customer is blocked from reminders. */
  blocked: boolean;
  /** Device model from the GPS platform, else the tracker sold. */
  model: string | null;
  packageName: string;
  packagePriceMinor: number;
  /** YYYY-MM-DD: the GPS platform's activation date, else the day it was sold. */
  activationDate: string;
  /** When the device was last checked on the GPS platform (ISO), null if never. */
  checkedAt: string | null;
  /** Every sale of this device (IMEI), newest first. */
  history: { saleId: string; type: "Package Sale" | "Hosting Sale"; at: string; packageName: string; totalMinor: number; cardType: string }[];
};

/** The automatic monthly airtime reminder of the company (Bulk SMS → SMS Reminders). */
export type SmsReminderSettings = {
  enabled: boolean;
  message: string;
  /** Hour of the day (Nairobi) the day's reminders go out, 6 to 20. */
  sendHour: number;
  lastRunAt: string | null;
  lastRunNote: string | null;
};

export const DEFAULT_REMINDER_MESSAGE = "Hello {first_name}, please top up airtime on the tracker SIM {sim_number} for {plate} so your tracking keeps working. Thank you.";

/** 1 -> "1st", 22 -> "22nd" */
export const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th"}`;

/** The day this month a reminder day falls on (the 31st in a 30-day month is the 30th). */
export const dayThisMonth = (day: number, ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return Math.min(day, new Date(Date.UTC(y, m, 0)).getUTCDate());
};

// ------------------------------------------------------------------ GSM-7

const GSM_BASIC =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM_EXT = "^{}\\[~]|€";
const SWAPS: Record<string, string> = {
  "‘": "'", "’": "'", "‚": "'", "‛": "'", "´": "'", "`": "'",
  "“": '"', "”": '"', "„": '"', "«": '"', "»": '"',
  "–": "-", "—": "-", "‐": "-", "‑": "-", "−": "-",
  "…": "...", " ": " ", " ": " ", " ": " ", "\t": " ", "•": "-", "·": "-",
};

/** Swaps typographic characters phones and Word add (curly quotes, long dashes, …) for plain GSM ones. */
export const normalizeSms = (text: string) => text.replace(/\r\n?/g, "\n").replace(/[‘’‚‛´`“”„«»–—‐‑−…   \t•·]/g, (c) => SWAPS[c] ?? c);

/** Characters an SMS cannot carry (emoji, accented letters outside GSM-7, …), each listed once. */
export function gsmProblems(text: string): string[] {
  const bad = new Set<string>();
  for (const ch of text) if (!GSM_BASIC.includes(ch) && !GSM_EXT.includes(ch)) bad.add(ch);
  return [...bad];
}

/** GSM-7 length (the extended characters ^{}\[~]|€ count twice). */
export const gsmLength = (text: string) => [...text].reduce((n, ch) => n + (GSM_EXT.includes(ch) ? 2 : 1), 0);

/** SMS parts: 160 characters fit one SMS; longer messages go in parts of 153. */
export const smsParts = (text: string) => {
  const n = gsmLength(text);
  return n === 0 ? 0 : n <= 160 ? 1 : Math.ceil(n / 153);
};

// ------------------------------------------------------------------ template fields

export type SmsField = { key: string; label: string; example: string };

const NAME: SmsField = { key: "name", label: "Customer name", example: "Peter Omondi" };
const FIRST: SmsField = { key: "first_name", label: "First name", example: "Peter" };
const PLATE: SmsField = { key: "plate", label: "Plate", example: "KAA 214B" };
const IMEI: SmsField = { key: "imei", label: "IMEI", example: "868120300000001" };
const EXPIRY: SmsField = { key: "expiry", label: "Expiry date", example: "30 Nov 2026" };

/** The {fields} each kind of send can fill in. */
export const SMS_FIELDS: Record<SmsAudience, SmsField[]> = {
  Customers: [NAME, FIRST, { key: "account", label: "Account", example: "PETER01" }],
  AirtimeReminder: [NAME, FIRST, PLATE, { key: "sim_number", label: "Tracker SIM number", example: "0712 345 678" }, IMEI, EXPIRY],
  ExpiryReminder: [NAME, FIRST, PLATE, IMEI, EXPIRY, { key: "days_left", label: "Days left", example: "in 12 days" }, { key: "renewal_fee", label: "Renewal fee", example: "KES 2,500" }],
  OneOff: [],
};

/** Ready-made messages shown next to the saved templates (not stored). */
export const STARTER_TEMPLATES: Record<SmsAudience, { name: string; body: string }[]> = {
  Customers: [
    { name: "Thank you", body: "Hello {first_name}, thank you for tracking with us. For help with your tracker, reply to this message or call our support line." },
    { name: "Service notice", body: "Hello {first_name}, our tracking platform will have scheduled maintenance tonight from 11pm to 1am. Tracking resumes automatically." },
  ],
  AirtimeReminder: [
    { name: "Monthly airtime reminder", body: "Hello {first_name}, please top up airtime on the tracker SIM {sim_number} for {plate} so your tracking keeps working. Thank you." },
  ],
  ExpiryReminder: [
    { name: "Expiring soon", body: "Hello {first_name}, tracking for {plate} expires on {expiry} ({days_left}). Renew for {renewal_fee} to keep it active." },
    { name: "Expired", body: "Hello {first_name}, tracking for {plate} expired on {expiry}. Renew for {renewal_fee} to get tracking back. Thank you." },
  ],
  OneOff: [],
};

/** {fields} used in a message that this kind of send cannot fill in. */
export function unknownFields(body: string, audience: SmsAudience): string[] {
  const allowed = new Set(SMS_FIELDS[audience].map((f) => f.key));
  const bad = new Set<string>();
  for (const m of body.matchAll(/\{([^{}\s]*)\}/g)) if (!allowed.has(m[1])) bad.add(`{${m[1]}}`);
  return [...bad];
}

/** Fills in {fields}. A field with no value becomes empty, and the spaces around it are tidied. */
export const renderSms = (body: string, values: Record<string, string>) =>
  normalizeSms(body.replace(/\{([a-z_]+)\}/g, (all, k: string) => (k in values ? values[k] : all)))
    .replace(/[ ]{2,}/g, " ")
    .replace(/ ([.,!?)])/g, "$1")
    .trim();

/** "2026-11-30" -> "30 Nov 2026" */
export const smsDate = (ymd: string | null) =>
  ymd ? new Date(`${ymd}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "";

export const daysLeftText = (d: number | null) =>
  d === null ? "" : d === 0 ? "today" : d === 1 ? "tomorrow" : d > 0 ? `in ${d} days` : d === -1 ? "yesterday" : `${-d} days ago`;

const kesText = (minor: number | null) => (minor === null ? "" : `KES ${(minor / 100).toLocaleString("en-KE", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`);

/** The values of every {field} for a customer or a reminder line. */
export function fieldValues(audience: SmsAudience, r: SmsCustomer | SmsReminderLine): Record<string, string> {
  if (audience === "Customers") {
    const c = r as SmsCustomer;
    return { name: c.name, first_name: c.firstName, account: c.account };
  }
  const l = r as SmsReminderLine;
  const sim = l.simNumber ? (validatePhone(l.simNumber).error ? l.simNumber : localPhone(validatePhone(l.simNumber).value)) : "";
  return {
    name: l.customerName,
    first_name: l.firstName,
    plate: l.vehiclePlate || l.imei,
    imei: l.imei,
    sim_number: sim,
    expiry: smsDate(l.expiry),
    days_left: daysLeftText(l.daysLeft),
    renewal_fee: kesText(l.renewalFeeMinor),
  };
}

/** "+254712345678" -> "0712 345 678" (Kenyan numbers; others unchanged). */
export const localPhone = (e164: string) => {
  const m = /^\+254(\d{3})(\d{3})(\d{3})$/.exec(e164);
  return m ? `0${m[1]} ${m[2]} ${m[3]}` : e164;
};

// ------------------------------------------------------------------ checks shared by the form and the server

/** Checks one message (after its fields are filled in). Returns the error, or null. */
export function messageProblem(text: string): string | null {
  if (!text.trim()) return "Write the message";
  const bad = gsmProblems(text);
  if (bad.length) return `Remove characters an SMS cannot send: ${bad.slice(0, 8).join(" ")}`;
  if (gsmLength(text) > SMS_MAX_CHARS) return `Keep the message to ${SMS_MAX_CHARS} characters (6 SMS)`;
  return null;
}

export type SmsTemplateDraft = { name: string; body: string; audience: string };

/** The same checks in the template form and on the server. */
export function validateTemplate(d: SmsTemplateDraft): { errors: Record<string, string>; value?: { name: string; body: string; audience: SmsAudience } } {
  const errors: Record<string, string> = {};
  const name = d.name.replace(/\s+/g, " ").trim();
  const body = normalizeSms(d.body).trim();
  const audience = (SMS_AUDIENCES as readonly string[]).includes(d.audience) ? (d.audience as SmsAudience) : null;
  if (!name) errors.name = "Enter a name";
  else if (name.length > SMS_TEMPLATE_NAME_MAX) errors.name = `Keep the name to ${SMS_TEMPLATE_NAME_MAX} characters`;
  if (!audience) errors.audience = "Choose who the template is for";
  const problem = messageProblem(body);
  if (problem) errors.body = problem;
  else if (audience) {
    const bad = unknownFields(body, audience);
    if (bad.length) errors.body = audience === "OneOff" ? `Messages to phone numbers cannot use fields: ${bad.join(" ")}` : `Unknown field${bad.length > 1 ? "s" : ""}: ${bad.join(" ")}`;
  }
  if (Object.keys(errors).length) return { errors };
  return { errors, value: { name, body, audience: audience! } };
}

/** Phone numbers typed or pasted: one per line, or separated by commas, spaces or semicolons. Duplicates are dropped. */
export function parsePhoneList(raw: string): { phones: string[]; invalid: string[] } {
  const phones: string[] = [];
  const invalid: string[] = [];
  // Numbers may be typed with spaces inside ("0712 345 678"), so split on commas, semicolons and new lines first.
  const parts = raw.split(/[\n,;]+/).flatMap((chunk) => {
    const t = chunk.trim();
    if (!t) return [];
    if (!validatePhone(t).error) return [t];
    return t.split(/\s+/).filter(Boolean);
  });
  for (const p of parts) {
    const v = validatePhone(p);
    if (v.error) invalid.push(p);
    else if (!phones.includes(v.value)) phones.push(v.value);
  }
  return { phones, invalid };
}

/** Scheduling: "YYYY-MM-DDTHH:mm" in Nairobi time. Between 5 minutes and 90 days from now. */
export function checkSchedule(local: string, now = Date.now()): { at?: Date; error?: string } {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!m) return { error: "Choose the date and time to send" };
  const at = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4] - 3, +m[5])); // Nairobi is UTC+3 all year
  if (Number.isNaN(at.getTime()) || at.getUTCMinutes() !== +m[5]) return { error: "Choose a valid date and time" };
  if (at.getTime() < now + 5 * 60_000) return { error: "Choose a time at least 5 minutes from now" };
  if (at.getTime() > now + 90 * 86_400_000) return { error: "Choose a time within the next 90 days" };
  return { at };
}

/** A Date -> "2026-11-30 18:00" in Nairobi time (the format TextSMS takes for timeToSend). */
export const nairobiStamp = (d: Date) => new Date(d.getTime() + 3 * 3_600_000).toISOString().slice(0, 16).replace("T", " ");
