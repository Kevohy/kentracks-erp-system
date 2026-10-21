/**
 * GPS platform access tokens (API doc 2.1), for Kentracks and iTrack. Each company enters only an account and password
 * per platform in Settings → GPS Platforms. Runs a FAKE GPSPlatform on CRM_TEST_FAKE_GPS_PORT that checks the signature exactly as
 * documented (md5(md5(password) + time)) and talks to ERP servers started with:
 *
 *   CRM_TEST_BASE_URL       the normal test server (GPS_API_URL not set: the real address from the API doc)  [required]
 *   CRM_TEST_GPS_URL        GPS_API_URL=http://127.0.0.1:<fake port>
 *   CRM_TEST_GPS_DOWN_URL   GPS_API_URL pointing at a closed port
 *   CRM_TEST_UNAUTH_URL     no session                                                                        [optional]
 *
 * All servers share one database, so a session from one works on all of them. Company B (CRM_TEST_OTHER_*) checks
 * that each company has its own GPSPlatform account.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { after, before, describe, it } from "node:test";

const A = process.env.CRM_TEST_BASE_URL!;
const GPS = process.env.CRM_TEST_GPS_URL;
const DOWN = process.env.CRM_TEST_GPS_DOWN_URL;
const UNAUTH = process.env.CRM_TEST_UNAUTH_URL;
const PORT = Number(process.env.CRM_TEST_FAKE_GPS_PORT || 3998);
const PASSWORD = "Abc@34590";
if (!A) throw new Error("Set CRM_TEST_BASE_URL");

const md5 = (s: string) => createHash("md5").update(s).digest("hex");
// Fresh account names each run: the ERP server keeps a token per account between runs (as it should).
const run = Date.now().toString(36);
const TEST = `test-${run}`;
const SHORT = `short-${run}`;

async function login(email?: string, password?: string): Promise<string | undefined> {
  if (!email || !password) return undefined;
  const res = await fetch(`${A}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
  const c = res.headers.getSetCookie().find((x) => x.startsWith("kt_session="));
  if (!res.ok || !c) throw new Error(`login failed for ${email}`);
  return c.split(";")[0];
}
let cookieA = "";
let cookieB: string | undefined;

// ---- fake GPSPlatform: accounts TEST and SHORT (4-second tokens), both with PASSWORD
type Call = { account: string; time: number; signature: string; ok: boolean };
const calls: Call[] = [];
let issued = 0;
const fake = createServer((req, res) => {
  const u = new URL(req.url ?? "/", "http://x");
  res.setHeader("Content-Type", "application/json");
  if (u.pathname !== "/api/authorization" || req.method !== "GET") {
    res.statusCode = 404;
    return res.end(JSON.stringify({ code: 404, message: "not found" }));
  }
  const account = u.searchParams.get("account") ?? "";
  const time = Number(u.searchParams.get("time"));
  const signature = u.searchParams.get("signature") ?? "";
  const ok = [TEST, SHORT].includes(account) && Math.abs(Date.now() / 1000 - time) < 300 && signature === md5(md5(PASSWORD) + String(time));
  calls.push({ account, time, signature, ok });
  if (!ok) return res.end(JSON.stringify({ code: 10002, message: "account or signature error" }));
  issued++;
  res.end(JSON.stringify({ code: 0, record: { access_token: `SECRET-TOKEN-${issued}`, expires_in: account === SHORT ? 4 : 7200 } }));
});

const P = "/api/settings/gps-platforms";
const list = async (base = A, cookie?: string | null) => (await req(base, "GET", P, undefined, cookie)).data as { id: string; name: string; server: string; accounts: { id: string; account: string; connected: boolean; refreshAt: string; expiresAt: string; obtainedAt: string }[] }[];
const kentracks = async (base = A, cookie?: string | null) => (await list(base, cookie)).find((p) => p.id === "kentracks")!;
const itrack = async (base = A, cookie?: string | null) => (await list(base, cookie)).find((p) => p.id === "itrack")!;
const add = (base: string, account: string, password: string, cookie?: string | null, platform = "kentracks") => req(base, "POST", `${P}/${platform}/accounts`, { account, password }, cookie);
const clear = async (cookie: string | undefined) => {
  if (!cookie) return;
  for (const p of await list(A, cookie)) for (const a of p.accounts) await req(A, "DELETE", `${P}/accounts/${a.id}`, undefined, cookie);
};

before(async () => {
  await new Promise<void>((r) => fake.listen(PORT, "127.0.0.1", r));
  cookieA = (await login(process.env.CRM_TEST_EMAIL, process.env.CRM_TEST_PASSWORD))!;
  cookieB = await login(process.env.CRM_TEST_OTHER_EMAIL, process.env.CRM_TEST_OTHER_PASSWORD);
  await clear(cookieA);
  await clear(cookieB);
});
after(async () => {
  await clear(cookieA);
  await clear(cookieB);
  fake.close();
});

/** `cookie`: null sends no session; left out, company A's. */
async function req(base: string, method: string, path: string, body?: unknown, cookie?: string | null) {
  const c = cookie === null ? undefined : (cookie ?? cookieA);
  const headers: Record<string, string> = c ? { Cookie: c } : {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  return { status: res.status, text, data: JSON.parse(text || "null") };
}
const callsFor = (account: string) => calls.filter((c) => c.account === account);
const noSecrets = (text: string) => {
  assert.ok(!text.includes("SECRET-TOKEN"), "the access token is never sent to the browser");
  assert.ok(!text.includes(PASSWORD) && !text.includes(md5(PASSWORD)), "the password (and its hash) is never sent");
  assert.ok(!/signature=|password_?md5/i.test(text), "the signed URL and the hash field are never sent");
};
let idTest = "";
let idShort = "";

describe("GPS platforms: Kentracks accounts and access tokens", () => {
  it("the signature follows the API doc example", () => {
    assert.equal(md5(md5("Abc@34590") + "1556243443"), "3844afd2c3bf68f0f3f4aa0a9ee8ee6c");
  });

  it("lists Kentracks with no accounts, on the address from the API doc", async () => {
    const r = await req(A, "GET", P);
    assert.equal(r.status, 200, r.text);
    const k = r.data.find((p: { id: string }) => p.id === "kentracks");
    assert.deepEqual([k.name, k.server, k.accounts.length], ["Kentracks", "http://api.kentracksgps.com", 0]);
  });

  it("asks only for the account and password, and checks them", async () => {
    const empty = await add(A, "", "");
    assert.equal(empty.status, 422);
    assert.ok(empty.data.errors.account && empty.data.errors.password);
    assert.equal((await req(A, "POST", `${P}/kentracks/accounts`, { account: TEST, password: "x", url: "http://evil" })).status, 422, "nothing else is accepted");
    assert.equal((await add(A, "x".repeat(65), "p")).status, 422);
    assert.equal((await add(A, TEST, "p".repeat(129))).status, 422);
    assert.equal((await req(A, "POST", `${P}/othertrack/accounts`, { account: "a", password: "b" })).status, 404, "unknown platform");
  });

  it("adds only accounts the platform accepts", { skip: !GPS }, async () => {
    const wrong = await add(GPS!, TEST, "wrong-password");
    assert.equal(wrong.status, 422);
    assert.match(wrong.data.errors.password, /Kentracks refused the sign-in \(code 10002\)/);
    noSecrets(wrong.text);
    assert.equal((await kentracks(GPS!)).accounts.length, 0, "wrong details are not saved");

    const ok = await add(GPS!, TEST, PASSWORD);
    assert.equal(ok.status, 201, ok.text);
    noSecrets(ok.text);
    assert.deepEqual([ok.data.account, ok.data.connected], [TEST, true]);
    idTest = ok.data.id;
    const c = callsFor(TEST).filter((x) => x.ok);
    assert.equal(c.length, 1);
    assert.ok(Number.isInteger(c[0].time) && Math.abs(c[0].time - Date.now() / 1000) < 60, "time is unix seconds");
    const life = Date.parse(ok.data.expiresAt) - Date.parse(ok.data.obtainedAt);
    const renew = Date.parse(ok.data.refreshAt) - Date.parse(ok.data.obtainedAt);
    assert.ok(Math.abs(life - 7200_000) < 2000, "expires after 2 hours");
    assert.ok(Math.abs(renew - 90 * 60_000) < 2000, "renewed after 90 minutes");
  });

  it("holds several accounts, and refuses the same account twice", { skip: !GPS }, async () => {
    const dupe = await add(GPS!, TEST.toUpperCase(), PASSWORD);
    assert.equal(dupe.status, 422);
    assert.match(dupe.data.errors.account, /already added/);
    const second = await add(GPS!, SHORT, PASSWORD);
    assert.equal(second.status, 201, second.text);
    idShort = second.data.id;
    const k = await kentracks(GPS!);
    assert.deepEqual(k.accounts.map((a) => a.account), [TEST, SHORT]);
    noSecrets(JSON.stringify(k));
  });

  it("reuses one token per account until it is due", { skip: !GPS }, async () => {
    const n = callsFor(TEST).length;
    await Promise.all(Array.from({ length: 6 }, () => req(GPS!, "POST", `${P}/accounts/${idTest}/test`)));
    assert.equal(callsFor(TEST).length, n, "no new token request (a new token would cancel the old one)");
    const t = await req(GPS!, "POST", `${P}/accounts/${idTest}/test`);
    assert.equal(t.data.ok, true);
    noSecrets(t.text);
  });

  it("renews a short-lived token when due, sharing one request", { skip: !GPS }, async () => {
    const n = callsFor(SHORT).length;
    await new Promise((r) => setTimeout(r, 3300)); // due after 3/4 of a 4-second life
    await Promise.all(Array.from({ length: 3 }, () => req(GPS!, "POST", `${P}/accounts/${idShort}/test`)));
    assert.equal(callsFor(SHORT).length, n + 1, "renewed once, shared by the parallel callers");
  });

  it("edits an account; an empty password keeps the saved one; wrong details are not saved", { skip: !GPS }, async () => {
    assert.equal((await req(GPS!, "PUT", `${P}/accounts/${idTest}`, { account: TEST, password: "" })).status, 200);
    const bad = await req(GPS!, "PUT", `${P}/accounts/${idTest}`, { account: TEST, password: "nope" });
    assert.equal(bad.status, 422);
    assert.match(bad.data.errors.password, /refused/);
    const taken = await req(GPS!, "PUT", `${P}/accounts/${idTest}`, { account: SHORT, password: "" });
    assert.equal(taken.status, 422, "cannot rename onto another saved account");
    assert.equal((await kentracks(GPS!)).accounts.find((a) => a.id === idTest)!.account, TEST);
  });

  it("each company has its own accounts", { skip: !GPS || !cookieB }, async () => {
    assert.equal((await kentracks(GPS!, cookieB)).accounts.length, 0, "company B does not see company A's accounts");
    for (const [m, path] of [["POST", `${P}/accounts/${idTest}/test`], ["PUT", `${P}/accounts/${idTest}`], ["DELETE", `${P}/accounts/${idTest}`]] as const) {
      const r = await req(GPS!, m, path, m === "PUT" ? { account: "x", password: "" } : undefined, cookieB);
      assert.equal(r.status, 404, `${m} ${path}`);
    }
    assert.equal((await kentracks(GPS!)).accounts.length, 2, "untouched by company B");
  });

  it("does not add when the platform cannot be reached", { skip: !DOWN }, async () => {
    const r = await add(DOWN!, `down-${run}`, PASSWORD);
    assert.equal(r.status, 422);
    assert.match(r.data.errors.form, /Could not reach Kentracks.*not saved/);
    noSecrets(r.text);
  });

  it("removes an account", { skip: !GPS }, async () => {
    assert.equal((await req(GPS!, "DELETE", `${P}/accounts/${idShort}`)).status, 200);
    assert.equal((await req(GPS!, "DELETE", `${P}/accounts/${idShort}`)).status, 404);
    assert.deepEqual((await kentracks(GPS!)).accounts.map((a) => a.account), [TEST]);
  });

  it("lists iTrack on the address from its API doc", async () => {
    const t = await itrack();
    assert.deepEqual([t.name, t.server, t.accounts.length], ["iTrack", "http://api.itrack.top", 0]);
    assert.deepEqual((await list()).map((p) => p.id), ["kentracks", "itrack"]);
  });

  it("iTrack accounts are separate from Kentracks accounts", { skip: !GPS }, async () => {
    const wrong = await add(GPS!, TEST, "wrong-password", undefined, "itrack");
    assert.equal(wrong.status, 422);
    assert.match(wrong.data.errors.password, /iTrack refused the sign-in \(code 10002\)/);
    noSecrets(wrong.text);
    const n = callsFor(TEST).filter((x) => x.ok).length;
    const ok = await add(GPS!, TEST, PASSWORD, undefined, "itrack");
    assert.equal(ok.status, 201, "the same account name may exist on both platforms");
    assert.deepEqual([ok.data.platform, ok.data.connected], ["itrack", true]);
    assert.equal(callsFor(TEST).filter((x) => x.ok).length, n + 1, "its own token, not the Kentracks one");
    noSecrets(ok.text);
    assert.equal((await add(GPS!, TEST, PASSWORD, undefined, "itrack")).status, 422, "but not twice on iTrack");
    assert.deepEqual((await itrack(GPS!)).accounts.map((a) => a.account), [TEST]);
    assert.deepEqual((await kentracks(GPS!)).accounts.map((a) => a.account), [TEST], "Kentracks unchanged");
    assert.equal((await itrack(GPS!, cookieB)).accounts.length, 0, "company B sees none");
    assert.equal((await req(GPS!, "DELETE", `${P}/accounts/${ok.data.id}`)).status, 200);
    assert.equal((await itrack(GPS!)).accounts.length, 0);
  });

  it("iTrack: a clear message when it cannot be reached", { skip: !DOWN }, async () => {
    const r = await add(DOWN!, `down-${run}`, PASSWORD, undefined, "itrack");
    assert.equal(r.status, 422);
    assert.match(r.data.errors.form, /Could not reach iTrack.*not saved/);
  });

  it("needs a session", { skip: !UNAUTH }, async () => {
    for (const [m, path] of [["GET", P], ["POST", `${P}/kentracks/accounts`], ["PUT", `${P}/accounts/${idTest || "x"}`], ["DELETE", `${P}/accounts/${idTest || "x"}`], ["POST", `${P}/accounts/${idTest || "x"}/test`]] as const) {
      assert.equal((await req(UNAUTH!, m, path, m === "GET" || m === "DELETE" ? undefined : { account: "a", password: "b" }, null)).status, 401, `${m} ${path}`);
    }
  });
});
