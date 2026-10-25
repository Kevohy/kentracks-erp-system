import { NextResponse, type NextRequest } from "next/server";
import { PUBLIC_PAGES } from "@/lib/auth-redirect";
import { readSessionToken, validateSession, SESSION_COOKIE } from "@/server/auth/session";

/**
 * Route protection. Runs before every page and API request:
 *  - pages: no valid session -> redirect to /login?next=<where they were going>
 *  - /api/*: no session cookie -> 401 straight away (each handler still validates the session itself and takes
 *    the company from it, so this is a second layer, not the only one)
 * The login/logout endpoints and the two public pages are the only things reachable while signed out.
 */
// /api/health only says whether the app and its database answer (for Dokploy / uptime checks); it shows no data.
const PUBLIC_API = ["/api/auth/login", "/api/auth/logout", "/api/health"];
const WRITES = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * CSRF protection: a request that changes something must come from this app's own pages. Browsers send Origin on
 * such requests (and Sec-Fetch-Site); a different origin, or "null", is refused. Requests with neither header come
 * from non-browser clients (scripts, tests, uptime checks), which cannot ride a user's cookie, so they pass.
 */
function crossSite(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (origin) {
    let o: URL;
    try {
      o = new URL(origin);
    } catch {
      return true;
    }
    const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "").split(",")[0].trim().toLowerCase();
    return !host || o.host.toLowerCase() !== host;
  }
  return req.headers.get("sec-fetch-site") === "cross-site";
}

/**
 * Content Security Policy with a fresh nonce per page request: only this app's own scripts (and the ones Next.js
 * marks with the nonce) can run, nothing can be loaded from other sites, and no other site can frame the app.
 */
function contentSecurityPolicy(nonce: string, https: boolean): string {
  const dev = process.env.NODE_ENV === "development";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    // Inline style attributes are used for widths and colours; styles cannot run code.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self'${dev ? " ws: wss:" : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(https ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

/** Pages: pass the request on with the CSP (Next.js reads the nonce from it) and send the same CSP to the browser. */
function nextWithCsp(req: NextRequest): NextResponse {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const https = req.nextUrl.protocol === "https:" || req.headers.get("x-forwarded-proto") === "https";
  const csp = contentSecurityPolicy(nonce, https);
  const headers = new Headers(req.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);
  const res = NextResponse.next({ request: { headers } });
  res.headers.set("Content-Security-Policy", csp);
  return res;
}

export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const token = readSessionToken(req.headers);

  if (pathname.startsWith("/api/")) {
    if (WRITES.has(req.method) && crossSite(req)) {
      return NextResponse.json({ error: "Request refused: it did not come from this app." }, { status: 403, headers: { "Cache-Control": "no-store" } });
    }
    if (PUBLIC_API.includes(pathname) || token) return NextResponse.next();
    return NextResponse.json({ error: "Not authenticated" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  const isPublicPage = PUBLIC_PAGES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (isPublicPage) return nextWithCsp(req);

  let signedIn = false;
  try {
    signedIn = !!(await validateSession(token));
  } catch {
    // The database is unreachable: fail closed rather than showing the app to an unverified visitor.
    return new NextResponse("The service is temporarily unavailable. Please try again shortly.", { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "30" } });
  }
  if (signedIn) return nextWithCsp(req);

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  if (pathname !== "/") url.searchParams.set("next", pathname + search);
  const res = NextResponse.redirect(url);
  res.headers.set("Cache-Control", "no-store");
  if (token) res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 }); // drop the dead cookie
  return res;
}

export const config = {
  // Everything except Next's own static assets and the favicon.
  matcher: ["/((?!_next/static|_next/image|icon.svg|favicon.ico).*)"],
};
