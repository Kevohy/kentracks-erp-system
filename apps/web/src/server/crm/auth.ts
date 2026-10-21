import "server-only";
import { readSessionToken, validateSession } from "../auth/session";
import { ApiError } from "./http";

export type AuthContext = { tenantId: string; userId: string };

/**
 * The single place that decides who is calling and which company they belong to.
 * The company (tenant) comes ONLY from the signed-in user's server-side session. No request header, query
 * string or body field can choose or override it. Without a valid session every API request gets 401.
 */
export async function getAuthContext(req: Request): Promise<AuthContext> {
  const user = await validateSession(readSessionToken(req.headers));
  if (!user) throw new ApiError(401, "Not authenticated");
  return { tenantId: user.tenantId, userId: user.userId };
}
