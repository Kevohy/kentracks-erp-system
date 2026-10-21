/**
 * Kentracks API section 2, "Get device basic information by IMEIs" (GET /api/device/detail), used to verify IMEIs.
 * Runs a FAKE Kentracks on CRM_TEST_FAKE_GPS_PORT that implements the access token (section 2.1), the device
 * detail request and the account information request (GET /api/user/info, for the device owner's contact) exactly as
 * documented, including "a new token cancels the old one" and "at most 100 IMEIs".
 *
 *   CRM_TEST_BASE_URL       normal test server (signs the test users in)                      [required]
 *   CRM_TEST_GPS_URL        GPS_API_URL=http://127.0.0.1:<fake port>, GPS_MOCK=1, local database [required]
 *   CRM_TEST_GPS_DOWN_URL   GPS_API_URL pointing at a closed port                              [optional]
 *
 * Company A gets Kentracks accounts only during this file; they are removed at the end.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { after, before, describe, it } from "node:test";

const A = process.env.CRM_TEST_BASE_URL!;
const GPS = process.env.CRM_TEST_GPS_URL!;
const DOWN = process.env.CRM_TEST_GPS_DOWN_URL;
const PORT = Number(process.env.CRM_TEST_FAKE_GPS_PORT || 3998);
if (!A || !GPS) throw new Error("Set CRM_TEST_BASE_URL and CRM_TEST_GPS_URL");
const PASSWORD = "Abc@34590";
const md5 = (s: string) => createHash("md5").update(s).digest("hex");
const run = Date.now().toString(36);

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
let cookie = "";
async function login() {
  const res = await fetch(`${A}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: process.env.CRM_TEST_EMAIL, password: process.env.CRM_TEST_PASSWORD }) });
  const c = res.headers.getSetCookie().find((x) => x.startsWith("kt_session="));
  if (!res.ok || !c) throw new Error("login failed");
  return c.split(";")[0];
}
async function req(base: string, method: string, path: string, body?: unknown) {
  const res = await fetch(base + path, { method, headers: { Cookie: cookie, ...(body === undefined ? {} : { "Content-Type": "application/json" }) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  return { status: res.status, text, data: (text ? JSON.parse(text) : null) as Json };
}

/** A valid 15-digit IMEI (Luhn) built from a 14-digit base. */
function luhn(base14: string): string {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    let d = Number(base14[13 - i]);
    if (i % 2 === 0) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return base14 + ((10 - (sum % 10)) % 10);
}
let n = 0;
const newImei = () => luhn(`86${String(Date.now()).slice(-9)}${String(n++).padStart(3, "0")}`);

// ---- the devices each fake account owns
const ONE = `one-${run}`; // owns D1 (active) and D2 (expired)
const TWO = `two-${run}`; // owns D3; its first device request is refused once (token replaced elsewhere)
const ALL = `all-${run}`; // owns every IMEI asked for (billing batches)
const ITR = `itr-${run}`; // an iTrack account: owns D5 (the Kentracks accounts do not)
const D1 = newImei();
const D2 = newImei();
const D3 = newImei();
const D4 = newImei(); // owned by ONE; its owner account is not visible to ONE (account information refused)
const D5 = newImei(); // on iTrack only
const UNKNOWN = newImei();
// The device owners' account information (GET /api/user/info), per API account that may see them.
const OWNER_PHONE = `07${String(Date.now()).slice(-8)}`;
const OWNER_EMAIL = `jane.${run}@example.com`;
const ownerInfo: Record<string, Record<string, Json>> = {
  [ONE]: {
    [`cust-${run}`]: { createtime: 1562570435, mobile: OWNER_PHONE, telephone: "0201234567", contact: "Jane Wambui", roletype: 1, account: `CUST-${run}`, email: OWNER_EMAIL, blockstatus: 0, username: "jwambui", zipcode: "", remark: "" },
  },
  [ITR]: {
    [`itr-owner-${run}`]: { createtime: 1562570435, mobile: "", telephone: "", contact: "Juma Otieno", roletype: 2, account: `itr-owner-${run}`, email: `juma.${run}@example.com`, blockstatus: 1, username: "jotieno", zipcode: "", remark: "" },
  },
  [TWO]: {
    "fleet-two": { createtime: 1562570435, mobile: "", telephone: "0722000333", contact: "", roletype: 2, account: "fleet-two", email: "", blockstatus: 1, username: "Fleet Two Ltd", zipcode: "", remark: "" },
  },
};
const userInfoCalls: { by: string; account: string; ok: boolean }[] = [];
const ACTIVATED = 1760000000; // 2025-10-09 08:53 UTC = 11:53 in Nairobi
const DUE = Math.floor(Date.now() / 1000) + 200 * 86400;
const USER_DUE = DUE + 30 * 86400;
const nairobiDay = (s: number) => new Date((s + 3 * 3600) * 1000).toISOString().slice(0, 10);
const owned: Record<string, (imei: string) => Json | null> = {
  [ONE]: (i) => (i === D1
    ? { imei: D1, devicename: "Truck 7", devicetype: "VT05S", platenumber: "KDA 777Z", onlinetime: ACTIVATED + 60, platformduetime: DUE, simcard: "0712000777", iccid: "8925400000000000777", activatedtime: ACTIVATED, userduetime: USER_DUE, customeraccount: `CUST-${run}` }
    : i === D2
      ? { imei: D2, devicename: "Old van", devicetype: "", platenumber: "", onlinetime: 0, platformduetime: 1600000000, simcard: "", iccid: "", activatedtime: 0, userduetime: 0, customeraccount: "" }
      : i === D4
        ? { imei: D4, devicename: "Car 4", devicetype: "VT05S", platenumber: "KDB 444D", platformduetime: DUE, activatedtime: ACTIVATED, customeraccount: `ghost-${run}` }
        : null),
  [TWO]: (i) => (i === D3 ? { imei: D3, devicename: "Bus 3", devicetype: "GT06N", platenumber: "KBZ 333C", platformduetime: DUE, activatedtime: ACTIVATED, customeraccount: "fleet-two" } : null),
  [ITR]: (i) => (i === D5 ? { imei: D5, devicename: "Tuk 5", devicetype: "ITR-01", platenumber: "KMEA 555Q", platformduetime: DUE, activatedtime: ACTIVATED, simcard: "0712000555", customeraccount: `itr-owner-${run}` } : null),
  [ALL]: (i) => ({ imei: i, devicename: `Dev ${i.slice(-4)}`, devicetype: "BATCH-MODEL", platenumber: "", platformduetime: DUE, activatedtime: ACTIVATED, customeraccount: "" }),
};

// ---- fake Kentracks
const tokens = new Map<string, string>(); // account -> current token (a new one cancels the old one)
const detailCalls: { account: string; count: number; ok: boolean }[] = [];
const authCalls: string[] = [];
const refusedOnce = new Set<string>();
let issued = 0;
const fake = createServer((rq, res) => {
  const u = new URL(rq.url ?? "/", "http://x");
  res.setHeader("Content-Type", "application/json");
  const send = (b: unknown) => res.end(JSON.stringify(b));
  if (u.pathname === "/api/authorization") {
    const account = u.searchParams.get("account") ?? "";
    const time = u.searchParams.get("time") ?? "";
    authCalls.push(account);
    if (!(account in owned) || u.searchParams.get("signature") !== md5(md5(PASSWORD) + time)) return send({ code: 10002, message: "account or signature error" });
    const token = `TOKEN-${++issued}`;
    tokens.set(account, token);
    return send({ code: 0, record: { access_token: token, expires_in: 7200 } });
  }
  if (u.pathname === "/api/device/detail") {
    const token = u.searchParams.get("access_token") ?? "";
    const account = [...tokens.entries()].find(([, t]) => t === token)?.[0];
    const imeis = (u.searchParams.get("imeis") ?? "").split(",").filter(Boolean);
    if (!account) {
      detailCalls.push({ account: "?", count: imeis.length, ok: false });
      return send({ code: 10012, message: "access token is invalid" });
    }
    if (account === TWO && !refusedOnce.has(token) && refusedOnce.size === 0) {
      refusedOnce.add(token); // the first token of TWO is refused once, as if another login had replaced it
      tokens.delete(account);
      detailCalls.push({ account, count: imeis.length, ok: false });
      return send({ code: 10012, message: "access token is invalid" });
    }
    if (imeis.length > 100) {
      detailCalls.push({ account, count: imeis.length, ok: false });
      return send({ code: 10003, message: "too many imeis" });
    }
    detailCalls.push({ account, count: imeis.length, ok: true });
    return send({ code: 0, record: imeis.map((i) => owned[account](i)).filter(Boolean) });
  }
  if (u.pathname === "/api/user/info") {
    const token = u.searchParams.get("access_token") ?? "";
    const by = [...tokens.entries()].find(([, t]) => t === token)?.[0];
    const account = (u.searchParams.get("account") ?? "").toLowerCase();
    const rec = by ? ownerInfo[by]?.[account] : undefined;
    userInfoCalls.push({ by: by ?? "?", account, ok: !!rec });
    if (!by) return send({ code: 10012, message: "access token is invalid" });
    return send(rec ? { code: 0, record: rec } : { code: 10020, message: "no permission for this account" });
  }
  res.statusCode = 404;
  send({ code: 404 });
});

const P = "/api/settings/gps-platforms";
const accountIds: string[] = [];
async function addAccount(account: string, platform = "kentracks") {
  const r = await req(GPS, "POST", `${P}/${platform}/accounts`, { account, password: PASSWORD });
  assert.equal(r.status, 201, r.text);
  accountIds.push(r.data.id);
  return r.data.id as string;
}
async function removeAll() {
  const list = await req(A, "GET", P);
  for (const p of list.data) for (const a of p.accounts) await req(A, "DELETE", `${P}/accounts/${a.id}`);
}
const verify = (base: string, imei: string) => req(base, "GET", `/api/gps/verify?imei=${encodeURIComponent(imei)}`);
const noSecrets = (t: string) => {
  assert.ok(!/TOKEN-\d|access_token|signature|password/i.test(t), "no token, signature or password reaches the browser");
};

before(async () => {
  await new Promise<void>((r) => fake.listen(PORT, "127.0.0.1", r));
  cookie = await login();
  await removeAll();
});
after(async () => {
  await removeAll();
  fake.close();
});

describe("IMEI verification with Kentracks (API section 2)", () => {
  it("without a Kentracks account: the development mock (test machines only)", async () => {
    assert.deepEqual((await req(GPS, "GET", "/api/gps/mode")).data, { mode: "mock", accounts: 0, platforms: [] });
    const r = await verify(GPS, D1);
    assert.equal(r.status, 200, r.text);
    assert.equal(r.data.ok, true);
    assert.equal(r.data.source, "mock", "never presented as a real verification");
  });

  it("with accounts: verifies on Kentracks and maps every field", async () => {
    await addAccount(ONE);
    await addAccount(TWO);
    assert.deepEqual((await req(GPS, "GET", "/api/gps/mode")).data, { mode: "live", accounts: 2, platforms: ["Kentracks"] });
    const r = await verify(GPS, D1);
    assert.equal(r.status, 200, r.text);
    noSecrets(r.text);
    assert.equal(r.data.ok, true, r.text);
    assert.equal(r.data.source, "gpsplatform");
    assert.deepEqual(r.data.device, {
      imei: D1,
      model: "VT05S",
      name: "Truck 7",
      vehiclePlate: "KDA 777Z",
      simCard: "0712000777",
      activationDate: `${nairobiDay(ACTIVATED)} 11:53`,
      expirationDate: nairobiDay(DUE),
      userExpirationDate: nairobiDay(USER_DUE),
      account: `CUST-${run}`,
      platform: "Kentracks",
      // The owner's account information: contact name, mobile and email, its role and that it is blocked.
      accountType: "Distributor",
      accountBlocked: true,
      contact: { name: "Jane Wambui", phone: OWNER_PHONE, email: OWNER_EMAIL },
    });
    assert.deepEqual(userInfoCalls.at(-1), { by: ONE, account: `cust-${run}`, ok: true }, "asked with the API account that found the device");
    assert.deepEqual(r.data.missing, [], "nothing missing (Kentracks has no last-update time in this API)");
    const call = detailCalls.at(-1)!;
    assert.deepEqual([call.account, call.count, call.ok], [ONE, 1, true]);
  });

  it("a past platform expiry is Expired; empty fields are reported missing; a device without a type uses its name", async () => {
    const r = await verify(GPS, D2);
    assert.equal(r.data.ok, true, r.text);
    assert.equal(r.data.device.status, "Expired");
    assert.equal(r.data.device.model, "Old van");
    assert.equal(r.data.device.activationDate, undefined, "0 means not set");
    assert.deepEqual(r.data.missing.sort(), ["Activated Date", "SIM Card", "Vehicle Plate Number"].sort());
  });

  it("asks the next account when the first does not know the IMEI, and recovers from a replaced token", async () => {
    const before = authCalls.filter((a) => a === TWO).length;
    const r = await verify(GPS, D3);
    assert.equal(r.data.ok, true, r.text);
    assert.equal(r.data.device.model, "GT06N");
    assert.equal(r.data.device.account, "fleet-two");
    assert.equal(authCalls.filter((a) => a === TWO).length, before + 1, "the refused token was dropped and a new one taken once");
    // No contact name or mobile: the user name and the telephone are used. End user, not blocked.
    assert.deepEqual(r.data.device.contact, { name: "Fleet Two Ltd", phone: "0722000333" });
    assert.deepEqual([r.data.device.accountType, r.data.device.accountBlocked], ["End User", false]);
  });

  it("the owner's account information is asked once and remembered; a refusal still verifies the IMEI", async () => {
    const calls = userInfoCalls.length;
    const again = await verify(GPS, D1);
    assert.equal(again.data.device.contact.name, "Jane Wambui");
    assert.equal(userInfoCalls.length, calls, "remembered: not asked again for the sale's own check");
    const auths = authCalls.length;
    const r = await verify(GPS, D4);
    assert.equal(r.data.ok, true, r.text);
    assert.equal(r.data.device.account, `ghost-${run}`);
    assert.equal(r.data.device.contact, undefined, "no contact when Kentracks does not give the owner's details");
    assert.equal(r.data.device.accountType, undefined);
    assert.deepEqual(userInfoCalls.at(-1), { by: ONE, account: `ghost-${run}`, ok: false });
    assert.equal(authCalls.length, auths, "a refused owner lookup does not take a new token (that would cancel the current one)");
    noSecrets(r.text);
    const d2 = await verify(GPS, D2);
    assert.equal(d2.data.ok, true);
    assert.equal(userInfoCalls.at(-1)!.account, `ghost-${run}`, "a device without a customer account asks for no owner");
  });

  it("an IMEI no account knows is not found; a bad IMEI is refused before asking Kentracks", async () => {
    const calls = detailCalls.length;
    const r = await verify(GPS, UNKNOWN);
    assert.equal(r.data.ok, false);
    assert.equal(r.data.code, "not-found");
    assert.match(r.data.message, /not found on Kentracks/);
    assert.equal(detailCalls.length, calls + 2, "both accounts were asked");
    const bad = await verify(GPS, "12345");
    assert.deepEqual([bad.data.ok, bad.data.code], [false, "invalid-imei"]);
    assert.equal(detailCalls.length, calls + 2, "Kentracks not asked for an invalid IMEI");
  });

  it("iTrack: the same lookups on the iTrack API, after the Kentracks accounts", async () => {
    await addAccount(ITR, "itrack");
    assert.deepEqual((await req(GPS, "GET", "/api/gps/mode")).data, { mode: "live", accounts: 3, platforms: ["Kentracks", "iTrack"] });
    const calls = detailCalls.length;
    const r = await verify(GPS, D5);
    assert.equal(r.data.ok, true, r.text);
    noSecrets(r.text);
    assert.deepEqual(detailCalls.slice(calls).map((c) => c.account), [ONE, TWO, ITR], "Kentracks accounts first, then iTrack");
    assert.equal(r.data.device.platform, "iTrack");
    assert.deepEqual([r.data.device.model, r.data.device.vehiclePlate, r.data.device.simCard, r.data.device.account], ["ITR-01", "KMEA 555Q", "0712000555", `itr-owner-${run}`]);
    assert.deepEqual(r.data.device.contact, { name: "Juma Otieno", email: `juma.${run}@example.com` });
    assert.deepEqual([r.data.device.accountType, r.data.device.accountBlocked], ["End User", false]);
    assert.deepEqual(userInfoCalls.at(-1), { by: ITR, account: `itr-owner-${run}`, ok: true }, "owner asked with the iTrack account");
    const missing = await verify(GPS, UNKNOWN);
    assert.match(missing.data.message, /not found on Kentracks or iTrack/);
  });

  it("a sale verified by iTrack records iTrack as its verification", async () => {
    const first = async (path: string) => ((await req(GPS, "GET", path)).data as Json[])[0];
    const [customer, platform, tech] = await Promise.all([first("/api/crm/customers"), first("/api/inventory/platforms"), first("/api/crm/technicians")]);
    const sim = ((await req(GPS, "GET", "/api/inventory/sim-cards")).data as Json[]).find((s) => s.type === "Postpaid") ?? (await first("/api/inventory/sim-cards"));
    // An old Hosting Sale takes nothing from stock, so it needs no purchases; it is dated on the activation date.
    const s = await req(GPS, "POST", "/api/sales", {
      type: "Hosting Sale", clientKey: `itr-${run}`, imei: D5, customerId: customer.id, customerLink: "manual", packageId: "", productId: "",
      platformId: platform.id, cardType: "New Card", deduction: "", renewalFee: "800", simId: sim.id, deductSim: false, technicianId: tech?.id ?? "",
      installation: "", transport: "", commission: "", price: "", paid: "", notes: "", otherExpenses: [], oldSale: true,
    });
    assert.equal(s.status, 201, s.text);
    assert.deepEqual([s.data.verificationSource, s.data.verificationPlatform], ["gpsplatform", "iTrack"]);
    const again = await req(GPS, "GET", `/api/sales/${s.data.id}`);
    assert.equal(again.data.verificationPlatform, "iTrack", "stored");
    noSecrets(s.text);
  });

  it("billing refresh asks Kentracks at most 100 IMEIs per request and stores the details", async () => {
    // Every device company A sold (from the sales tests) is looked up; ALL owns them all.
    const id = await addAccount(ALL);
    for (const other of accountIds.filter((x) => x !== id)) await req(GPS, "DELETE", `${P}/accounts/${other}`);
    const customers: Json[] = [];
    for (let off: number | null = 0; off !== null && customers.length < 200;) {
      const p = await req(GPS, "GET", `/api/billing?limit=50&offset=${off}`);
      customers.push(...p.data.items);
      off = p.data.nextOffset;
    }
    // Up to 50 customers and at most 500 devices: what one refresh covers (the test database grows with every run).
    const picked: Json[] = [];
    let devices = 0;
    for (const c of customers) {
      if (picked.length === 50 || devices + c.vehicles.length > 500) break;
      picked.push(c);
      devices += c.vehicles.length;
    }
    const ids = picked.map((c) => c.id);
    assert.ok(devices > 0, "the test company has sold devices");
    const before = detailCalls.length;
    const ownersBefore = userInfoCalls.length;
    const s = await req(GPS, "POST", "/api/billing/sync", { customerIds: ids, force: true });
    assert.equal(userInfoCalls.length, ownersBefore, "a billing refresh does not look up owners");
    assert.equal(s.status, 200, s.text);
    noSecrets(s.text);
    const calls = detailCalls.slice(before);
    assert.ok(calls.every((c) => c.count <= 100 && c.ok), JSON.stringify(calls));
    assert.equal(calls.length, Math.ceil(devices / 100), "batched: one request per 100 IMEIs");
    assert.equal(s.data.failed, 0, s.text);
    const models = s.data.items.flatMap((c: Json) => c.vehicles.map((v: Json) => v.deviceModel));
    assert.ok(models.length > 0 && models.every((m: string) => m === "BATCH-MODEL"), `details stored from Kentracks: ${JSON.stringify([...new Set(models)])}`);
  });

  it("when Kentracks cannot be reached, verification fails clearly", { skip: !DOWN }, async () => {
    const r = await verify(DOWN!, D1);
    assert.equal(r.data.ok, false);
    assert.match(r.data.message, /Could not reach (Kentracks|iTrack)|did not answer/);
    noSecrets(r.text);
  });

  it("needs a session", async () => {
    const r = await fetch(`${GPS}/api/gps/verify?imei=${D1}`);
    assert.equal(r.status, 401);
    assert.equal((await fetch(`${GPS}/api/gps/mode`)).status, 401);
  });
});
