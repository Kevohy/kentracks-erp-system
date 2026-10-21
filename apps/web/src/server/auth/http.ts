import "server-only";
import { ApiError } from "../crm/http";

/**
 * Browsers always send Origin on cross-site POSTs. If it is present it must be this site; if it is missing
 * (scripts, tests) Sec-Fetch-Site, when sent, must not say "cross-site". Together with SameSite=Lax cookies
 * and the application/json requirement this blocks cross-site request forgery on the auth endpoints.
 */
export function assertSameOrigin(req: Request): void {
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (origin) {
    let originHost = "";
    try { originHost = new URL(origin).host; } catch { /* falls through to the refusal */ }
    if (!host || originHost !== host) throw new ApiError(403, "Cross-site requests are not allowed");
    return;
  }
  if (req.headers.get("sec-fetch-site") === "cross-site") throw new ApiError(403, "Cross-site requests are not allowed");
}

export function jsonWithCookies(data: unknown, status: number, cookies: string[] = [], extra: Record<string, string> = {}): Response {
  const headers = new Headers({ "Cache-Control": "no-store", ...extra });
  for (const c of cookies) headers.append("Set-Cookie", c);
  return Response.json(data, { status, headers });
}
