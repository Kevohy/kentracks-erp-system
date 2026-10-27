import "server-only";
import { countError } from "../ops/metrics";
import { inRequestScope } from "./db-scope";

/** An error that becomes a JSON response. `errors` maps form field names to messages. */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public errors?: Record<string, string>,
    /** Sent as a Retry-After header (seconds), e.g. with 429. */
    public retryAfterSeconds?: number,
  ) {
    super(message);
  }
}

const HEADERS = { "Cache-Control": "no-store" } as const;
const MAX_BODY = 16 * 1024;

export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: HEADERS });
}

export const noContent = () => new Response(null, { status: 204, headers: HEADERS });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: string) => UUID.test(v);

/** Reads a small JSON object body. Requiring application/json also blocks cross-site form posts. */
export async function readJsonObject(req: Request, maxBytes = MAX_BODY): Promise<Record<string, unknown>> {
  if (!(req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json"))
    throw new ApiError(415, "Content-Type must be application/json");
  const text = await req.text();
  if (Buffer.byteLength(text) > maxBytes) throw new ApiError(413, "Request body is too large");
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new ApiError(400, "Request body is not valid JSON");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new ApiError(400, "Request body must be a JSON object");
  return body as Record<string, unknown>;
}

type PgError = { code?: string; constraint?: string; message?: string };

/** Runs a route handler and turns every failure into a safe JSON response (no SQL or stack traces leak). */
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  // Every API request gets its own database scope; getAuthContext puts the user's company in it (row-level security).
  return inRequestScope(() => handleInScope(fn));
}

async function handleInScope(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ApiError) {
      const res = json({ error: e.message, ...(e.errors ? { errors: e.errors } : {}) }, e.status);
      if (e.retryAfterSeconds) res.headers.set("Retry-After", String(e.retryAfterSeconds));
      return res;
    }
    const pg = e as PgError;
    // drizzle wraps driver errors; the original is on `cause`.
    const cause = ((e as { cause?: PgError }).cause ?? pg) as PgError;
    if (cause.code === "23514") return json({ error: "The values do not satisfy the data rules" }, 422);
    if (cause.code === "23505") return json({ error: "This record already exists" }, 409);
    // Two requests changed the same rows at once; the client may simply try again.
    if (cause.code === "40001" || cause.code === "40P01") return json({ error: "The system is busy. Please try again." }, 409);
    if (cause.code === "23503") {
      // Deleting something that other records still use is blocked by the database; adding a record that points at nothing is a different mistake.
      const blockedDelete = /^update or delete on table/.test(cause.message ?? "");
      return json({ error: blockedDelete ? "This record is used by other records (for example a sale or purchase), so it cannot be deleted" : "A referenced record does not exist" }, 409);
    }
    console.error("[api] unexpected error:", e instanceof Error ? e.message : e);
    countError();
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
}

/** The Postgres constraint name behind a unique violation (23505), or undefined. */
export function uniqueViolation(e: unknown): string | undefined {
  const cause = ((e as { cause?: PgError }).cause ?? (e as PgError)) as PgError;
  return cause.code === "23505" ? (cause.constraint ?? "") : undefined;
}
