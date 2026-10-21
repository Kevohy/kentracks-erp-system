/**
 * Shared by the CRM and ERP API tests: signs the test users in through the real /api/auth/login endpoint and hands back
 * the session cookie for a server. The company comes from whose session it is:
 *
 *   CRM_TEST_EMAIL / CRM_TEST_PASSWORD              user of company A, used for CRM_TEST_BASE_URL
 *   CRM_TEST_OTHER_EMAIL / CRM_TEST_OTHER_PASSWORD  user of company B, used for CRM_TEST_OTHER_URL
 *
 * The UNAUTH server gets no cookie. The BROKEN-database server gets a well-formed but unknown cookie (a session cannot be
 * checked without the database, so that is how a request reaches the failure path).
 */
import { randomBytes } from "node:crypto";

type Urls = { a: string; b?: string; broken?: string };

export function makeSessions(urls: Urls) {
  const creds = new Map<string, { email: string; password: string }>();
  const add = (url: string | undefined, email: string | undefined, password: string | undefined) => {
    if (url && email && password) creds.set(url, { email, password });
  };
  add(urls.a, process.env.CRM_TEST_EMAIL, process.env.CRM_TEST_PASSWORD);
  add(urls.b, process.env.CRM_TEST_OTHER_EMAIL, process.env.CRM_TEST_OTHER_PASSWORD);
  if (!creds.has(urls.a)) throw new Error("Set CRM_TEST_EMAIL and CRM_TEST_PASSWORD: a user of the company under test (create one with `pnpm --filter web auth:user create`)");
  const cache = new Map<string, Promise<string>>();
  const forged = `kt_session=${randomBytes(32).toString("base64url")}`;

  return (base: string): Promise<string | undefined> => {
    if (base === urls.broken) return Promise.resolve(forged);
    const c = creds.get(base);
    if (!c) return Promise.resolve(undefined);
    if (!cache.has(base)) {
      cache.set(
        base,
        fetch(`${base}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(c) }).then((res) => {
          const cookie = res.headers.getSetCookie().find((x) => x.startsWith("kt_session="));
          if (!res.ok || !cookie) throw new Error(`Test sign-in failed for ${c.email} on ${base} (HTTP ${res.status})`);
          return cookie.split(";")[0];
        }),
      );
    }
    return cache.get(base)!;
  };
}
