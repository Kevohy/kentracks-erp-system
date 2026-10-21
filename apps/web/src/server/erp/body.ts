import "server-only";
import { ApiError } from "../crm/http";

/**
 * Strict readers for the JSON drafts the forms send. They check SHAPE only (right keys, right
 * JavaScript types, sane sizes). Every business rule is then checked by the same validators the
 * forms use (src/lib/*-validation.ts), so the browser and the server cannot drift apart.
 */

export type Body = Record<string, unknown>;
const MAX_STRING = 2000;
const MAX_ROWS = 200;
const ROW_KEY = /^[A-Za-z0-9_-]{1,40}$/;
const CLIENT_KEY = /^[A-Za-z0-9_-]{8,64}$/;

const fail = (errors: Record<string, string>) => new ApiError(422, "Please correct the highlighted fields", errors);

/** Collects shape errors so one response can list every bad field. */
export class Reader {
  readonly errors: Record<string, string> = {};
  constructor(private body: Body, allowed: readonly string[]) {
    for (const k of Object.keys(body)) if (!allowed.includes(k)) this.errors[k] = "This field is not accepted";
  }

  /** A text field. Missing means empty; anything other than text is rejected. */
  text(key: string, errorKey = key): string {
    const v = this.body[key];
    if (v === undefined || v === null) return "";
    if (typeof v !== "string") {
      this.errors[errorKey] = "Must be text";
      return "";
    }
    if (v.length > MAX_STRING) {
      this.errors[errorKey] = "This value is too long";
      return "";
    }
    return v;
  }

  bool(key: string): boolean {
    const v = this.body[key];
    if (v === undefined) return false;
    if (typeof v !== "boolean") {
      this.errors[key] = "Must be true or false";
      return false;
    }
    return v;
  }

  /** Optional idempotency key: the browser makes one per form so a repeated submit cannot add a second record. */
  clientKey(): string | null {
    const v = this.body.clientKey;
    if (v === undefined || v === null) return null;
    if (typeof v !== "string" || !CLIENT_KEY.test(v)) {
      this.errors.clientKey = "Invalid request key";
      return null;
    }
    return v;
  }

  /** A list of objects whose fields are all text. Each row must carry a unique `key` (the form uses it to place errors). */
  rows<K extends string>(key: string, fields: readonly K[]): Array<Record<K | "key", string>> {
    const v = this.body[key];
    if (v === undefined) return [];
    if (!Array.isArray(v)) {
      this.errors[key] = "Must be a list";
      return [];
    }
    if (v.length > MAX_ROWS) {
      this.errors[key] = "Too many rows";
      return [];
    }
    const seen = new Set<string>();
    const out: Array<Record<K | "key", string>> = [];
    v.forEach((row, i) => {
      const at = `${key}[${i}]`;
      if (!row || typeof row !== "object" || Array.isArray(row)) {
        this.errors[at] = "Must be an object";
        return;
      }
      const r = row as Body;
      for (const k of Object.keys(r)) if (k !== "key" && !(fields as readonly string[]).includes(k)) this.errors[at] = `Unknown field "${k}"`;
      const rk = r.key;
      if (typeof rk !== "string" || !ROW_KEY.test(rk) || seen.has(rk)) {
        this.errors[at] = "Each row needs a unique key";
        return;
      }
      seen.add(rk);
      const clean = { key: rk } as Record<K | "key", string>;
      for (const f of fields) {
        const fv = r[f];
        if (fv === undefined || fv === null) clean[f] = "";
        else if (typeof fv !== "string" || fv.length > MAX_STRING) {
          this.errors[at] = `"${f}" must be text`;
          return;
        } else clean[f] = fv;
      }
      out.push(clean);
    });
    return out;
  }

  /** Throws 422 if any shape error was collected. */
  done(): void {
    if (Object.keys(this.errors).length) throw fail(this.errors);
  }
}

/** Throws the 422 the forms expect from a validator's error map. */
export function throwValidation(errors: Record<string, string>): never {
  throw fail(errors);
}
