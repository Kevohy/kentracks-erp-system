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

export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const token = readSessionToken(req.headers);

  if (pathname.startsWith("/api/")) {
    if (PUBLIC_API.includes(pathname) || token) return NextResponse.next();
    return NextResponse.json({ error: "Not authenticated" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  const isPublicPage = PUBLIC_PAGES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (isPublicPage) return NextResponse.next();

  let signedIn = false;
  try {
    signedIn = !!(await validateSession(token));
  } catch {
    // The database is unreachable: fail closed rather than showing the app to an unverified visitor.
    return new NextResponse("The service is temporarily unavailable. Please try again shortly.", { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "30" } });
  }
  if (signedIn) return NextResponse.next();

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
