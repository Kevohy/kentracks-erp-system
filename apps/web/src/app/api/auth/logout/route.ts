import { handle } from "@/server/crm/http";
import { assertSameOrigin, jsonWithCookies } from "@/server/auth/http";
import { clearedSessionCookie, destroySession, readSessionToken } from "@/server/auth/session";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Ends the session on the server (the stored session is deleted, so the old cookie is worthless) and clears the cookie. Safe to call twice. */
export const POST = (req: Request) =>
  handle(async () => {
    assertSameOrigin(req);
    await destroySession(readSessionToken(req.headers));
    return jsonWithCookies({ ok: true }, 200, [clearedSessionCookie(req)]);
  });
