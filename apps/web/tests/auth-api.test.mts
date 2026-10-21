/**
 * Integration tests for authentication: sign-in, sessions, logout, expiry, rate limiting, route protection and tenant
 * isolation from the session. They need a running server and a migrated LOCAL database (see tests/README.md):
 *
 *   CRM_TEST_BASE_URL        a server (no special environment needed)                       [required]
 *   DATABASE_URL             the same database the server uses (the tests create and remove their own tenants/users)
 *   CRM_TEST_BYPASS_URL      server started with the OLD CRM_DEV_AUTH=1 / CRM_DEV_TENANT_ID variables: must still answer 401  [optional]
 *   CRM_TEST_BROKEN_DB_URL   server whose database cannot be reached: must fail closed with safe messages                    [optional]
 */
import assert from "node:assert/strict";
import { createHash, randomBytes, scryptSync } from "node:crypto";
import { execFileSync } from "node:child_process";
import { after, before, describe, it } from "node:test";
import pg from "pg";
import { hashPassword } from "../src/server/auth/password.ts";
import { freshEmail, freshPhone } from "./contacts.mts";

const BASE = process.env.CRM_TEST_BASE_URL;
const DB = process.env.DATABASE_URL;
const BYPASS = process.env.CRM_TEST_BYPASS_URL;
const BROKEN = process.env.CRM_TEST_BROKEN_DB_URL;
if (!BASE || !DB) throw new Error("Set CRM_TEST_BASE_URL and DATABASE_URL (see tests/README.md)");

const run = randomBytes(4).toString("hex");
const db = new pg.Client({ connectionString: DB });
const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

type Res = { status: number; data: Json; text: string; headers: Headers; setCookie: string[] };
async function http(base: string, method: string, path: string, opts: { body?: unknown; raw?: string; headers?: Record<string, string>; cookie?: string } = {}): Promise<Res> {
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  if (opts.cookie) headers.Cookie = opts.cookie;
  if (opts.body !== undefined || opts.raw !== undefined) headers["Content-Type"] ??= "application/json";
  const res = await fetch(base + path, { method, headers, redirect: "manual", body: opts.raw ?? (opts.body === undefined ? undefined : JSON.stringify(opts.body)) });
  const text = await res.text();
  let data: Json = null as unknown as Json;
  try { data = text ? JSON.parse(text) : null; } catch { /* not json */ }
  return { status: res.status, data, text, headers: res.headers, setCookie: res.headers.getSetCookie() };
}
const api = (m: string, p: string, cookie?: string, body?: unknown, headers?: Record<string, string>) => http(BASE!, m, p, { cookie, body, headers });
const cookieOf = (r: Res) => {
  const c = r.setCookie.find((x) => x.startsWith("kt_session="));
  return c ? c.split(";")[0] : undefined;
};
const tokenOf = (cookie: string) => cookie.slice("kt_session=".length);
const login = (email: string, password: string, extra: Record<string, unknown> = {}, headers?: Record<string, string>) =>
  http(BASE!, "POST", "/api/auth/login", { body: { email, password, ...extra }, headers });
async function signIn(email: string, password: string, extra: Record<string, unknown> = {}) {
  const r = await login(email, password, extra);
  assert.equal(r.status, 200, `sign-in failed: ${r.text}`);
  return cookieOf(r)!;
}
const sessionRow = async (cookie: string) => (await db.query("select * from sessions where token_hash = $1", [sha256(tokenOf(cookie))])).rows[0];

const tenants: string[] = [];
const userIds: string[] = [];
async function makeUser(tenantId: string, tag: string, password: string) {
  const email = `auth-${run}-${tag}@example.test`;
  const r = await db.query("insert into users (tenant_id, email, full_name, password_hash) values ($1,$2,$3,$4) returning id", [tenantId, email, `Auth ${tag}`, await hashPassword(password)]);
  userIds.push(r.rows[0].id);
  return { id: r.rows[0].id as string, email, password };
}

let A: { id: string; email: string; password: string }, B: typeof A, tenantA: string, tenantB: string;
const customerIds: string[] = [];

before(async () => {
  await db.connect();
  for (const t of ["A", "B"]) tenants.push((await db.query("insert into tenants (name) values ($1) returning id", [`Auth test ${t} ${run}`])).rows[0].id);
  [tenantA, tenantB] = tenants;
  A = await makeUser(tenantA, "a", "alpha long password 1");
  B = await makeUser(tenantB, "b", "bravo long password 2");
});
after(async () => {
  if (customerIds.length) await db.query("delete from customers where id = any($1)", [customerIds]);
  await db.query("delete from login_attempts where created_at > now() - interval '1 day' and key_hash = any($1)", [[A.email, B.email].map(sha256)]).catch(() => {});
  await db.query("delete from users where id = any($1)", [userIds]); // sessions go with them
  await db.query("delete from brands where tenant_id = any($1)", [tenants]); // each company gets default brands
  await db.query("delete from tenants where id = any($1)", [tenants]);
  await db.end();
});

describe("public pages and route protection", () => {
  it("serves the sign-in and forgot-password pages without a session", async () => {
    const l = await http(BASE, "GET", "/login");
    assert.equal(l.status, 200);
    assert.match(l.text, /Sign in/); assert.match(l.text, /Forgot password\?/); assert.match(l.text, /Remember me/);
    const f = await http(BASE, "GET", "/forgot-password");
    assert.equal(f.status, 200); assert.match(f.text, /administrator/i);
    assert.doesNotMatch(f.text, /<input/i, "no fake reset form");
  });
  it("redirects every app page to /login, remembering where the visitor was going", async () => {
    const root = await http(BASE, "GET", "/");
    assert.equal(root.status, 307); assert.equal(new URL(root.headers.get("location")!, BASE).pathname + new URL(root.headers.get("location")!, BASE).search, "/login");
    for (const p of ["/crm/customers", "/crm/suppliers", "/crm/technicians", "/inventory/products", "/inventory/purchases", "/inventory/dashboard", "/sales", "/sales/package", "/settings/packages", "/billing/iot-sim"]) {
      const r = await http(BASE, "GET", p);
      assert.equal(r.status, 307, p);
      const loc = new URL(r.headers.get("location")!, BASE);
      assert.equal(loc.pathname, "/login", p); assert.equal(loc.searchParams.get("next"), p, p);
    }
    const q = await http(BASE, "GET", "/crm/customers?search=xy&a=1");
    assert.equal(new URL(q.headers.get("location")!, BASE).searchParams.get("next"), "/crm/customers?search=xy&a=1");
    assert.equal(q.headers.get("cache-control"), "no-store");
  });
  const apis: [string, string][] = [
    ["GET", "/api/crm/customers"], ["POST", "/api/crm/customers"], ["GET", "/api/crm/customers/00000000-0000-4000-8000-000000000000"], ["PUT", "/api/crm/customers/00000000-0000-4000-8000-000000000000"], ["DELETE", "/api/crm/customers/00000000-0000-4000-8000-000000000000"],
    ["GET", "/api/crm/suppliers"], ["POST", "/api/crm/suppliers"], ["PUT", "/api/crm/suppliers/00000000-0000-4000-8000-000000000000"], ["DELETE", "/api/crm/suppliers/00000000-0000-4000-8000-000000000000"],
    ["GET", "/api/crm/technicians"], ["POST", "/api/crm/technicians"], ["PUT", "/api/crm/technicians/00000000-0000-4000-8000-000000000000"], ["DELETE", "/api/crm/technicians/00000000-0000-4000-8000-000000000000"],
    ["GET", "/api/inventory/categories"], ["POST", "/api/inventory/categories"], ["GET", "/api/inventory/products"], ["POST", "/api/inventory/products"],
    ["GET", "/api/inventory/sim-cards"], ["POST", "/api/inventory/sim-cards"], ["GET", "/api/inventory/platforms"], ["POST", "/api/inventory/platforms"], ["GET", "/api/inventory/stock"],
    ["GET", "/api/purchases"], ["POST", "/api/purchases"], ["GET", "/api/purchases/00000000-0000-4000-8000-000000000000"],
    ["GET", "/api/sales"], ["POST", "/api/sales"], ["GET", "/api/sales/00000000-0000-4000-8000-000000000000"],
    ["GET", "/api/settings/packages"], ["POST", "/api/settings/packages"], ["PUT", "/api/settings/packages/00000000-0000-4000-8000-000000000000"],
    ["GET", "/api/auth/session"],
  ];
  it(`answers 401 on all ${apis.length} protected endpoints with no cookie`, async () => {
    for (const [m, p] of apis) {
      const r = await api(m, p, undefined, m === "GET" || m === "DELETE" ? undefined : {});
      assert.equal(r.status, 401, `${m} ${p}`);
      assert.deepEqual(r.data, { error: "Not authenticated" });
    }
  });
  it("answers 401 for forged, malformed, expired-looking and wrong-name cookies", async () => {
    for (const c of [`kt_session=${randomBytes(32).toString("base64url")}`, "kt_session=abc", "kt_session=", "kt_session=' OR 1=1 --", `kt_session=${"A".repeat(500)}`, `session=${randomBytes(32).toString("base64url")}`]) {
      for (const p of ["/api/crm/customers", "/api/auth/session", "/api/inventory/stock", "/api/sales"]) {
        assert.equal((await api("GET", p, c)).status, 401, `${c.slice(0, 30)} ${p}`);
      }
      const page = await http(BASE, "GET", "/crm/customers", { cookie: c });
      assert.equal(page.status, 307, "pages redirect too");
    }
  });
  it("a forged cookie on a page is cleared on the way to /login", async () => {
    const r = await http(BASE, "GET", "/sales", { cookie: `kt_session=${randomBytes(32).toString("base64url")}` });
    assert.equal(r.status, 307);
    assert.ok(r.setCookie.some((c) => /^kt_session=;/.test(c) && /Max-Age=0/i.test(c)));
  });
  it("ignores the old development bypass variables", { skip: !BYPASS }, async () => {
    assert.equal((await http(BYPASS!, "GET", "/api/crm/customers")).status, 401);
    assert.equal((await http(BYPASS!, "GET", "/api/sales")).status, 401);
    assert.equal((await http(BYPASS!, "GET", "/")).status, 307);
  });
});

describe("sign-in", () => {
  it("rejects bad requests before touching credentials", async () => {
    let r = await login("", ""); assert.equal(r.status, 422); assert.ok(r.data.errors.email && r.data.errors.password);
    r = await login("not-an-email", "x"); assert.equal(r.status, 422); assert.ok(r.data.errors.email); assert.equal(r.data.errors.password, undefined);
    r = await login(A.email, ""); assert.equal(r.status, 422); assert.ok(r.data.errors.password);
    r = await login("a".repeat(300) + "@x.test", "x"); assert.equal(r.status, 422);
    r = await login(A.email, "p".repeat(5000)); assert.equal(r.status, 413 === r.status ? 413 : 422);
    r = await http(BASE, "POST", "/api/auth/login", { body: { email: 5, password: {} } }); assert.equal(r.status, 422);
    r = await http(BASE, "POST", "/api/auth/login", { body: { email: A.email, password: "x", remember: "yes" } }); assert.equal(r.status, 400);
    r = await http(BASE, "POST", "/api/auth/login", { raw: "{nope" }); assert.equal(r.status, 400);
    r = await http(BASE, "POST", "/api/auth/login", { raw: JSON.stringify([1]) }); assert.equal(r.status, 400);
    r = await http(BASE, "POST", "/api/auth/login", { raw: `email=${A.email}&password=x`, headers: { "Content-Type": "application/x-www-form-urlencoded" } }); assert.equal(r.status, 415);
    r = await http(BASE, "POST", "/api/auth/login", { raw: JSON.stringify({ email: A.email, password: "x", pad: "y".repeat(6000) }) }); assert.equal(r.status, 413);
    r = await http(BASE, "GET", "/api/auth/login"); assert.equal(r.status, 405);
    assert.equal(cookieOf(r), undefined);
  });
  it("blocks cross-site sign-in and logout attempts (CSRF)", async () => {
    let r = await login(A.email, A.password, {}, { Origin: "https://evil.example" }); assert.equal(r.status, 403); assert.equal(cookieOf(r), undefined);
    r = await login(A.email, A.password, {}, { "Sec-Fetch-Site": "cross-site" }); assert.equal(r.status, 403);
    r = await http(BASE, "POST", "/api/auth/logout", { headers: { Origin: "https://evil.example" } }); assert.equal(r.status, 403);
    r = await login(A.email, A.password, {}, { Origin: new URL(BASE!).origin }); assert.equal(r.status, 200, "same-origin is fine");
  });
  it("gives wrong password, unknown email and disabled account the same answer", async () => {
    const bad = await login(A.email, "totally wrong password");
    const unknown = await login(`nobody-${run}@example.test`, "totally wrong password");
    assert.equal(bad.status, 401); assert.equal(unknown.status, 401);
    assert.deepEqual(bad.data, unknown.data); assert.equal(bad.data.error, "Incorrect email or password.");
    assert.equal(cookieOf(bad), undefined); assert.equal(cookieOf(unknown), undefined);
  });
  it("spends real hashing time on unknown emails too (no timing tell)", async () => {
    await login(`warm-${run}@example.test`, "warm up the dummy hash");
    const t0 = performance.now(); await login(`nobody2-${run}@example.test`, "wrong password here"); const unknownMs = performance.now() - t0;
    const t1 = performance.now(); await login(B.email, "wrong password here"); const wrongMs = performance.now() - t1;
    assert.ok(unknownMs > 30, `unknown email answered in ${unknownMs.toFixed(0)}ms - too fast, hashing skipped?`);
    assert.ok(Math.abs(unknownMs - wrongMs) < Math.max(unknownMs, wrongMs) * 0.8 + 50, `timing differs: unknown ${unknownMs.toFixed(0)}ms vs wrong ${wrongMs.toFixed(0)}ms`);
    await db.query("delete from login_attempts where key_hash = $1", [sha256(B.email)]);
  });
  it("signs in with the right credentials and sets a locked-down session cookie", async () => {
    const r = await login(A.email, A.password);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("cache-control"), "no-store");
    assert.deepEqual(r.data, { user: { fullName: "Auth a", email: A.email }, redirectTo: "/" });
    assert.ok(!/password|scrypt|hash/i.test(r.text.replace(/passwordless/gi, "")), "nothing secret in the response");
    const sc = r.setCookie.find((c) => c.startsWith("kt_session="))!;
    assert.match(sc, /HttpOnly/i); assert.match(sc, /SameSite=Lax/i); assert.match(sc, /Path=\//i);
    assert.doesNotMatch(sc, /Max-Age|Expires/i, "no Remember me -> a session cookie that ends with the browser");
    assert.doesNotMatch(sc, /Secure/i, "plain-http localhost: Secure would make browsers drop it");
    assert.match(tokenOf(sc.split(";")[0]), /^[A-Za-z0-9_-]{43}$/, "256-bit random token");
    const cookie = sc.split(";")[0];
    const row = await sessionRow(cookie);
    assert.ok(row, "session stored on the server");
    assert.notEqual(row.token_hash, tokenOf(cookie), "only a hash of the token is stored");
    assert.equal(row.remember, false);
    const hrs = (new Date(row.expires_at).getTime() - Date.now()) / 3.6e6; assert.ok(hrs > 11.9 && hrs <= 12.01, `12h absolute limit, got ${hrs}`);
    const stored = (await db.query("select password_hash, last_login_at from users where id=$1", [A.id])).rows[0];
    assert.match(stored.password_hash, /^scrypt\$65536\$8\$2\$/); assert.ok(!stored.password_hash.includes(A.password)); assert.ok(stored.last_login_at);
  });
  it("marks the cookie Secure when the site is served over https (behind a proxy)", async () => {
    const h = { "x-forwarded-host": "erp.example.com", "x-forwarded-proto": "https", Origin: "https://erp.example.com" };
    const r = await login(A.email, A.password, {}, h);
    assert.equal(r.status, 200);
    assert.match(r.setCookie.find((c) => c.startsWith("kt_session="))!, /; Secure/i);
    const out = await http(BASE, "POST", "/api/auth/logout", { headers: h, cookie: cookieOf(r)! });
    assert.match(out.setCookie[0], /; Secure/i, "the clearing cookie matches");
  });
  it("Remember me gives a persistent 30-day cookie and a 30-day session", async () => {
    const r = await login(A.email, A.password, { remember: true });
    const sc = r.setCookie.find((c) => c.startsWith("kt_session="))!;
    assert.match(sc, /Max-Age=2592000/);
    const row = await sessionRow(sc.split(";")[0]);
    assert.equal(row.remember, true);
    const days = (new Date(row.expires_at).getTime() - Date.now()) / 8.64e7; assert.ok(days > 29.9 && days <= 30.01);
  });
  it("treats the email case-insensitively and ignores surrounding spaces", async () => {
    const r = await login(`  ${A.email.toUpperCase()} `, A.password); assert.equal(r.status, 200);
  });
  it("returns only a safe in-app redirect target", async () => {
    const ok = await login(A.email, A.password, { next: "/crm/customers?x=1" }); assert.equal(ok.data.redirectTo, "/crm/customers?x=1");
    for (const bad of ["//evil.example", "https://evil.example", "/\\evil.example", "javascript:alert(1)", "/api/crm/customers", "/login", "/login?next=/", "/forgot-password", "/_next/static/x", "/a b", "/a\nb", "", 5, null, "/" + "x".repeat(3000)]) {
      const r = await login(A.email, A.password, { next: bad }); assert.equal(r.data.redirectTo, "/", JSON.stringify(bad).slice(0, 40));
    }
  });
  it("replaces an existing session on sign-in (no session fixation)", async () => {
    const old = await signIn(A.email, A.password);
    const r = await http(BASE, "POST", "/api/auth/login", { body: { email: A.email, password: A.password }, cookie: old });
    const fresh = cookieOf(r)!;
    assert.notEqual(fresh, old);
    assert.equal(await sessionRow(old), undefined, "old session deleted");
    assert.ok(await sessionRow(fresh));
  });
  it("upgrades an older password hash to the current parameters on sign-in", async () => {
    const u = await makeUser(tenantA, "old", "legacy hash password 1");
    const salt = randomBytes(16);
    const weak = `scrypt$16384$8$1$${salt.toString("base64")}$${scryptSync(u.password.normalize("NFKC"), salt, 32, { N: 16384, r: 8, p: 1 }).toString("base64")}`;
    await db.query("update users set password_hash=$2 where id=$1", [u.id, weak]);
    assert.equal((await login(u.email, u.password)).status, 200, "old-parameter hash still verifies");
    assert.match((await db.query("select password_hash from users where id=$1", [u.id])).rows[0].password_hash, /^scrypt\$65536\$8\$2\$/);
  });
});

describe("authenticated access and company isolation", () => {
  it("lets a signed-in user use the app APIs and takes the company from the session", async () => {
    const a = await signIn(A.email, A.password);
    const me = await api("GET", "/api/auth/session", a);
    assert.deepEqual(me.data, { fullName: "Auth a", email: A.email, company: `Auth test A ${run}` });
    for (const p of ["/api/crm/customers", "/api/crm/suppliers", "/api/crm/technicians", "/api/inventory/products", "/api/inventory/stock", "/api/purchases", "/api/sales", "/api/settings/packages"]) {
      assert.equal((await api("GET", p, a)).status, 200, p);
    }
  });
  it("never lets the browser choose the company", async () => {
    const a = await signIn(A.email, A.password), b = await signIn(B.email, B.password);
    const brandA = (await api("GET", "/api/settings/brands", a)).data[0].id, brandB = (await api("GET", "/api/settings/brands", b)).data[0].id;
    const c = await api("POST", "/api/crm/customers", a, { brandId: brandA, type: "End User", firstName: "Iso", lastName: "Lation", account: `ISO-${run}`, phone: freshPhone(), email: freshEmail("iso"), location: "Nairobi" });
    assert.equal(c.status, 201, c.text); customerIds.push(c.data.id);
    const mine = await api("GET", "/api/crm/customers", a); assert.ok(mine.data.some((x: Json) => x.id === c.data.id));
    // Tenant B cannot see, read, change or delete it, whatever tenant hints it sends.
    const hints = { "x-tenant-id": tenantA, "x-forwarded-tenant": tenantA, "tenant-id": tenantA };
    for (const [path, h] of [["/api/crm/customers", hints], [`/api/crm/customers?tenantId=${tenantA}`, {}], [`/api/crm/customers?tenant_id=${tenantA}`, hints]] as const) {
      const r = await api("GET", path, b, undefined, h as Record<string, string>);
      assert.equal(r.status, 200); assert.ok(!r.data.some((x: Json) => x.id === c.data.id), `B must not see A's customer via ${path}`);
    }
    assert.equal((await api("GET", `/api/crm/customers/${c.data.id}`, b, undefined, hints)).status, 404);
    assert.equal((await api("PUT", `/api/crm/customers/${c.data.id}`, b, { type: "End User", firstName: "Hacked", lastName: "Name", account: `ISO-${run}`, phone: freshPhone(), email: freshEmail("iso"), location: "X" }, hints)).status, 404);
    assert.equal((await api("DELETE", `/api/crm/customers/${c.data.id}`, b, undefined, hints)).status, 404);
    const bodyHint = await api("POST", "/api/crm/customers", b, { brandId: brandB, type: "End User", firstName: "Body", lastName: "Hint", account: `ISO-${run}-b`, phone: freshPhone(), email: freshEmail("bh"), location: "X", tenantId: tenantA });
    if (bodyHint.status === 201) { customerIds.push(bodyHint.data.id); const row = (await db.query("select tenant_id from customers where id=$1", [bodyHint.data.id])).rows[0]; assert.equal(row.tenant_id, tenantB, "a tenantId in the body must not matter"); }
    else assert.ok(bodyHint.status >= 400 && bodyHint.status < 500);
    assert.equal(((await api("GET", `/api/crm/customers/${c.data.id}`, a)).data).firstName, "Iso", "A's record is untouched");
  });
});

describe("logout", () => {
  it("ends the session on the server, not just in the browser", async () => {
    const cookie = await signIn(A.email, A.password);
    assert.equal((await api("GET", "/api/crm/customers", cookie)).status, 200);
    const out = await http(BASE, "POST", "/api/auth/logout", { cookie });
    assert.equal(out.status, 200);
    const cleared = out.setCookie.find((c) => c.startsWith("kt_session="))!;
    assert.match(cleared, /^kt_session=;/); assert.match(cleared, /Max-Age=0/i); assert.match(cleared, /HttpOnly/i);
    assert.equal(await sessionRow(cookie), undefined, "session row deleted");
    // Replaying the stolen/old cookie after logout must fail everywhere.
    assert.equal((await api("GET", "/api/crm/customers", cookie)).status, 401);
    assert.equal((await api("GET", "/api/auth/session", cookie)).status, 401);
    assert.equal((await http(BASE, "GET", "/crm/customers", { cookie })).status, 307);
  });
  it("is safe to call without a session or twice", async () => {
    assert.equal((await http(BASE, "POST", "/api/auth/logout")).status, 200);
    const cookie = await signIn(A.email, A.password);
    assert.equal((await http(BASE, "POST", "/api/auth/logout", { cookie })).status, 200);
    assert.equal((await http(BASE, "POST", "/api/auth/logout", { cookie })).status, 200);
  });
  it("only ends the session it was called with", async () => {
    const one = await signIn(A.email, A.password), two = await signIn(A.email, A.password);
    await http(BASE, "POST", "/api/auth/logout", { cookie: one });
    assert.equal((await api("GET", "/api/auth/session", one)).status, 401);
    assert.equal((await api("GET", "/api/auth/session", two)).status, 200);
  });
});

describe("session expiry", () => {
  const age = (cookie: string, set: string) => db.query(`update sessions set ${set} where token_hash = $1`, [sha256(tokenOf(cookie))]);
  it("stops working at the absolute expiry and the stale row is removed", async () => {
    const cookie = await signIn(A.email, A.password);
    await age(cookie, "expires_at = now() - interval '1 second'");
    assert.equal((await api("GET", "/api/crm/customers", cookie)).status, 401);
    assert.equal(await sessionRow(cookie), undefined);
  });
  it("stops working after being idle too long (4 h normal, 14 days with Remember me)", async () => {
    const normal = await signIn(A.email, A.password), remembered = await signIn(A.email, A.password, { remember: true });
    await age(normal, "last_seen_at = now() - interval '3 hours'"); assert.equal((await api("GET", "/api/auth/session", normal)).status, 200, "3 h idle is fine");
    await age(normal, "last_seen_at = now() - interval '5 hours'"); assert.equal((await api("GET", "/api/auth/session", normal)).status, 401, "5 h idle ends it");
    await age(remembered, "last_seen_at = now() - interval '5 days'"); assert.equal((await api("GET", "/api/auth/session", remembered)).status, 200);
    await age(remembered, "last_seen_at = now() - interval '15 days'"); assert.equal((await api("GET", "/api/auth/session", remembered)).status, 401);
  });
  it("a Remember-me session still ends at 30 days even if used daily", async () => {
    const c = await signIn(A.email, A.password, { remember: true });
    await age(c, "expires_at = now() - interval '1 minute', last_seen_at = now()");
    assert.equal((await api("GET", "/api/auth/session", c)).status, 401);
  });
  it("refreshes last-seen while the session is in use (sliding idle timeout)", async () => {
    const c = await signIn(A.email, A.password);
    await age(c, "last_seen_at = now() - interval '10 minutes'");
    await api("GET", "/api/auth/session", c);
    const row = await sessionRow(c);
    assert.ok(Date.now() - new Date(row.last_seen_at).getTime() < 60_000, "touched");
  });
  it("sends an expired visitor to /login with the page they wanted, and clears the dead cookie", async () => {
    const c = await signIn(A.email, A.password);
    await age(c, "expires_at = now() - interval '1 second'");
    const r = await http(BASE, "GET", "/inventory/products", { cookie: c });
    assert.equal(r.status, 307);
    assert.equal(new URL(r.headers.get("location")!, BASE).searchParams.get("next"), "/inventory/products");
    assert.ok(r.setCookie.some((x) => /Max-Age=0/i.test(x)));
  });
  it("sends an already-signed-in user away from /login", async () => {
    const c = await signIn(A.email, A.password);
    const r = await http(BASE, "GET", "/login", { cookie: c }); assert.equal(r.status, 307); assert.equal(new URL(r.headers.get("location")!, BASE).pathname, "/");
    const n = await http(BASE, "GET", "/login?next=%2Fcrm%2Fcustomers", { cookie: c }); assert.equal(new URL(n.headers.get("location")!, BASE).pathname, "/crm/customers");
    const e = await http(BASE, "GET", "/login?next=https%3A%2F%2Fevil.example", { cookie: c }); assert.equal(new URL(e.headers.get("location")!, BASE).pathname, "/");
  });
});

describe("disabled accounts and password changes", () => {
  it("a disabled user is locked out immediately and cannot sign in", async () => {
    const u = await makeUser(tenantA, "dis", "disable me password 1");
    const c = await signIn(u.email, u.password);
    await db.query("update users set is_active=false where id=$1", [u.id]);
    assert.equal((await api("GET", "/api/crm/customers", c)).status, 401, "existing session stops at once");
    const r = await login(u.email, u.password); assert.equal(r.status, 401); assert.equal(r.data.error, "Incorrect email or password.", "same message as a wrong password");
    await db.query("update users set is_active=true where id=$1", [u.id]);
    assert.equal((await login(u.email, u.password)).status, 200);
  });
  const script = (args: string[], input: string) =>
    execFileSync("node", ["--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", "scripts/user.mts", ...args], { input, env: { ...process.env, DATABASE_URL: DB }, encoding: "utf8" });
  it("scripts/user.mts set-password changes the password and signs the user out everywhere", async () => {
    const u = await makeUser(tenantA, "pw", "first password value 1");
    const c = await signIn(u.email, u.password);
    const out = script(["set-password", "--email", u.email, "--password-stdin"], "second password value 2");
    assert.match(out, /1 session\(s\) ended/);
    assert.equal((await api("GET", "/api/auth/session", c)).status, 401);
    assert.equal((await login(u.email, "first password value 1")).status, 401);
    assert.equal((await login(u.email, "second password value 2")).status, 200);
  });
  it("scripts/user.mts disable ends sessions; enable restores sign-in", async () => {
    const u = await makeUser(tenantA, "sw", "switch password value 1");
    const c = await signIn(u.email, u.password);
    script(["disable", "--email", u.email], "");
    assert.equal((await api("GET", "/api/auth/session", c)).status, 401);
    assert.equal((await login(u.email, u.password)).status, 401);
    script(["enable", "--email", u.email], "");
    assert.equal((await login(u.email, u.password)).status, 200);
  });
  it("scripts/user.mts create makes a working account with a hashed password, and refuses weak ones", async () => {
    const email = `auth-${run}-cli@example.test`;
    script(["create", "--email", email, "--name", "Cli User", "--tenant-id", tenantB, "--password-stdin"], "a fine long password 9");
    const row = (await db.query("select id, tenant_id, password_hash from users where email=$1", [email])).rows[0]; userIds.push(row.id);
    assert.equal(row.tenant_id, tenantB); assert.match(row.password_hash, /^scrypt\$/);
    assert.equal((await login(email, "a fine long password 9")).status, 200);
    assert.throws(() => script(["create", "--email", `auth-${run}-weak@example.test`, "--name", "Weak", "--tenant-id", tenantB, "--password-stdin"], "short"), /Use at least 12/);
    assert.throws(() => script(["create", "--email", email, "--name", "Dup", "--tenant-id", tenantB, "--password-stdin"], "another long password 9"), /already exists/);
  });
});

describe("rate limiting", () => {
  it("locks an account after 8 failures, even for the right password, without revealing whether it exists", async () => {
    const u = await makeUser(tenantA, "rl", "rate limit password 1");
    for (let i = 1; i <= 8; i++) assert.equal((await login(u.email, `wrong password ${i}`)).status, 401, `attempt ${i}`);
    const blocked = await login(u.email, "wrong password 9");
    assert.equal(blocked.status, 429); assert.match(blocked.data.error, /Too many sign-in attempts. Try again in \d+ minutes?\./);
    const retry = Number(blocked.headers.get("retry-after")); assert.ok(retry > 0 && retry <= 900, `Retry-After ${retry}`);
    assert.equal((await login(u.email, u.password)).status, 429, "the right password is refused while locked");
    assert.equal(cookieOf(await login(u.email, u.password)), undefined);
    // An email that does not exist is throttled in exactly the same way.
    const ghost = `ghost-${run}@example.test`;
    for (let i = 1; i <= 8; i++) assert.equal((await login(ghost, `wrong password ${i}`)).status, 401);
    assert.equal((await login(ghost, "wrong password 9")).status, 429);
    // Another account is unaffected.
    assert.equal((await login(B.email, B.password)).status, 200);
    // The lock ends once the window has passed.
    await db.query("update login_attempts set created_at = now() - interval '16 minutes' where key_hash = any($1)", [[u.email, ghost].map(sha256)]);
    assert.equal((await login(u.email, u.password)).status, 200);
    await db.query("delete from login_attempts where key_hash = any($1)", [[u.email, ghost].map(sha256)]);
  });
  it("counts parallel guesses, so a burst cannot get around the limit", async () => {
    const u = await makeUser(tenantA, "burst", "burst password value 1");
    const rs = await Promise.all(Array.from({ length: 24 }, (_, i) => login(u.email, `guess ${i}`)));
    const through = rs.filter((r) => r.status === 401).length, blocked = rs.filter((r) => r.status === 429).length;
    assert.equal(through + blocked, 24);
    assert.ok(blocked >= 10, `only ${blocked} of 24 parallel guesses were blocked`);
    assert.ok(through <= 14, `${through} parallel guesses got a password check`);
    await db.query("delete from login_attempts where key_hash = $1", [sha256(u.email)]);
  });
  it("a successful sign-in does not leave attempt rows behind, and failures expire with the window", async () => {
    const u = await makeUser(tenantA, "clean", "clean up password 1");
    await login(u.email, "wrong password"); await login(u.email, u.password);
    assert.equal((await db.query("select count(*)::int n from login_attempts where key_hash=$1", [sha256(u.email)])).rows[0].n, 1, "only the earlier failure remains");
    await db.query("delete from login_attempts where key_hash = $1", [sha256(u.email)]);
  });
});

describe("failure behaviour", () => {
  it("fails closed with safe messages when the database is unreachable", { skip: !BROKEN }, async () => {
    const l = await http(BROKEN!, "POST", "/api/auth/login", { body: { email: A.email, password: A.password } });
    assert.ok(l.status >= 500 && l.status < 600); assert.equal(cookieOf(l), undefined);
    assert.ok(!/ECONNREFUSED|5999|postgres|password|stack|at /.test(l.text), `leaked: ${l.text}`);
    const withCookie = await http(BROKEN!, "GET", "/api/crm/customers", { cookie: `kt_session=${randomBytes(32).toString("base64url")}` });
    assert.ok(withCookie.status >= 500 && withCookie.status < 600, "no 200 with an unverifiable session");
    assert.ok(!/ECONNREFUSED|5999|postgres|stack/.test(withCookie.text));
    const page = await http(BROKEN!, "GET", "/crm/customers", { cookie: `kt_session=${randomBytes(32).toString("base64url")}` });
    assert.equal(page.status, 503, "pages are not shown to an unverified visitor");
    assert.equal((await http(BROKEN!, "GET", "/api/crm/customers")).status, 401);
    assert.equal((await http(BROKEN!, "GET", "/login")).status, 200, "the sign-in page itself still renders");
  });
});
