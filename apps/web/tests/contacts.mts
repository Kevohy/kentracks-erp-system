/**
 * A customer's phone number and email must be unique in a company, so tests that create customers use fresh ones on
 * every run. Phones are random Kenyan mobile numbers (07xxxxxxxx, valid for libphonenumber); emails carry a run tag.
 */
const used = new Set<string>();
const tag = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
let n = 0;

/** A fresh local phone number, e.g. "0712345678". */
export function freshPhone(): string {
  for (;;) {
    const p = `07${String(Math.floor(Math.random() * 100_000_000)).padStart(8, "0")}`;
    if (!used.has(p)) {
      used.add(p);
      return p;
    }
  }
}
/** The E.164 form the API stores: "0712345678" -> "+254712345678". */
export const e164 = (local: string) => `+254${local.slice(1)}`;
/** A fresh email address. */
export const freshEmail = (name = "c") => `${name}.${tag}.${n++}@example.com`;
