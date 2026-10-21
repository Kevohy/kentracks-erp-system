import "server-only";
import { eq, sql } from "drizzle-orm";
import { getDb } from "../crm/db";
import { ApiError } from "../crm/http";
import { BAD_CREDENTIALS, validateLogin } from "@/lib/auth-validation";
import { dummyHash, hashPassword, needsRehash, verifyPassword } from "./password";
import { beginAttempt, clearAttempts, clientIp, purgeOldAttempts } from "./rate-limit";
import { createSession, purgeExpiredSessions } from "./session";
import { users } from "./schema";

export type LoginInput = { email: string; password: string; remember: boolean };

export function readLoginInput(body: Record<string, unknown>): LoginInput {
  if (body.remember !== undefined && typeof body.remember !== "boolean") throw new ApiError(400, "Invalid request");
  const email = typeof body.email === "string" ? body.email : "";
  const password = typeof body.password === "string" ? body.password : "";
  const errors = validateLogin(email, password);
  if (errors.email || errors.password) throw new ApiError(422, "Check the highlighted fields.", errors as Record<string, string>);
  return { email: email.trim().toLowerCase(), password, remember: body.remember === true };
}

/**
 * Checks the credentials against the users table and, only if they are right, creates a server-side session.
 * Returns the cookie value. Throws ApiError 401 (generic) or 429 (too many attempts).
 */
export async function signIn(req: Request, input: LoginInput): Promise<{ token: string; user: { fullName: string; email: string } }> {
  const attempt = await beginAttempt(input.email, clientIp(req));
  if (!attempt.allowed) {
    const minutes = Math.ceil(attempt.retryAfterSeconds / 60);
    throw new ApiError(429, `Too many sign-in attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`, undefined, attempt.retryAfterSeconds);
  }
  const db = getDb();
  const [user] = await db.select().from(users).where(sql`lower(${users.email}) = ${input.email}`).limit(1);
  // Unknown accounts still pay for a hash, so response time does not reveal which emails exist.
  const ok = await verifyPassword(input.password, user?.passwordHash ?? (await dummyHash()));
  if (!user || !ok || !user.isActive) throw new ApiError(401, BAD_CREDENTIALS);

  await clearAttempts(attempt.ids);
  const set: { lastLoginAt: Date; updatedAt: Date; passwordHash?: string } = { lastLoginAt: new Date(), updatedAt: new Date() };
  if (needsRehash(user.passwordHash)) set.passwordHash = await hashPassword(input.password);
  await db.update(users).set(set).where(eq(users.id, user.id));
  const token = await createSession(user.id, input.remember, req.headers.get("user-agent"));
  // Housekeeping, off the request's critical path and never allowed to fail it.
  void Promise.all([purgeExpiredSessions(), purgeOldAttempts()]).catch(() => {});
  return { token, user: { fullName: user.fullName, email: user.email } };
}
