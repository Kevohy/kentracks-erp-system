import "server-only";
import type { FieldResult } from "@/lib/validation";
import { ApiError } from "./http";

/**
 * Validates a request body with the SAME validators the forms use (src/lib/*-validation.ts),
 * so browser and server cannot drift apart. Returns the normalised values (E.164 phones,
 * collapsed whitespace, ...) or throws a 422 listing every bad field.
 */
export function parseFields<F extends string>(
  body: Record<string, unknown>,
  fields: readonly F[],
  validate: (field: F, raw: string) => FieldResult,
): Record<F, string> {
  const errors: Record<string, string> = {};
  const allowed = new Set<string>([...fields, "type"]);
  for (const key of Object.keys(body)) if (!allowed.has(key)) errors[key] = "This field is not accepted";

  const clean = {} as Record<F, string>;
  for (const f of fields) {
    const raw = body[f];
    if (raw !== undefined && typeof raw !== "string") {
      errors[f] = "Must be text";
      continue;
    }
    const r = validate(f, raw ?? "");
    if (r.error) errors[f] = r.error;
    clean[f] = r.value;
  }
  if (Object.keys(errors).length) throw new ApiError(422, "Please correct the highlighted fields", errors);
  return clean;
}

/**
 * Picks the record type from the body (create) or checks it matches the stored one (update). With `canChange`, an
 * update may give another valid type (customers can move between End User, Distributor and Company).
 */
export function parseType<T extends string>(body: Record<string, unknown>, allowed: readonly T[], existing?: T, canChange = false): T {
  const raw = body.type;
  if (existing !== undefined && canChange) {
    if (raw === undefined) return existing;
    if (typeof raw !== "string" || !(allowed as readonly string[]).includes(raw))
      throw new ApiError(422, "Please choose a valid type", { type: `Type must be one of: ${allowed.join(", ")}` });
    return raw as T;
  }
  if (existing !== undefined) {
    if (raw !== undefined && raw !== existing) throw new ApiError(422, "The type of an existing record cannot be changed", { type: "The type cannot be changed" });
    return existing;
  }
  if (typeof raw !== "string" || !(allowed as readonly string[]).includes(raw))
    throw new ApiError(422, "Please choose a valid type", { type: `Type must be one of: ${allowed.join(", ")}` });
  return raw as T;
}
