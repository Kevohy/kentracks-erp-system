import { ApiError, handle, json } from "@/server/crm/http";
import { readSessionToken, validateSession } from "@/server/auth/session";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Who is signed in. Never returns anything beyond display details. */
export const GET = (req: Request) =>
  handle(async () => {
    const user = await validateSession(readSessionToken(req.headers));
    if (!user) throw new ApiError(401, "Not authenticated");
    return json({ fullName: user.fullName, email: user.email, company: user.tenantName });
  });
