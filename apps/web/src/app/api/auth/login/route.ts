import { safeNextPath } from "@/lib/auth-redirect";
import { handle, readJsonObject } from "@/server/crm/http";
import { assertSameOrigin, jsonWithCookies } from "@/server/auth/http";
import { readLoginInput, signIn } from "@/server/auth/login";
import { destroySession, readSessionToken, sessionCookie } from "@/server/auth/session";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = (req: Request) =>
  handle(async () => {
    assertSameOrigin(req);
    const body = await readJsonObject(req, 4096);
    const input = readLoginInput(body);
    const { token, deviceCookie, user } = await signIn(req, input);
    // A new session replaces whatever cookie the browser arrived with.
    await destroySession(readSessionToken(req.headers));
    return jsonWithCookies({ user, redirectTo: safeNextPath(body.next) }, 200, [sessionCookie(req, token, input.remember), deviceCookie]);
  });
