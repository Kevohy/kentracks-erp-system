/**
 * The main Dashboard (GET /api/dashboard) must show the company's real figures. Every number is recomputed here,
 * independently, from the other APIs (sale history, customers, stock, Billing, IoT SIM) and must match exactly.
 *
 *   CRM_TEST_BASE_URL     signed in as company A  [required]
 *   CRM_TEST_OTHER_URL    signed in as company B  [optional: each company sees only its own figures]
 *   CRM_TEST_UNAUTH_URL   no session              [optional]
 *   CRM_TEST_BROKEN_DB_URL database down          [optional]
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { makeSessions } from "./session.mts";
import { freshEmail, freshPhone } from "./contacts.mts";

const A = process.env.CRM_TEST_BASE_URL!;
const B = process.env.CRM_TEST_OTHER_URL;
const UNAUTH = process.env.CRM_TEST_UNAUTH_URL;
const BROKEN = process.env.CRM_TEST_BROKEN_DB_URL;
if (!A) throw new Error("Set CRM_TEST_BASE_URL");
const sessionFor = makeSessions({ a: A, b: B, broken: BROKEN });

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
async function get(base: string, path: string) {
  const cookie = await sessionFor(base);
  const res = await fetch(base + path, { headers: cookie ? { Cookie: cookie } : {} });
  const text = await res.text();
  return { status: res.status, text, data: (text ? JSON.parse(text) : null) as Json };
}
async function post(base: string, path: string, body: unknown) {
  const cookie = await sessionFor(base);
  const res = await fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) });
  return { status: res.status, data: (await res.json()) as Json };
}

/** Nairobi is UTC+3 all year. */
const nairobi = (iso: string) => new Date(Date.parse(iso) + 3 * 3600_000);
const ymd = (d: Date) => d.toISOString().slice(0, 10);

async function allSales(base: string): Promise<Json[]> {
  const out: Json[] = [];
  let cursor: string | null = null;
  do {
    const r = await get(base, `/api/sales/history?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
    assert.equal(r.status, 200, r.text);
    out.push(...r.data.items);
    cursor = r.data.nextCursor;
  } while (cursor);
  return out;
}
async function pages(base: string, path: string): Promise<Json[]> {
  const out: Json[] = [];
  let offset: number | null = 0;
  while (offset !== null) {
    const r = await get(base, `${path}${path.includes("?") ? "&" : "?"}limit=50&offset=${offset}`);
    assert.equal(r.status, 200, r.text);
    out.push(...r.data.items);
    offset = r.data.nextOffset;
  }
  return out;
}

/** Everything the dashboard should say, worked out from the other endpoints. */
async function expected(base: string, today: string) {
  const [y, m, d] = today.split("-").map(Number);
  const sales = (await allSales(base)).filter((s) => !s.oldSale);
  const inMonth = (s: Json, yy: number, mm: number, maxDay = 31) => {
    const t = nairobi(s.createdAt);
    return t.getUTCFullYear() === yy && t.getUTCMonth() + 1 === mm && t.getUTCDate() <= maxDay;
  };
  const prevY = m === 1 ? y - 1 : y;
  const prevM = m === 1 ? 12 : m - 1;
  // Same days of last month: day 1 up to today's day (all of last month if it is shorter).
  const sum = (list: Json[], k: string) => list.reduce((a, s) => a + s[k], 0);
  const thisMonth = sales.filter((s) => inMonth(s, y, m));
  const prevPart = sales.filter((s) => inMonth(s, prevY, prevM, d - 1) || (inMonth(s, prevY, prevM, d) && nairobi(s.createdAt).getUTCDate() === d && timeOfDay(s.createdAt) < timeOfDay(new Date().toISOString())));
  const byMonth = (yy: number) => Array.from({ length: 12 }, (_, i) => sum(sales.filter((s) => inMonth(s, yy, i + 1)), "totalMinor"));

  const customers = (await get(base, "/api/crm/customers")).data as unknown as Json[];
  const vehicles = (await pages(base, "/api/billing")).flatMap((c) => c.vehicles.map((v: Json) => ({ ...v, customerId: c.id, customerName: c.name })));
  const sims = (await pages(base, "/api/iot-sims/clients")).flatMap((c) => c.sims);
  const plus = (days: number) => ymd(new Date(Date.parse(`${today}T00:00:00Z`) + days * 86_400_000));
  const limit = plus(30);
  const due = [
    ...vehicles
      .filter((v) => v.cardType !== "Lifelong Card" && v.expirationDate && (v.expirationDate <= limit || v.status === "Expired"))
      .map((v) => ({ kind: "GPS licence", saleId: v.saleId, fee: v.renewalFeeMinor, date: v.expirationDate, overdue: v.expirationDate < today || v.status === "Expired" })),
    ...sims
      .filter((s) => !s.suspended && s.expiryDate <= limit)
      .map((s) => ({ kind: "IoT SIM", saleId: s.saleId, fee: s.renewalFeeMinor, date: s.expiryDate, overdue: s.expiryDate < today })),
  ];
  const fees = (l: Json[]) => l.reduce((a, x) => a + (x.fee ?? 0), 0);

  const stock = (await get(base, "/api/inventory/stock")).data as unknown as Json[];
  const names = new Map<string, string>();
  for (const p of (await get(base, "/api/inventory/products")).data as unknown as Json[]) names.set(`Product:${p.id}`, p.model);
  for (const s of (await get(base, "/api/inventory/sim-cards")).data as unknown as Json[]) names.set(`SIM Card:${s.id}`, s.name);
  for (const p of (await get(base, "/api/inventory/platforms")).data as unknown as Json[]) names.set(`Platform:${p.id}`, p.name);
  const stockItems = stock
    .filter((r) => r.type !== "Platform" || r.cardType === undefined)
    .filter((r) => names.has(`${r.type}:${r.id}`))
    .map((r) => ({ kind: r.type, id: r.id, quantity: r.quantity }));

  return {
    revenue: { monthMinor: sum(thisMonth, "totalMinor"), previousMinor: sum(prevPart, "totalMinor") },
    profit: { monthMinor: sum(thisMonth, "profitMinor"), previousMinor: sum(prevPart, "profitMinor") },
    outstanding: { amountMinor: sales.reduce((a, s) => a + s.totalMinor - s.paidMinor, 0), sales: sales.filter((s) => s.paidMinor < s.totalMinor).length },
    customers: {
      total: customers.length,
      withVehicles: new Set(vehicles.map((v) => v.customerId)).size,
    },
    revenueByMonth: { year: y, thisYear: byMonth(y), lastYear: byMonth(y - 1) },
    recent: sales.slice(0, 5).map((s) => s.id),
    upcoming: due.filter((x) => !x.overdue),
    overdue: due.filter((x) => x.overdue),
    fees,
    stockItems,
  };
}
const timeOfDay = (iso: string) => nairobi(iso).toISOString().slice(11);

async function check(base: string) {
  const r = await get(base, "/api/dashboard");
  assert.equal(r.status, 200, r.text);
  const dash = r.data;
  const exp = await expected(base, dash.today);
  // Figures can move only if someone records something between the two reads; tests run alone, so they must match.
  assert.deepEqual(dash.revenue, exp.revenue, "revenue this month vs same days of last month");
  assert.deepEqual(dash.profit, exp.profit, "profit this month vs same days of last month");
  assert.deepEqual(dash.outstanding, exp.outstanding, "unpaid balances");
  assert.equal(dash.customers.total, exp.customers.total, "customers");
  assert.equal(dash.customers.withVehicles, exp.customers.withVehicles, "customers with tracked vehicles");
  assert.ok(dash.customers.newThisMonth >= 0 && dash.customers.newThisMonth <= dash.customers.total);
  assert.deepEqual(dash.revenueByMonth, exp.revenueByMonth, "monthly revenue, this year and last year");
  assert.deepEqual(dash.recentSales.map((s: Json) => s.id), exp.recent, "latest five sales, newest first, no old sales");
  for (const s of dash.recentSales) assert.match(s.date, /^\d{4}-\d{2}-\d{2}$/);

  const rn = dash.renewals;
  assert.equal(rn.windowDays, 30);
  assert.equal(rn.upcomingCount, exp.upcoming.length, "renewals due in 30 days (GPS licences + IoT SIMs)");
  assert.equal(rn.overdueCount, exp.overdue.length, "renewals already expired");
  assert.equal(rn.upcomingFeesMinor, exp.fees(exp.upcoming));
  assert.equal(rn.overdueFeesMinor, exp.fees(exp.overdue));
  assert.ok(rn.upcoming.length <= 6);
  const dates = rn.upcoming.map((x: Json) => x.expiryDate);
  assert.deepEqual(dates, [...dates].sort(), "soonest first");
  const expKeys = new Set(exp.upcoming.map((x) => `${x.kind}:${x.saleId}:${x.date}`));
  for (const x of rn.upcoming) {
    assert.ok(expKeys.has(`${x.kind}:${x.saleId}:${x.expiryDate}`), `listed renewal is really due: ${JSON.stringify(x)}`);
    assert.ok(x.expiryDate >= dash.today, "upcoming ones are not expired");
  }
  if (exp.upcoming.length) assert.equal(rn.upcoming[0].expiryDate, exp.upcoming.map((x) => x.date).sort()[0], "the soonest one comes first");

  const qty = (l: Json[]) => l.map((s) => s.quantity);
  const expStock = [...exp.stockItems].sort((a, b) => a.quantity - b.quantity);
  assert.deepEqual(qty(dash.stock), qty(expStock).slice(0, 6), "lowest stock first, same quantities as Inventory");
  for (const s of dash.stock) {
    const e = exp.stockItems.find((x) => x.kind === s.kind && x.id === s.id);
    assert.ok(e && e.quantity === s.quantity, `stock of ${s.name} matches Inventory`);
  }
  return dash;
}

describe("Dashboard: real figures", () => {
  it("company A: every figure matches the records", async () => {
    const d = await check(A);
    assert.ok(d.customers.total > 0, "the test company has customers");
    assert.ok(d.recentSales.length > 0, "the test company has sales");
    assert.ok(!/sample/i.test(JSON.stringify(d)));
  });

  it("company B: only its own figures", { skip: !B }, async () => {
    const b = await check(B!);
    const a = (await get(A, "/api/dashboard")).data;
    const idsA = new Set(a.recentSales.map((s: Json) => s.id));
    for (const s of b.recentSales) assert.ok(!idsA.has(s.id), "no sale of company A on company B's dashboard");
  });

  it("follows new records: a new customer is counted at once", async () => {
    const before = (await get(A, "/api/dashboard")).data.customers;
    const brand = ((await get(A, "/api/settings/brands")).data as unknown as Json[])[0].id;
    const run = Date.now().toString(36);
    const c = await post(A, "/api/crm/customers", { brandId: brand, type: "End User", firstName: "Dash", lastName: "Board", account: `D-${run}`, phone: freshPhone(), email: freshEmail("dash"), location: "Nairobi" });
    assert.equal(c.status, 201, JSON.stringify(c.data));
    const after = (await get(A, "/api/dashboard")).data.customers;
    assert.equal(after.total, before.total + 1);
    assert.equal(after.newThisMonth, before.newThisMonth + 1);
    await fetch(`${A}/api/crm/customers/${c.data.id}`, { method: "DELETE", headers: { Cookie: (await sessionFor(A))! } });
  });

  it("needs a session", { skip: !UNAUTH }, async () => {
    assert.equal((await fetch(`${UNAUTH}/api/dashboard`)).status, 401);
  });

  it("fails safely when the database is down", { skip: !BROKEN }, async () => {
    const r = await get(BROKEN!, "/api/dashboard");
    assert.ok(r.status >= 500 || r.status === 401, String(r.status));
    assert.ok(!/postgres|password|stack|ECONNREFUSED/i.test(r.text), "no internals leak");
  });
});
