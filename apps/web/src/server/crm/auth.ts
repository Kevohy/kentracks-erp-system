import "server-only";
import { readSessionToken, validateSession } from "../auth/session";
import { setScopeTenant } from "./db-scope";
import { ApiError } from "./http";

export type AuthContext = { tenantId: string; userId: string; role?: "admin" | "staff" };

/**
 * The single place that decides who is calling and which company they belong to.
 * The company (tenant) comes ONLY from the signed-in user's server-side session. No request header, query
 * string or body field can choose or override it. Without a valid session every API request gets 401.
 */
export async function getAuthContext(req: Request): Promise<AuthContext> {
  const user = await validateSession(readSessionToken(req.headers));
  if (!user) throw new ApiError(401, "Not authenticated");
  // From here on the database shows this request only the user's company (row-level security, db-scope.ts).
  setScopeTenant(user.tenantId);
  return { tenantId: user.tenantId, userId: user.userId, role: user.role };
}

/**
 * Administrator-only actions: Settings, GPS platform logins, and anything that spends money (airtime, SMS).
 * Staff get a clear 403. A context without a role (internal jobs) is not a signed-in staff member and is allowed.
 */
export function requireAdmin(ctx: AuthContext, what: string): void {
  if (ctx.role === "staff") throw new ApiError(403, `Only an administrator can ${what}. Ask an administrator to do it, or to make you an administrator.`);
}
