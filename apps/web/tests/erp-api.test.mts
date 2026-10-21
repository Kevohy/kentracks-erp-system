/**
 * Integration tests for the Inventory, Purchases, Sales and Packages API. They need a running server and
 * a migrated LOCAL database that already has the CRM tables (see tests/README.md):
 *
 *   CRM_TEST_BASE_URL        a server; signed in as the user of company A (CRM_TEST_EMAIL / CRM_TEST_PASSWORD)  [required]
 *   CRM_TEST_OTHER_URL       a server; signed in as the user of company B (CRM_TEST_OTHER_EMAIL / _PASSWORD)  [optional]
 *   CRM_TEST_UNAUTH_URL      a server that gets NO session (every endpoint must answer 401)                [optional]
 *   CRM_TEST_BROKEN_DB_URL   a server whose database cannot be reached (safe errors)                       [optional]
 *
 * Purchases and sales cannot be deleted through the API (the app has no delete for them), so run these
 * against a throwaway database, never one with real data. Every record is named with a per-run suffix.
 */
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { makeSessions } from "./session.mts";
import { freshEmail, freshPhone } from "./contacts.mts";

const A = process.env.CRM_TEST_BASE_URL;
const B = process.env.CRM_TEST_OTHER_URL;
const UNAUTH = process.env.CRM_TEST_UNAUTH_URL;
const BROKEN = process.env.CRM_TEST_BROKEN_DB_URL;
if (!A) throw new Error("Set CRM_TEST_BASE_URL (see tests/README.md)");
const sessionFor = makeSessions({ a: A, b: B, broken: BROKEN });

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
async function req(base: string, method: string, path: string, body?: unknown, headers: Record<string, string> = { "Content-Type": "application/json" }) {
  const cookie = await sessionFor(base);
  const sent = { ...(body === undefined ? {} : headers), ...(cookie ? { Cookie: cookie } : {}) };
  const res = await fetch(base + path, { method, headers: sent, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body) });
  const text = await res.text();
  let data: Json | null = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* not json */ }
  return { status: res.status, data: data as Json, text, headers: res.headers };
}
const a = (m: string, p: string, b?: unknown) => req(A, m, p, b);
const run = Date.now().toString(36);
/** Every customer needs a brand (Settings → Brands). */
const BRAND = ((await a("GET", "/api/settings/brands")).data as unknown as Json[])[0].id as string;
/** CRM person names accept letters only. */
const runL = run.replace(/\d/g, (d) => "abcdefghij"[Number(d)]);
let seq = 0;
const key = () => `k${run}${(seq++).toString(36)}`.padEnd(10, "x");

/** A valid 15-digit IMEI (Luhn) that is not one of the special mock devices. */
function imei(): string {
  const base = `3520${String(Date.now() + seq++).slice(-10)}`;
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    let d = Number(base[13 - i]);
    if (i % 2 === 0) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return base + ((10 - (sum % 10)) % 10);
}

const MOCK_PHONE_IMEI = "352090100000012"; // contact 0700 000 102 / w.mwangi@mail.example
const MOCK_FAIL_IMEI = "352090100000079";

// ---- shared fixtures
const fx: Json = {};
async function getOrCreate(path: string, body: Json, find: (x: Json) => boolean) {
  const r = await a("POST", path, body);
  if (r.status === 201) return r.data;
  const list = (await a("GET", path)).data as Json[];
  return list.find(find)!;
}
const purchaseBody = (over: Json = {}) => ({
  supplierId: fx.supplier.id, status: "Received", date: "2026-10-01", notes: "", paid: "0",
  rows: [], clientKey: key(), ...over,
});
const prow = (type: string, itemId: string, quantity: string, unitPrice: string, categoryId = "", cardType = "Annual Card") => ({ key: `r${seq++}`, type, categoryId, itemId, ...(type === "Platform" ? { cardType } : {}), quantity, unitPrice });
async function buy(rows: Json[], over: Json = {}) {
  const r = await a("POST", "/api/purchases", purchaseBody({ rows, ...over }));
  assert.equal(r.status, 201, r.text);
  return r.data;
}
/** Stock of an item (total), or of one platform card type. */
const stockOf = async (type: string, id: string, cardType?: string) => {
  const rows = (await a("GET", "/api/inventory/stock")).data as Json[];
  return rows.find((x) => x.type === type && x.id === id && x.cardType === cardType) ?? { quantity: 0, latestPriceMinor: null };
};
async function newSim(name: string, qty: number) {
  const sim = (await a("POST", "/api/inventory/sim-cards", { name, type: "Prepaid" })).data;
  if (qty) await buy([prow("SIM Card", sim.id, String(qty), "100")]);
  return sim;
}
const sale = (over: Json = {}) => ({
  type: "Package Sale", clientKey: key(), imei: imei(), customerId: fx.customer.id, customerLink: "manual", packageId: fx.pkgBasic.id,
  productId: fx.tracker.id, platformId: fx.platform.id, cardType: "Lifelong Card", deduction: "0.5", simId: fx.sim.id, technicianId: fx.tech.id,
  installation: "300", transport: "200", commission: "100", price: "12000", paid: "5000", notes: "", deductSim: false,
  otherExpenses: [{ key: "x1", description: "Cable", amount: "50" }], ...over,
});

before(async () => {
  fx.supplier = (await req(A, "POST", "/api/crm/suppliers", { type: "Individual", fullName: `Supplier ${runL}`, phone: "0711000111", email: `s${run}@example.com`, location: "Nairobi" })).data;
  fx.customer = (await req(A, "POST", "/api/crm/customers", { brandId: BRAND, type: "End User", firstName: "Sale", lastName: "Customer", account: `S-${run}`, phone: freshPhone(), email: freshEmail("sale"), location: "Nairobi" })).data;
  fx.tech = (await req(A, "POST", "/api/crm/technicians", { name: `Tech ${runL}`, phone: "0722000111", email: "", location: "Nairobi" })).data;
  assert.ok(fx.supplier?.id && fx.customer?.id && fx.tech?.id, `CRM fixtures were created: ${JSON.stringify([fx.supplier, fx.customer, fx.tech])}`);
  fx.cat = await getOrCreate("/api/inventory/categories", { name: "GPS Trackers" }, (c) => c.name.toLowerCase() === "gps trackers");
  fx.tracker = (await a("POST", "/api/inventory/products", { category: fx.cat.id, model: `FMB-${run}` })).data;
  fx.ptracker = (await a("POST", "/api/inventory/products", { category: fx.cat.id, model: `PT-${run}` })).data;
  fx.psim = (await a("POST", "/api/inventory/sim-cards", { name: `PS ${run}`, type: "Postpaid" })).data;
  fx.platform = (await a("POST", "/api/inventory/platforms", { name: `Wialon ${run}` })).data;
  fx.sim = await newSim(`Safaricom ${run}`, 0);
  await buy([prow("Product", fx.tracker.id, "1000", "5000", fx.cat.id), prow("SIM Card", fx.sim.id, "1000", "100"), prow("Platform", fx.platform.id, "1000", "1000"), prow("Platform", fx.platform.id, "1000", "1000", "", "Lifelong Card"), prow("Platform", fx.platform.id, "1000", "1000", "", "New Card")]);
  {
    const bad = await a("POST", "/api/purchases", purchaseBody({ rows: [{ ...prow("Platform", fx.platform.id, "1", "10"), cardType: "" }] }));
    assert.equal(bad.status, 422, bad.text);
    const worse = await a("POST", "/api/purchases", purchaseBody({ rows: [{ ...prow("Platform", fx.platform.id, "1", "10"), cardType: "Gold Card" }] }));
    assert.equal(worse.status, 422, worse.text);
    const list = await a("GET", "/api/purchases");
    const plat = list.data.flatMap((p: Json) => p.items).find((x: Json) => x.itemType === "Platform");
    assert.equal(plat.cardType, "Annual Card");
  }
  fx.pkgBasic = await getOrCreate("/api/settings/packages", { name: "Basic" }, (p) => p.name === "Basic");
  fx.pkgHosting = await getOrCreate("/api/settings/packages", { name: "Hosting" }, (p) => p.name.toLowerCase() === "hosting");
});

describe("access and request hygiene", () => {
  it("answers 401 without an authenticated context (every endpoint)", { skip: !UNAUTH }, async () => {
    for (const p of ["/api/inventory/categories", "/api/inventory/products", "/api/inventory/sim-cards", "/api/inventory/platforms", "/api/inventory/stock", "/api/purchases", "/api/sales", "/api/settings/packages"]) {
      assert.equal((await req(UNAUTH!, "GET", p)).status, 401, p);
      assert.equal((await req(UNAUTH!, "POST", p, {})).status, 401, p);
    }
  });
  it("sets Cache-Control: no-store", async () => {
    assert.equal((await a("GET", "/api/purchases")).headers.get("cache-control"), "no-store");
  });
  it("rejects non-JSON content types, broken JSON and non-object bodies", async () => {
    assert.equal((await req(A, "POST", "/api/purchases", "x=1", { "Content-Type": "text/plain" })).status, 415);
    assert.equal((await a("POST", "/api/sales", "{nope")).status, 400);
    assert.equal((await a("POST", "/api/sales", "[]")).status, 400);
  });
  it("rejects oversized bodies", async () => {
    assert.equal((await a("POST", "/api/purchases", { notes: "x".repeat(70_000) })).status, 413);
  });
  it("treats malformed or unknown ids as 404", async () => {
    assert.equal((await a("GET", "/api/purchases/not-a-uuid")).status, 404);
    assert.equal((await a("GET", "/api/sales/00000000-0000-4000-8000-000000000000")).status, 404);
    assert.equal((await a("PUT", "/api/settings/packages/not-a-uuid", { name: "X" })).status, 404);
  });
  it("hides database failures behind a generic error", { skip: !BROKEN }, async () => {
    for (const p of ["/api/inventory/products", "/api/purchases", "/api/sales", "/api/settings/packages", "/api/inventory/stock"]) {
      const r = await req(BROKEN!, "GET", p);
      assert.equal(r.status, 500, p);
      assert.ok(!/ECONNREFUSED|postgres|5999|select |password/i.test(r.text), `no internals leaked: ${r.text}`);
    }
  });
});

describe("inventory", () => {
  it("creates and lists categories, products, SIM cards and platforms; data persists", async () => {
    const cat = (await a("POST", "/api/inventory/categories", { name: `  Cameras   ${run} ` })).data;
    assert.equal(cat.name, `Cameras ${run}`, "whitespace is collapsed");
    const prod = await a("POST", "/api/inventory/products", { category: cat.id, model: `DC-${run}` });
    assert.equal(prod.status, 201);
    assert.deepEqual(Object.keys(prod.data).sort(), ["categoryId", "id", "model"]);
    const sim = await a("POST", "/api/inventory/sim-cards", { name: `MTN ${run}`, type: "International IoT" });
    assert.equal(sim.status, 201);
    const pf = await a("POST", "/api/inventory/platforms", { name: `Gurtam ${run}` });
    assert.equal(pf.status, 201);
    assert.deepEqual(pf.data.licenceTypes, ["New Card", "Annual Card", "Lifelong Card"]);
    assert.ok(((await a("GET", "/api/inventory/categories")).data as Json[]).some((c) => c.id === cat.id));
    assert.ok(((await a("GET", "/api/inventory/products")).data as Json[]).some((p) => p.id === prod.data.id));
    assert.ok(((await a("GET", "/api/inventory/sim-cards")).data as Json[]).some((s) => s.id === sim.data.id && s.type === "International IoT"));
    assert.ok(((await a("GET", "/api/inventory/platforms")).data as Json[]).some((p) => p.id === pf.data.id));
  });
  it("lists new products, SIM cards and platforms first, categories oldest first", async () => {
    const c1 = (await a("POST", "/api/inventory/categories", { name: `Ord1 ${run}` })).data;
    const c2 = (await a("POST", "/api/inventory/categories", { name: `Ord2 ${run}` })).data;
    const cats = (await a("GET", "/api/inventory/categories")).data as Json[];
    assert.ok(cats.findIndex((c) => c.id === c1.id) < cats.findIndex((c) => c.id === c2.id));
    const p1 = (await a("POST", "/api/inventory/platforms", { name: `Pord1 ${run}` })).data;
    const p2 = (await a("POST", "/api/inventory/platforms", { name: `Pord2 ${run}` })).data;
    const pfs = (await a("GET", "/api/inventory/platforms")).data as Json[];
    assert.ok(pfs.findIndex((p) => p.id === p2.id) < pfs.findIndex((p) => p.id === p1.id));
  });
  it("validates every field with the same messages as the forms", async () => {
    let r = await a("POST", "/api/inventory/categories", { name: "   " });
    assert.equal(r.status, 422); assert.equal(r.data.errors.name, "Category name is required");
    r = await a("POST", "/api/inventory/products", { category: "", model: "" });
    assert.deepEqual(r.data.errors, { category: "Select a category", model: "Model is required" });
    r = await a("POST", "/api/inventory/products", { category: fx.cat.id, model: "x".repeat(81) });
    assert.equal(r.data.errors.model, "Model must be 80 characters or fewer");
    r = await a("POST", "/api/inventory/sim-cards", { name: "ok", type: "Gold" });
    assert.equal(r.data.errors.type, "Select a valid type");
    r = await a("POST", "/api/inventory/platforms", { name: "" });
    assert.equal(r.data.errors.name, "Platform name is required");
  });
  it("rejects unknown fields and wrong types", async () => {
    let r = await a("POST", "/api/inventory/platforms", { name: "P", tenantId: "x" });
    assert.equal(r.status, 422); assert.ok(r.data.errors.tenantId);
    r = await a("POST", "/api/inventory/platforms", { name: 5 });
    assert.equal(r.data.errors.name, "Must be text");
  });
  it("does not allow two categories with the same name (any letter case)", async () => {
    const name = `Dup ${run}`;
    assert.equal((await a("POST", "/api/inventory/categories", { name })).status, 201);
    const r = await a("POST", "/api/inventory/categories", { name: name.toUpperCase() });
    assert.equal(r.status, 422); assert.equal(r.data.errors.name, "A category with this name already exists");
  });
  it("stores text safely (quotes, SQL and HTML characters stay plain text)", async () => {
    const model = `'; DROP TABLE products;-- <b>${run}</b>`;
    const r = await a("POST", "/api/inventory/products", { category: fx.cat.id, model });
    assert.equal(r.status, 201); assert.equal(r.data.model, model);
  });
  it("keeps each company's inventory private", { skip: !B }, async () => {
    const list = (await req(B!, "GET", "/api/inventory/products")).data as Json[];
    assert.ok(!list.some((p) => p.id === fx.tracker.id));
    const r = await req(B!, "POST", "/api/inventory/products", { category: fx.cat.id, model: "Stolen" });
    assert.equal(r.status, 422); assert.equal(r.data.errors.category, "Select a valid category");
  });
});

describe("purchases", () => {
  it("creates a purchase; totals come from the server and the record persists", async () => {
    const p = await buy([prow("Product", fx.ptracker.id, "2", "1500.50", fx.cat.id), prow("SIM Card", fx.psim.id, "10", "50")], { paid: "1000", notes: "  first \n order " });
    assert.equal(p.totalMinor, 2 * 150050 + 10 * 5000);
    assert.equal(p.paidMinor, 100000);
    assert.equal(p.supplierName, fx.supplier.name);
    assert.equal(p.items.length, 2);
    assert.deepEqual([p.items[0].itemType, p.items[0].label, p.items[0].categoryName, p.items[0].itemId], ["Product", fx.ptracker.model, "GPS Trackers", fx.ptracker.id]);
    assert.equal(p.items[1].categoryName, undefined);
    const got = (await a("GET", `/api/purchases/${p.id}`)).data;
    assert.deepEqual(got, p, "GET by id returns the same record");
    assert.deepEqual(((await a("GET", "/api/purchases")).data as Json[]).find((x) => x.id === p.id), p, "persisted in the list");
  });
  it("lists the newest purchase first and keeps item order", async () => {
    const first = await buy([prow("SIM Card", fx.psim.id, "1", "1")]);
    const second = await buy([prow("SIM Card", fx.psim.id, "1", "1")]);
    const list = (await a("GET", "/api/purchases")).data as Json[];
    assert.ok(list.findIndex((x) => x.id === second.id) < list.findIndex((x) => x.id === first.id));
  });
  it("returns every validation error for a bad purchase and saves nothing", async () => {
    const before = ((await a("GET", "/api/purchases")).data as Json[]).length;
    const r = await a("POST", "/api/purchases", { supplierId: "", status: "", date: "2026-02-31", notes: "n".repeat(501), paid: "abc", rows: [{ key: "a", type: "", categoryId: "", itemId: "", quantity: "0", unitPrice: "-1" }], clientKey: key() });
    assert.equal(r.status, 422);
    for (const k of ["supplier", "status", "date", "notes", "paid", "row-a-type", "row-a-quantity", "row-a-unitPrice"]) assert.ok(r.data.errors[k], `error for ${k}`);
    assert.equal(((await a("GET", "/api/purchases")).data as Json[]).length, before);
  });
  it("requires at least one item and rejects paying more than the total", async () => {
    let r = await a("POST", "/api/purchases", purchaseBody({ rows: [] }));
    assert.equal(r.data.errors.items, "Add at least one item");
    r = await a("POST", "/api/purchases", purchaseBody({ rows: [prow("SIM Card", fx.psim.id, "1", "100")], paid: "100.01" }));
    assert.match(r.data.errors.paid, /cannot be more than the total/);
  });
  it("rejects a model that does not belong to the chosen category, and foreign ids", async () => {
    const other = (await a("POST", "/api/inventory/categories", { name: `Other ${run}` })).data;
    const r = await a("POST", "/api/purchases", purchaseBody({ rows: [{ key: "z", type: "Product", categoryId: other.id, itemId: fx.ptracker.id, quantity: "1", unitPrice: "1" }] }));
    assert.equal(r.data.errors["row-z-item"], "Select a valid model");
    const s = await a("POST", "/api/purchases", purchaseBody({ supplierId: "00000000-0000-4000-8000-000000000000", rows: [prow("SIM Card", fx.psim.id, "1", "1")] }));
    assert.equal(s.data.errors.supplier, "Select a valid supplier");
  });
  it("rejects a client-supplied total, tenant, or id (the server works these out)", async () => {
    const r = await a("POST", "/api/purchases", purchaseBody({ rows: [prow("SIM Card", fx.psim.id, "1", "1")], totalMinor: 1, tenantId: "x", id: "y" }));
    assert.equal(r.status, 422);
    for (const k of ["totalMinor", "tenantId", "id"]) assert.ok(r.data.errors[k]);
  });
  it("enforces item count and quantity limits", async () => {
    const rows = Array.from({ length: 51 }, () => prow("SIM Card", fx.psim.id, "1", "1"));
    assert.match((await a("POST", "/api/purchases", purchaseBody({ rows }))).data.errors.items, /at most 50/);
    const big = await a("POST", "/api/purchases", purchaseBody({ rows: [{ ...prow("SIM Card", fx.psim.id, "100001", "1") }] }));
    assert.match(Object.values(big.data.errors).join(" "), /100,000 or fewer/);
  });
  it("handles money exactly (no floating point drift)", async () => {
    const p = await buy([prow("SIM Card", fx.psim.id, "3", "0.10"), prow("SIM Card", fx.psim.id, "7", "19.99")]);
    assert.equal(p.totalMinor, 3 * 10 + 7 * 1999);
  });
  it("answers a repeated submit with the purchase already saved (no duplicate)", async () => {
    const body = purchaseBody({ rows: [prow("SIM Card", fx.psim.id, "1", "7")] });
    const one = await a("POST", "/api/purchases", body);
    const two = await a("POST", "/api/purchases", body);
    assert.equal(one.status, 201); assert.equal(two.status, 200);
    assert.equal(one.data.id, two.data.id);
    const results = await Promise.all([1, 2, 3, 4].map(() => a("POST", "/api/purchases", purchaseBody({ clientKey: "same" + run.padEnd(6, "0"), rows: [prow("SIM Card", fx.psim.id, "1", "7")] }))));
    assert.equal(new Set(results.map((r) => r.data.id)).size, 1, "parallel identical submits create one purchase");
    assert.equal(results.filter((r) => r.status === 201).length, 1);
  });
  it("rejects a bad request key", async () => {
    const r = await a("POST", "/api/purchases", purchaseBody({ clientKey: "x y", rows: [prow("SIM Card", fx.psim.id, "1", "1")] }));
    assert.equal(r.status, 422); assert.ok(r.data.errors.clientKey);
  });
  it("keeps each company's purchases private", { skip: !B }, async () => {
    const p = await buy([prow("SIM Card", fx.psim.id, "1", "1")]);
    assert.ok(!((await req(B!, "GET", "/api/purchases")).data as Json[]).some((x) => x.id === p.id));
    assert.equal((await req(B!, "GET", `/api/purchases/${p.id}`)).status, 404);
    const r = await req(B!, "POST", "/api/purchases", purchaseBody({ rows: [prow("SIM Card", fx.psim.id, "1", "1")] }));
    assert.equal(r.status, 422, "B cannot buy A's supplier or SIM");
  });
});

describe("stock (derived)", () => {
  it("counts received purchases only and works out the latest buying price by date", async () => {
    const m = (await a("POST", "/api/inventory/products", { category: fx.cat.id, model: `ST-${run}` })).data;
    assert.deepEqual(await stockOf("Product", m.id), { quantity: 0, latestPriceMinor: null });
    await buy([prow("Product", m.id, "5", "100", fx.cat.id)], { date: "2026-10-05" });
    await buy([prow("Product", m.id, "3", "120", fx.cat.id)], { date: "2026-10-10" });
    await buy([prow("Product", m.id, "2", "90", fx.cat.id)], { date: "2026-09-01" }); // older date: not the latest price
    await buy([prow("Product", m.id, "50", "999", fx.cat.id)], { date: "2026-12-01", status: "Pending" }); // not arrived
    const s = await stockOf("Product", m.id);
    assert.equal(s.quantity, 10);
    assert.equal(s.latestPriceMinor, 12000);
  });
  it("on the same date the purchase added last sets the price", async () => {
    const m = (await a("POST", "/api/inventory/products", { category: fx.cat.id, model: `TIE-${run}` })).data;
    await buy([prow("Product", m.id, "1", "100", fx.cat.id)], { date: "2026-10-05" });
    await buy([prow("Product", m.id, "1", "300", fx.cat.id)], { date: "2026-10-05" });
    assert.equal((await stockOf("Product", m.id)).latestPriceMinor, 30000);
  });
  it("keeps each company's stock private", { skip: !B }, async () => {
    const rows = (await req(B!, "GET", "/api/inventory/stock")).data as Json[];
    assert.ok(!rows.some((r) => r.id === fx.tracker.id));
  });
});

describe("packages (Settings)", () => {
  it("creates, renames and lists packages in creation order", async () => {
    const x = (await a("POST", "/api/settings/packages", { name: `Pkg A ${run}` })).data;
    const y = (await a("POST", "/api/settings/packages", { name: `Pkg B ${run}` })).data;
    const list = (await a("GET", "/api/settings/packages")).data as Json[];
    assert.ok(list.findIndex((p) => p.id === x.id) < list.findIndex((p) => p.id === y.id));
    const r = await a("PUT", `/api/settings/packages/${x.id}`, { name: `Pkg A2 ${run}` });
    assert.equal(r.status, 200); assert.equal(r.data.name, `Pkg A2 ${run}`);
    assert.equal(((await a("GET", "/api/settings/packages")).data as Json[]).find((p) => p.id === x.id)!.name, `Pkg A2 ${run}`);
  });
  it("rejects duplicate names in any letter case, on add and on rename, but allows keeping its own name", async () => {
    const x = (await a("POST", "/api/settings/packages", { name: `Dupe ${run}` })).data;
    let r = await a("POST", "/api/settings/packages", { name: `DUPE ${run}` });
    assert.equal(r.status, 422); assert.equal(r.data.errors.name, "A package with this name already exists");
    const y = (await a("POST", "/api/settings/packages", { name: `Other ${run}` })).data;
    r = await a("PUT", `/api/settings/packages/${y.id}`, { name: `dupe ${run}` });
    assert.equal(r.status, 422);
    assert.equal((await a("PUT", `/api/settings/packages/${x.id}`, { name: `DUPE ${run}` })).status, 200, "changing only the letter case of its own name is fine");
  });
  it("validates the name and rejects unknown fields", async () => {
    assert.equal((await a("POST", "/api/settings/packages", { name: "" })).data.errors.name, "Package name is required");
    assert.equal((await a("POST", "/api/settings/packages", { name: "x".repeat(61) })).data.errors.name, "Package name must be 60 characters or fewer");
    assert.equal((await a("POST", "/api/settings/packages", { name: "ok", price: 1 })).status, 422);
  });
  it("cannot rename another company's package", { skip: !B }, async () => {
    assert.equal((await req(B!, "PUT", `/api/settings/packages/${fx.pkgBasic.id}`, { name: "Hijack" })).status, 404);
    assert.ok(!((await req(B!, "GET", "/api/settings/packages")).data as Json[]).some((p) => p.id === fx.pkgBasic.id));
  });
});

describe("package sales", () => {
  it("records a sale; total, costs and profit are worked out by the server", async () => {
    const r = await a("POST", "/api/sales", sale());
    assert.equal(r.status, 201, r.text);
    const s = r.data;
    assert.equal(s.type, "Package Sale");
    assert.equal(s.totalMinor, 1_200_000);
    assert.equal(s.packagePriceMinor, 1_200_000);
    assert.equal(s.paidMinor, 500_000);
    assert.deepEqual(s.costMinor, { tracker: 500_000, sim: 10_000, licence: 50_000 });
    assert.equal(s.profitMinor, 1_200_000 - 500_000 - 10_000 - 50_000 - 30_000 - 20_000 - 10_000 - 5_000);
    assert.deepEqual(s.costMissing, []);
    assert.equal(s.customerName, fx.customer.name);
    assert.equal(s.packageName, "Basic");
    assert.equal(s.tracker.model, fx.tracker.model);
    assert.equal(s.verificationSource, "mock");
    assert.equal(s.verificationPlatform, null, "mock data names no platform");
    assert.deepEqual(s.technician, { id: fx.tech.id, name: fx.tech.name });
    assert.deepEqual(s.expensesMinor.other, [{ description: "Cable", amountMinor: 5000 }]);
    assert.equal(s.sim.deducted, true, "every sale takes its SIM card out of stock");
    assert.deepEqual((await a("GET", `/api/sales/${s.id}`)).data, s, "GET returns the same record");
    assert.deepEqual(((await a("GET", "/api/sales")).data as Json[]).find((x) => x.id === s.id), s, "persisted in the list");
  });
  it("ignores a client-supplied total, profit, cost or device details", async () => {
    const r = await a("POST", "/api/sales", sale({ totalMinor: 1, profitMinor: 99999999, plate: "FAKE" }));
    assert.equal(r.status, 422);
    for (const k of ["totalMinor", "profitMinor", "plate"]) assert.ok(r.data.errors[k], k);
  });
  it("every sale takes its tracker, SIM card and platform licence deduction out of stock", async () => {
    const sim = await newSim(`Deduct ${run}`, 2);
    const before = { tracker: (await stockOf("Product", fx.tracker.id)).quantity, licence: (await stockOf("Platform", fx.platform.id)).quantity };
    const r = await a("POST", "/api/sales", sale({ simId: sim.id, deduction: "0.5" }));
    assert.equal(r.status, 201, r.text);
    assert.equal(r.data.sim.deducted, true);
    assert.equal((await stockOf("SIM Card", sim.id)).quantity, 1);
    assert.equal((await stockOf("Product", fx.tracker.id)).quantity, before.tracker - 1);
    assert.equal((await stockOf("Platform", fx.platform.id)).quantity, before.licence - 0.5);
    assert.deepEqual(r.data.stockTaken.map((t: Json) => `${t.itemType}:${t.quantity}`).sort(), ["Platform:0.5", "Product:1", "SIM Card:1"]);
    assert.equal((await stockOf("SIM Card", sim.id)).latestPriceMinor, 10000, "buying price history is unchanged");
    const none = await a("POST", "/api/sales", sale({ simId: sim.id, cardType: "New Card", deduction: "0", renewalFee: "1000" }));
    assert.equal(none.status, 201);
    assert.ok(!none.data.stockTaken.some((t: Json) => t.itemType === "Platform"), "deduction 0 takes no licence");
  });
  it("refuses a SIM card or platform licence that is out of stock and records nothing", async () => {
    const sim = await newSim(`Empty ${run}`, 0);
    const before = ((await a("GET", "/api/sales")).data as Json[]).length;
    const r = await a("POST", "/api/sales", sale({ simId: sim.id }));
    assert.equal(r.status, 422); assert.match(r.data.errors.sim, /out of stock/);
    const plat = (await a("POST", "/api/inventory/platforms", { name: `NoLic ${run}` })).data;
    const p = await a("POST", "/api/sales", sale({ platformId: plat.id, deduction: "1" }));
    assert.equal(p.status, 422); assert.match(p.data.errors.deduction, /has no Lifelong Cards in stock/);
    await buy([prow("Platform", plat.id, "5", "10", "", "Annual Card")]);
    assert.match((await a("POST", "/api/sales", sale({ platformId: plat.id, deduction: "1" }))).data.errors.deduction, /has no Lifelong Cards in stock/, "Annual Card stock cannot be sold as Lifelong");
    await buy([prow("Platform", plat.id, "1", "10", "", "Lifelong Card")]);
    assert.match((await a("POST", "/api/sales", sale({ platformId: plat.id, deduction: "1" }))).status.toString(), /201/);
    assert.match((await a("POST", "/api/sales", sale({ platformId: plat.id, deduction: "0.5" }))).data.errors.deduction, /has no Lifelong Cards in stock/);
    assert.equal((await stockOf("Platform", plat.id, "Annual Card")).quantity, 5, "other card types untouched");
    assert.equal(((await a("GET", "/api/sales")).data as Json[]).length, before + 1);
  });
  it("lets only one of two simultaneous sales take the last SIM card", async () => {
    const sim = await newSim(`Last ${run}`, 1);
    const results = await Promise.all([1, 2, 3].map(() => a("POST", "/api/sales", sale({ simId: sim.id }))));
    assert.deepEqual(results.map((r) => r.status).sort(), [201, 422, 422]);
    assert.equal((await stockOf("SIM Card", sim.id)).quantity, 0, "stock never goes negative");
  });
  it("answers a repeated submit with the sale already saved (no duplicate, no second deduction)", async () => {
    const sim = await newSim(`Idem ${run}`, 3);
    const body = sale({ simId: sim.id });
    const one = await a("POST", "/api/sales", body);
    const two = await a("POST", "/api/sales", body);
    assert.equal(one.status, 201); assert.equal(two.status, 200); assert.equal(one.data.id, two.data.id);
    assert.equal((await stockOf("SIM Card", sim.id)).quantity, 2);
    const k = key();
    const par = await Promise.all([1, 2, 3, 4].map(() => a("POST", "/api/sales", sale({ clientKey: k, simId: sim.id }))));
    assert.equal(new Set(par.map((r) => r.data.id)).size, 1);
    assert.equal((await stockOf("SIM Card", sim.id)).quantity, 1, "only one more SIM was taken");
  });
  it("re-verifies the IMEI on the server", async () => {
    let r = await a("POST", "/api/sales", sale({ imei: "123" }));
    assert.equal(r.status, 422); assert.equal(r.data.errors.imei, "IMEI must be exactly 15 digits");
    r = await a("POST", "/api/sales", sale({ imei: "352090100000013" }));
    assert.match(r.data.errors.imei, /not valid/);
    r = await a("POST", "/api/sales", sale({ imei: MOCK_FAIL_IMEI }));
    assert.match(r.data.errors.imei, /not responding/);
    r = await a("POST", "/api/sales", sale({ imei: "" }));
    assert.equal(r.data.errors.imei, "IMEI is required");
  });
  it("lists every missing field at once", async () => {
    const r = await a("POST", "/api/sales", { type: "Package Sale", customerLink: "manual", imei: imei(), clientKey: key() });
    assert.equal(r.status, 422);
    for (const k of ["customer", "package", "product", "platform", "cardType", "deduction", "sim", "price", "paid"]) assert.ok(r.data.errors[k], `error for ${k}`);
  });
  it("checks the card type, deduction, paid amount and price", async () => {
    assert.equal((await a("POST", "/api/sales", sale({ cardType: "Weekly Card" }))).data.errors.cardType, "Only a New Card or Lifelong Card can be sold");
    assert.equal((await a("POST", "/api/sales", sale({ deduction: "0.7" }))).data.errors.deduction, "Deduction quantity must be 0, 0.5 or 1");
    assert.match((await a("POST", "/api/sales", sale({ paid: "12000.01" }))).data.errors.paid, /cannot be more than the sale total/);
    assert.equal((await a("POST", "/api/sales", sale({ price: "0" }))).data.errors.price, "Package price must be greater than zero");
    assert.equal((await a("POST", "/api/sales", sale({ customerLink: "magic" }))).data.errors.customerLink, "Customer link must be automatic or manual");
    assert.equal((await a("POST", "/api/sales", sale({ otherExpenses: [{ key: "q", description: "", amount: "5" }] }))).data.errors["other-q-description"], "Describe this expense");
  });
  it("refuses a tracker model that is out of stock, and takes the sold tracker out of stock", async () => {
    const m = (await a("POST", "/api/inventory/products", { category: fx.cat.id, model: `NoStock-${run}` })).data;
    const r = await a("POST", "/api/sales", sale({ productId: m.id }));
    assert.equal(r.status, 422, r.text);
    assert.match(r.data.errors.product, /out of stock/);
    await buy([prow("Product", m.id, "1", "4000", fx.cat.id)]);
    assert.equal((await stockOf("Product", m.id)).quantity, 1);
    assert.equal((await a("POST", "/api/sales", sale({ productId: m.id }))).status, 201);
    assert.equal((await stockOf("Product", m.id)).quantity, 0, "the sale took it out of stock");
    assert.match((await a("POST", "/api/sales", sale({ productId: m.id }))).data.errors.product, /out of stock/, "the last unit cannot be sold twice");
  });
  it("needs a renewal fee for a New Card and records it with the platform expiration date", async () => {
    const missing = await a("POST", "/api/sales", sale({ cardType: "New Card", deduction: "1" }));
    assert.equal(missing.status, 422, missing.text);
    assert.equal(missing.data.errors.renewalFee, "Renewal fee is required");
    const ok = await a("POST", "/api/sales", sale({ cardType: "New Card", deduction: "1", renewalFee: "2500" }));
    assert.equal(ok.status, 201, ok.text);
    assert.equal(ok.data.licence.renewalFeeMinor, 250000);
    assert.ok(ok.data.licence.expirationDate, "expiration date comes from the verified device");
    const lifelong = await a("POST", "/api/sales", sale({ cardType: "Lifelong Card", renewalFee: "999" }));
    assert.equal(lifelong.data.licence.renewalFeeMinor, null, "only a New Card keeps a renewal fee");
  });
  it("sells only New Card (deduction 0 or 1) or Lifelong Card (deduction 0.5 or 1); the deduction is required", async () => {
    const err = async (over: Json) => (await a("POST", "/api/sales", sale({ renewalFee: "1000", ...over }))).data.errors ?? {};
    assert.equal((await err({ cardType: "Annual Card", deduction: "1" })).cardType, "Only a New Card or Lifelong Card can be sold");
    assert.equal((await err({ cardType: "New Card", deduction: "0.5" })).deduction, "For a New Card the deduction must be 0 or 1");
    assert.equal((await err({ cardType: "Lifelong Card", deduction: "0" })).deduction, "For a Lifelong Card the deduction must be 0.5 or 1");
    assert.equal((await err({ cardType: "Lifelong Card", deduction: "" })).deduction, "Select a deduction quantity");
    assert.equal((await err({ type: "Hosting Sale", productId: "", packageId: "", cardType: "Lifelong Card", deduction: "" })).deduction, "Select a deduction quantity", "required on hosting too");
    for (const [cardType, deduction] of [["New Card", "0"], ["New Card", "1"], ["Lifelong Card", "0.5"], ["Lifelong Card", "1"]])
      assert.equal((await a("POST", "/api/sales", sale({ cardType, deduction, renewalFee: "1000" }))).status, 201, `${cardType} ${deduction}`);
  });
  it("accepts only one prepaid SIM service", async () => {
    const r = await a("POST", "/api/sales", sale({ smsReminder: true, autoRecharge: true }));
    assert.equal(r.status, 422, r.text);
    assert.ok(r.data.errors.simService);
  });
  it("rejects a tracker model from another category and an unknown package or technician", async () => {
    const cat = (await a("POST", "/api/inventory/categories", { name: `Fuel ${run}` })).data;
    const m = (await a("POST", "/api/inventory/products", { category: cat.id, model: `LLS-${run}` })).data;
    assert.equal((await a("POST", "/api/sales", sale({ productId: m.id }))).data.errors.product, "Select a valid model");
    assert.equal((await a("POST", "/api/sales", sale({ packageId: "00000000-0000-4000-8000-000000000000" }))).data.errors.package, "Select a valid package");
    assert.equal((await a("POST", "/api/sales", sale({ technicianId: "00000000-0000-4000-8000-000000000000" }))).data.errors.technician, "Select a valid technician");
    assert.equal((await a("POST", "/api/sales", sale({ technicianId: "" }))).status, 201, "technician is optional");
  });
  it("only links a customer automatically when the device contact really matches", async () => {
    // The mock device's contact phone is fixed, so reuse the customer an earlier run created (two would be an ambiguous match).
    const existing = ((await req(A, "GET", "/api/crm/customers")).data as unknown as Json[]).filter((c) => c.phone === "+254700000102");
    const phoneCustomer = existing[0] ?? (await req(A, "POST", "/api/crm/customers", { brandId: BRAND, type: "End User", firstName: "Wanjiru", lastName: "Mwangi", account: `W-${run}`, phone: "0700000102", email: `w${run}@example.com`, location: "Nairobi" })).data;
    const ok = await a("POST", "/api/sales", sale({ imei: MOCK_PHONE_IMEI, customerId: phoneCustomer.id, customerLink: "automatic" }));
    assert.equal(ok.status, 201, ok.text); assert.equal(ok.data.customerLink, "automatic");
    assert.equal(ok.data.vehiclePlate, "KDA 123A"); assert.equal(ok.data.gpsAccount, "wanjiru.mwangi");
    const bad = await a("POST", "/api/sales", sale({ imei: MOCK_PHONE_IMEI, customerId: fx.customer.id, customerLink: "automatic" }));
    assert.equal(bad.status, 422); assert.match(bad.data.errors.customer, /does not match/);
    const manual = await a("POST", "/api/sales", sale({ imei: MOCK_PHONE_IMEI, customerId: fx.customer.id, customerLink: "manual" }));
    assert.equal(manual.status, 201);
  });
  it("links a customer automatically when the device's platform account is their CRM account", async () => {
    const dev = imei(); // the test platform gives this device the customer account "test-<last 6 digits>"
    const owner = (await req(A, "POST", "/api/crm/customers", { brandId: BRAND, type: "End User", firstName: "Account", lastName: "Owner", account: `test-${dev.slice(-6)}`, phone: freshPhone(), email: "", location: "Nairobi" })).data;
    assert.ok(owner?.id, JSON.stringify(owner));
    const ok = await a("POST", "/api/sales", sale({ imei: dev, customerId: owner.id, customerLink: "automatic" }));
    assert.equal(ok.status, 201, ok.text);
    assert.deepEqual([ok.data.customerLink, ok.data.gpsAccount], ["automatic", `test-${dev.slice(-6)}`]);
    const other = await a("POST", "/api/sales", sale({ imei: imei(), customerId: owner.id, customerLink: "automatic" }));
    assert.equal(other.status, 422, "another device's account does not match this customer");
    assert.match(other.data.errors.customer, /does not match/);
  });
  it("keeps names as they were when inventory or packages are renamed later", async () => {
    const pkg = (await a("POST", "/api/settings/packages", { name: `Old ${run}` })).data;
    const s = (await a("POST", "/api/sales", sale({ packageId: pkg.id }))).data;
    await a("PUT", `/api/settings/packages/${pkg.id}`, { name: `New ${run}` });
    assert.equal((await a("GET", `/api/sales/${s.id}`)).data.packageName, `Old ${run}`);
  });
  it("keeps each company's sales private and refuses another company's records", { skip: !B }, async () => {
    const s = (await a("POST", "/api/sales", sale())).data;
    assert.ok(!((await req(B!, "GET", "/api/sales")).data as Json[]).some((x) => x.id === s.id));
    assert.equal((await req(B!, "GET", `/api/sales/${s.id}`)).status, 404);
    const r = await req(B!, "POST", "/api/sales", sale());
    assert.equal(r.status, 422); assert.equal(r.data.errors.customer, "Select a valid customer");
  });
});

describe("records used by sales and purchases", () => {
  it("cannot be deleted from the CRM while a sale or purchase uses them", async () => {
    const c = (await req(A, "POST", "/api/crm/customers", { brandId: BRAND, type: "End User", firstName: "Used", lastName: "Customer", account: `U-${run}`, phone: freshPhone(), email: freshEmail("used"), location: "Nairobi" })).data;
    const sup = (await req(A, "POST", "/api/crm/suppliers", { type: "Individual", fullName: `Used Supplier ${runL}`, phone: "0711999777", email: `us${run}@example.com`, location: "Nairobi" })).data;
    assert.equal((await a("POST", "/api/sales", sale({ customerId: c.id }))).status, 201);
    assert.equal((await a("POST", "/api/purchases", purchaseBody({ supplierId: sup.id, rows: [prow("SIM Card", fx.psim.id, "1", "1")] }))).status, 201);
    for (const path of [`/api/crm/customers/${c.id}`, `/api/crm/suppliers/${sup.id}`]) {
      const r = await a("DELETE", path);
      assert.equal(r.status, 409, path);
      assert.match(r.data.error, /used by other records/);
    }
    assert.equal((await req(A, "GET", `/api/crm/customers/${c.id}`)).status, 200, "the customer is still there");
  });
});

describe("hosting sales", () => {
  it("records a hosting sale with no tracker; deduction may be empty (0) and costs reflect it", async () => {
    const r = await a("POST", "/api/sales", sale({ type: "Hosting Sale", productId: "", packageId: "", cardType: "New Card", deduction: "0", renewalFee: "1000", price: "2000", paid: "2000", otherExpenses: [], installation: "", transport: "", commission: "" }));
    assert.equal(r.status, 201, r.text);
    assert.equal(r.data.type, "Hosting Sale"); assert.equal(r.data.tracker, null);
    assert.equal(r.data.packageName, "Hosting"); assert.equal(r.data.licence.deduction, 0);
    assert.deepEqual(r.data.costMinor, { tracker: 0, sim: 10_000, licence: 0 });
    assert.equal(r.data.profitMinor, 200_000 - 10_000);
  });
  it("deducts the SIM card only when asked, and offers airtime services for any SIM", async () => {
    const host = (over: Json) => sale({ type: "Hosting Sale", productId: "", packageId: "", cardType: "New Card", deduction: "0", renewalFee: "1000", price: "2000", paid: "0", ...over });
    const sim = await newSim(`HostSim ${run}`, 1);
    const own = await a("POST", "/api/sales", host({ simId: sim.id, deductSim: false }));
    assert.equal(own.status, 201, own.text);
    assert.equal(own.data.sim.deducted, false);
    assert.equal((await stockOf("SIM Card", sim.id)).quantity, 1, "customer's own SIM: stock unchanged");
    const taken = await a("POST", "/api/sales", host({ simId: sim.id, deductSim: true }));
    assert.equal(taken.data.sim.deducted, true);
    assert.equal((await stockOf("SIM Card", sim.id)).quantity, 0);
    assert.match((await a("POST", "/api/sales", host({ simId: sim.id, deductSim: true }))).data.errors.sim, /out of stock/);
    assert.equal((await a("POST", "/api/sales", host({ simId: sim.id, deductSim: false }))).status, 201, "an out-of-stock SIM can still be recorded when not deducted");
    const iot = (await a("POST", "/api/inventory/sim-cards", { name: `IoT ${run}`, type: "Local IoT" })).data;
    await buy([prow("SIM Card", iot.id, "5", "100")]);
    const iotOwn = await a("POST", "/api/sales", host({ simId: iot.id, autoRecharge: true, deductSim: false }));
    assert.equal(iotOwn.data.sim.autoRecharge, false, "IoT SIMs never get an airtime service");
    const post = (await a("POST", "/api/inventory/sim-cards", { name: `Post ${run}`, type: "Postpaid" })).data;
    assert.equal((await a("POST", "/api/sales", host({ simId: post.id, smsReminder: true, deductSim: false }))).data.sim.smsReminder, true, "hosting: airtime service for non-IoT SIMs");
    assert.equal(iotOwn.data.sim.iotBilling, false, "hosting IoT SIM not from stock: not added to IoT billing");
    const iotStock = await a("POST", "/api/sales", host({ simId: iot.id, deductSim: true }));
    assert.equal(iotStock.data.sim.iotBilling, true, "hosting IoT SIM from stock: added to IoT billing");
    const pkgIot = await a("POST", "/api/sales", sale({ simId: iot.id, autoRecharge: true }));
    assert.equal(pkgIot.data.sim.autoRecharge, false, "package sale: prepaid SIMs only");
    assert.equal(pkgIot.data.sim.iotBilling, true, "package sale always deducts, so an IoT SIM is always billed");
  });
  it("still needs a verified IMEI and a SIM card", async () => {
    const r = await a("POST", "/api/sales", sale({ type: "Hosting Sale", productId: "", simId: "", imei: "1" }));
    assert.ok(r.data.errors.imei && r.data.errors.sim);
  });
});

describe("retailer sales", () => {
  const pl = (productId: string, quantity: string, unitPrice: string) => ({ key: `p${seq++}`, categoryId: fx.cat.id, productId, quantity, unitPrice });
  const cl = (platformId: string, cardType: string, quantity: string, unitPrice: string) => ({ key: `c${seq++}`, platformId, cardType, quantity, unitPrice });
  const rs = (over: Json = {}) => ({ type: "Retailer Sale", clientKey: key(), customerId: fx.customer.id, productLines: [], cardLines: [], paid: "0", ...over });

  it("records product and card lines with costs, profit and totals worked out by the server", async () => {
    const r = await a("POST", "/api/sales", rs({ productLines: [pl(fx.tracker.id, "3", "6000"), { key: "blank", categoryId: "", productId: "", quantity: "", unitPrice: "" }], cardLines: [cl(fx.platform.id, "New Card", "5", "1500")], paid: "1000" }));
    assert.equal(r.status, 201, r.text);
    const s = r.data;
    assert.equal(s.productLines.length, 1, "the blank line is ignored");
    assert.equal(s.totalMinor, 3 * 600000 + 5 * 150000);
    assert.equal(s.costMinor, 3 * 500000 + 5 * 100000);
    assert.equal(s.profitMinor, s.totalMinor - s.costMinor);
    assert.deepEqual(s.costMissing, []);
    assert.equal(s.productLines[0].lineTotalMinor, 1_800_000);
    assert.equal(s.productLines[0].unitCostMinor, 500000);
    assert.equal(s.cardLines[0].cardType, "New Card");
    assert.deepEqual(((await a("GET", "/api/sales")).data as Json[]).find((x) => x.id === s.id), s);
  });
  it("takes the platform cards sold out of stock and refuses more than is in stock", async () => {
    const plat = (await a("POST", "/api/inventory/platforms", { name: `Cards ${run}` })).data;
    await buy([prow("Platform", plat.id, "3", "100"), prow("Platform", plat.id, "4", "150", "", "New Card")]);
    assert.equal((await stockOf("Platform", plat.id, "Annual Card")).latestPriceMinor, 10000);
    assert.equal((await stockOf("Platform", plat.id, "New Card")).latestPriceMinor, 15000, "buying price per card type");
    const lines = [cl(plat.id, "Annual Card", "2", "500"), cl(plat.id, "Annual Card", "2", "500")];
    const over = await a("POST", "/api/sales", rs({ cardLines: lines }));
    assert.equal(over.status, 422, over.text);
    assert.match(over.data.errors[`c-${lines[1].key}-quantity`], /Only 3/);
    const sold = await a("POST", "/api/sales", rs({ cardLines: [cl(plat.id, "Annual Card", "3", "500"), cl(plat.id, "New Card", "1", "600")] }));
    assert.equal(sold.status, 201, sold.text);
    assert.deepEqual(sold.data.cardLines.map((l: Json) => l.unitCostMinor), [10000, 15000], "each line costs its card type's buying price");
    assert.equal((await stockOf("Platform", plat.id, "Annual Card")).quantity, 0);
    assert.equal((await stockOf("Platform", plat.id, "New Card")).quantity, 3);
    assert.equal((await stockOf("Platform", plat.id)).quantity, 3, "platform total");
  });
  it("takes the products sold out of stock", async () => {
    const before = (await stockOf("Product", fx.tracker.id)).quantity;
    assert.equal((await a("POST", "/api/sales", rs({ productLines: [pl(fx.tracker.id, "2", "6000")] }))).status, 201);
    assert.equal((await stockOf("Product", fx.tracker.id)).quantity, before - 2);
  });
  it("refuses more than is in stock, across lines of the same product", async () => {
    const m = (await a("POST", "/api/inventory/products", { category: fx.cat.id, model: `RNC-${run}` })).data;
    const none = await a("POST", "/api/sales", rs({ productLines: [pl(m.id, "1", "100")] }));
    assert.equal(none.status, 422, none.text);
    await buy([prow("Product", m.id, "3", "50", fx.cat.id)]);
    const lines = [pl(m.id, "2", "100"), pl(m.id, "2", "100")];
    const over = await a("POST", "/api/sales", rs({ productLines: lines }));
    assert.equal(over.status, 422, over.text);
    assert.match(over.data.errors[`p-${lines[1].key}-quantity`], /Only 3/);
    assert.equal((await a("POST", "/api/sales", rs({ productLines: [pl(m.id, "3", "100")] }))).status, 201);
  });
  it("needs at least one filled line and a valid customer, quantity, price and card type", async () => {
    assert.equal((await a("POST", "/api/sales", rs())).data.errors.items, "Add at least one product or platform card");
    const bad = await a("POST", "/api/sales", rs({ customerId: "", productLines: [{ key: "a", categoryId: fx.cat.id, productId: fx.tracker.id, quantity: "0", unitPrice: "0" }], cardLines: [{ key: "b", platformId: fx.platform.id, cardType: "Weekly", quantity: "1", unitPrice: "5" }] }));
    for (const k of ["customer", "p-a-quantity", "p-a-price", "c-b-cardType"]) assert.ok(bad.data.errors[k], k);
    assert.match((await a("POST", "/api/sales", rs({ productLines: [pl(fx.tracker.id, "1", "10")], paid: "10.01" }))).data.errors.paid, /cannot be more than the sale total/);
  });
  it("answers a repeated submit with the sale already saved", async () => {
    const body = rs({ productLines: [pl(fx.tracker.id, "1", "10")] });
    const one = await a("POST", "/api/sales", body); const two = await a("POST", "/api/sales", body);
    assert.equal(one.status, 201); assert.equal(two.status, 200); assert.equal(one.data.id, two.data.id);
  });
  it("requires a valid sale type", async () => {
    assert.equal((await a("POST", "/api/sales", { type: "Gift" })).status, 422);
    assert.equal((await a("POST", "/api/sales", {})).status, 422);
  });
});

describe("brands", { skip: !B }, () => {
  const b = (m: string, p: string, body?: unknown) => req(B!, m, p, body);
  const person = (over: Json = {}) => ({ type: "End User", firstName: "Brand", lastName: `Tester${runL}`, account: `BR-${run}${seq++}`, phone: freshPhone(), email: freshEmail("brand"), location: "Nairobi", ...over });
  it("starts every company with Protrack and Kentracks", async () => {
    const list = (await a("GET", "/api/settings/brands")).data as Json[];
    const names = list.map((x) => x.name);
    assert.ok(names.includes("Protrack") && names.includes("Kentracks"), names.join());
    assert.equal(new Set(names).size, names.length);
  });
  it("tags customers with a brand, shows its name, and follows a rename", async () => {
    const brands = (await a("GET", "/api/settings/brands")).data as Json[];
    const proTrack = brands.find((x) => x.name === "Protrack")!;
    const kentracks = brands.find((x) => x.name === "Kentracks")!;
    const made = await a("POST", "/api/crm/customers", person({ brandId: proTrack.id }));
    assert.equal(made.status, 201, made.text);
    assert.equal(made.data.brandId, proTrack.id);
    assert.equal(made.data.brandName, "Protrack");
    const id = made.data.id as string;
    // an update that does not mention the brand keeps it
    const kept = await a("PUT", `/api/crm/customers/${id}`, { ...person({ account: made.data.account }), location: "Thika" });
    assert.equal(kept.status, 200, kept.text);
    assert.equal(kept.data.brandName, "Protrack");
    const moved = await a("PUT", `/api/crm/customers/${id}`, { ...person({ account: made.data.account, brandId: kentracks.id }) });
    assert.equal(moved.data.brandName, "Kentracks");
    const listed = ((await a("GET", "/api/crm/customers")).data as Json[]).find((x) => x.id === id)!;
    assert.equal(listed.brandName, "Kentracks");
    // a brand can be created, renamed, and customers follow the new name
    const nb = await a("POST", "/api/settings/brands", { name: `Brand ${run}` });
    assert.equal(nb.status, 201, nb.text);
    const own = await a("PUT", `/api/crm/customers/${id}`, person({ account: made.data.account, brandId: nb.data.id }));
    assert.equal(own.data.brandName, `Brand ${run}`);
    const renamed = await a("PUT", `/api/settings/brands/${nb.data.id}`, { name: `Renamed ${run}` });
    assert.equal(renamed.status, 200, renamed.text);
    assert.equal(((await a("GET", `/api/crm/customers/${id}`)).data as Json).brandName, `Renamed ${run}`);
    // a brand cannot be cleared
    const cleared = await a("PUT", `/api/crm/customers/${id}`, person({ account: made.data.account, brandId: "" }));
    assert.equal(cleared.status, 422, cleared.text);
    assert.equal(cleared.data.errors.brandId, "Select a brand");
  });
  it("requires a brand on every customer", async () => {
    for (const missing of [undefined, "", null]) {
      const body = person(); delete (body as Json).brandId;
      const r = await a("POST", "/api/crm/customers", missing === undefined ? body : { ...body, brandId: missing });
      assert.equal(r.status, 422, r.text);
      assert.equal(r.data.errors.brandId, "Select a brand");
    }
  });
  it("refuses duplicate, empty, invalid and other companies' brands", async () => {
    assert.equal((await a("POST", "/api/settings/brands", { name: "  protrack " })).status, 422);
    assert.equal((await a("POST", "/api/settings/brands", { name: "" })).status, 422);
    assert.equal((await a("POST", "/api/settings/brands", { name: "x".repeat(41) })).status, 422);
    assert.equal((await a("POST", "/api/settings/brands", { name: "Ok", extra: 1 })).status, 422);
    const mine = (await a("GET", "/api/settings/brands")).data as Json[];
    const theirs = (await b("GET", "/api/settings/brands")).data as Json[];
    assert.ok(!theirs.some((t) => mine.some((m) => m.id === t.id)), "companies never share brand rows");
    const foreign = await a("POST", "/api/crm/customers", person({ brandId: theirs[0].id }));
    assert.equal(foreign.status, 422);
    assert.ok(foreign.data.errors.brandId);
    assert.equal((await a("POST", "/api/crm/customers", person({ brandId: "nope" }))).status, 422);
    assert.equal((await b("PUT", `/api/settings/brands/${mine[0].id}`, { name: "Hijack" })).status, 404);
    assert.equal((await a("PUT", `/api/settings/brands/${mine[0].id}`, { name: mine[1].name })).status, 422);
  });
});

describe("sale history (paged)", () => {
  it("pages newest first without repeats, filters, searches and totals in the database", async () => {
    const first = await a("GET", "/api/sales/history?limit=5");
    assert.equal(first.status, 200, first.text);
    assert.ok(first.data.items.length <= 5);
    assert.ok(first.data.totals.count >= first.data.items.length);
    const ids = new Set(first.data.items.map((s: Json) => s.id));
    if (first.data.nextCursor) {
      const second = await a("GET", `/api/sales/history?limit=5&cursor=${first.data.nextCursor}`);
      assert.equal(second.status, 200);
      assert.equal(second.data.totals, undefined, "totals come with the first page only");
      for (const s of second.data.items) assert.ok(!ids.has(s.id), "no sale appears on two pages");
      assert.ok(new Date(second.data.items[0].createdAt) <= new Date(first.data.items.at(-1).createdAt), "newest first");
    }
    const retail = await a("GET", "/api/sales/history?type=Retailer%20Sale&limit=100");
    assert.ok(retail.data.items.every((s: Json) => s.type === "Retailer Sale"));
    const pkgSale = (await a("GET", "/api/sales/history?type=Package%20Sale&limit=1")).data.items[0];
    const byImei = await a("GET", `/api/sales/history?q=${encodeURIComponent(pkgSale.imei)}`);
    assert.equal(byImei.status, 200);
    assert.ok(byImei.data.items.length >= 1);
    for (const bad of ["type=Gift", "cursor=not-a-cursor"]) assert.equal((await a("GET", `/api/sales/history?${bad}`)).status, 422, bad);
    assert.equal((await a("GET", "/api/sales/history?q=%25_%5C")).status, 200, "LIKE wildcards are treated as text");
  });
  it("never shows another company's sales", async () => {
    if (!B) return;
    const mine = new Set(((await a("GET", "/api/sales/history?limit=100")).data.items as Json[]).map((s) => s.id));
    const theirs = (await req(B, "GET", "/api/sales/history?limit=100")).data.items as Json[];
    assert.ok(theirs.every((s) => !mine.has(s.id)));
  });
});

describe("billing (customer vehicles)", () => {
  it("lists the customer's devices with SIM, package and GPS details, and keeps tenants apart", async () => {
    const s = await a("POST", "/api/sales", sale({ cardType: "New Card", deduction: "1", renewalFee: "2500" }));
    assert.equal(s.status, 201, s.text);
    const r = await a("GET", `/api/billing?q=${s.data.imei}`);
    assert.equal(r.status, 200, r.text);
    assert.equal(r.data.items.length, 1);
    const c = r.data.items[0];
    assert.equal(c.id, fx.customer.id);
    const v = (c.vehicles as Json[]).find((x) => x.imei === s.data.imei)!;
    assert.ok(v, "the sold device is listed");
    assert.equal(v.packageName, s.data.packageName);
    assert.equal(v.cardType, "New Card");
    assert.equal(v.renewalFeeMinor, 250000);
    assert.equal(v.simType, "Prepaid");
    assert.ok(v.deviceModel && v.status && v.activationDate && v.checkedAt, "GPS details were stored at sale");
    assert.equal(v.technicianName, fx.tech.name);
    assert.match(v.expirationDate, /^\d{4}-\d{2}-\d{2}$/);
    if (B) {
      const theirs = await req(B, "GET", `/api/billing?q=${s.data.imei}`);
      assert.equal(theirs.status, 200);
      assert.equal(theirs.data.items.length, 0, "company B cannot see company A's devices");
      const sync = await req(B, "POST", "/api/billing/sync", { customerIds: [fx.customer.id], force: true });
      assert.equal(sync.status, 200);
      assert.deepEqual([sync.data.items, sync.data.checked], [[], 0], "company B cannot refresh company A's devices");
    }
  });

  it("a device sold again belongs to its newest sale only", async () => {
    const dev = imei();
    assert.equal((await a("POST", "/api/sales", sale({ imei: dev }))).status, 201);
    const second = await a("POST", "/api/sales", sale({ imei: dev, cardType: "New Card", deduction: "1", renewalFee: "3000" }));
    assert.equal(second.status, 201, second.text);
    const r = await a("GET", `/api/billing?q=${dev}`);
    const all = (r.data.items as Json[]).flatMap((c) => c.vehicles as Json[]).filter((v) => v.imei === dev);
    assert.equal(all.length, 1);
    assert.equal(all[0].saleId, second.data.id);
    assert.equal(all[0].renewalFeeMinor, 300000);
  });

  it("filters, validates and refreshes", async () => {
    assert.equal((await a("GET", "/api/billing?filter=Nope")).status, 422);
    for (const f of ["All", "Online", "Offline", "Expiring soon", "Expired", "Unknown"]) {
      const r = await a("GET", `/api/billing?filter=${encodeURIComponent(f)}&limit=5`);
      assert.equal(r.status, 200, r.text);
      assert.ok(r.data.items.length <= 5);
      for (const k of ["customers", "vehicles", "online", "offline", "expiringSoon", "expired", "unknown", "renewalsDue", "renewalDueMinor"]) assert.equal(typeof r.data.totals[k], "number", k);
    }
    assert.equal((await a("POST", "/api/billing/sync", { customerIds: ["x"] })).status, 422);
    assert.equal((await a("POST", "/api/billing/sync", { customerIds: [] })).status, 422);
    const r = await a("POST", "/api/billing/sync", { customerIds: [fx.customer.id], force: true });
    assert.equal(r.status, 200, r.text);
    assert.ok(r.data.checked >= 1);
  });

  it("edits the renewal fee where one applies, and only for the company's own devices", async () => {
    const nc = await a("POST", "/api/sales", sale({ cardType: "New Card", deduction: "1", renewalFee: "2500" }));
    const ll = await a("POST", "/api/sales", sale({}));
    assert.equal(nc.status, 201, nc.text);
    assert.equal(ll.status, 201, ll.text);
    const path = (id: string) => `/api/billing/renewal-fee/${id}`;

    const ok = await a("PUT", path(nc.data.id), { renewalFee: "3,250.50" });
    assert.equal(ok.status, 200, ok.text);
    assert.equal(ok.data.id, fx.customer.id);
    assert.equal((ok.data.vehicles as Json[]).find((v) => v.saleId === nc.data.id)!.renewalFeeMinor, 325050);
    const check = await a("GET", `/api/billing?q=${nc.data.imei}`);
    assert.equal(check.data.items[0].vehicles.find((v: Json) => v.saleId === nc.data.id).renewalFeeMinor, 325050, "saved");

    for (const bad of ["", "-5", "abc", "1.234"]) {
      const r = await a("PUT", path(nc.data.id), { renewalFee: bad });
      assert.equal(r.status, 422, `${bad}: ${r.text}`);
      assert.ok(r.data.errors.renewalFee);
    }
    assert.equal((await a("PUT", path(nc.data.id), { renewalFee: "100", extra: 1 })).status, 422);
    const life = await a("PUT", path(ll.data.id), { renewalFee: "100" });
    assert.equal(life.status, 422);
    assert.match(life.data.errors.renewalFee, /Lifelong/);
    assert.equal((await a("PUT", path("00000000-0000-4000-8000-000000000000"), { renewalFee: "100" })).status, 404);
    assert.equal((await a("PUT", path("nope"), { renewalFee: "100" })).status, 404);
    if (B) {
      assert.equal((await req(B, "PUT", path(nc.data.id), { renewalFee: "1" })).status, 404, "company B cannot change company A's fee");
      const after = await a("GET", `/api/billing?q=${nc.data.imei}`);
      assert.equal(after.data.items[0].vehicles.find((v: Json) => v.saleId === nc.data.id).renewalFeeMinor, 325050);
    }
  });

  it("needs a session", { skip: !UNAUTH }, async () => {
    assert.equal((await req(UNAUTH!, "GET", "/api/billing")).status, 401);
    assert.equal((await req(UNAUTH!, "POST", "/api/billing/sync", { customerIds: [] })).status, 401);
    assert.equal((await req(UNAUTH!, "PUT", "/api/billing/renewal-fee/00000000-0000-4000-8000-000000000000", { renewalFee: "1" })).status, 401);
  });
});

describe("IoT SIMs (Billing → IoT SIM)", () => {
  const iotFx: Json = {};
  const host = (over: Json) => sale({ type: "Hosting Sale", productId: "", packageId: "", cardType: "New Card", deduction: "0", renewalFee: "1000", price: "2000", paid: "0", ...over });
  const oneYearAfter = (iso: string) => { const d = new Date(new Date(iso).getTime() + 3 * 3600_000); return `${d.getUTCFullYear() + 1}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`; };
  const findSim = async (imeiValue: string) => {
    const r = await a("GET", `/api/iot-sims/clients?q=${imeiValue}`);
    assert.equal(r.status, 200, r.text);
    return (r.data.items as Json[]).flatMap((c) => c.sims as Json[]).find((s) => s.imei === imeiValue);
  };

  before(async () => {
    iotFx.group = (await a("POST", "/api/inventory/sim-cards", { name: `Safaricom ${run}`, type: "International IoT" })).data;
    await buy([prow("SIM Card", iotFx.group.id, "20", "100")]);
    iotFx.sale = (await a("POST", "/api/sales", sale({ simId: iotFx.group.id, deductSim: true }))).data;
    iotFx.sale2 = (await a("POST", "/api/sales", sale({ simId: iotFx.group.id, deductSim: true }))).data;
    assert.ok(iotFx.sale?.id && iotFx.sale2?.id, "IoT sales were made");
  });

  it("lists sales that took an IoT SIM from stock, grouped by the SIM card item, with a default yearly expiry", async () => {
    const s = await findSim(iotFx.sale.imei);
    assert.ok(s, "the IoT sale is listed");
    assert.equal(s!.simCardId, iotFx.group.id);
    assert.equal(s!.groupName, iotFx.group.name);
    assert.equal(s!.simType, "International IoT");
    assert.equal(s!.renewalFeeMinor, null);
    assert.equal(s!.suspended, false);
    assert.equal(s!.expiryDate, oneYearAfter(iotFx.sale.createdAt));
    const g = ((await a("GET", "/api/iot-sims/groups")).data.groups as Json[]).find((x) => x.simCardId === iotFx.group.id)!;
    assert.equal(g.sims, 2);
    assert.equal(g.billingPeriod, "Monthly");
    const page = await a("GET", `/api/iot-sims/groups/${iotFx.group.id}/sims`);
    assert.equal(page.status, 200, page.text);
    assert.equal(page.data.items.length, 2);
  });

  it("leaves out IoT SIMs that were not taken from stock, and non-IoT SIMs", async () => {
    const own = await a("POST", "/api/sales", host({ simId: iotFx.group.id, deductSim: false }));
    assert.equal(own.status, 201, own.text);
    assert.equal(await findSim(own.data.imei), undefined, "customer's own IoT SIM is not billed");
    const prepaid = await a("POST", "/api/sales", sale({}));
    assert.equal(await findSim(prepaid.data.imei), undefined, "a prepaid SIM is not an IoT SIM");
    const groups = (await a("GET", "/api/iot-sims/groups")).data.groups as Json[];
    assert.ok(groups.every((g) => g.type === "International IoT" || g.type === "Local IoT"));
  });

  it("edits the renewal fee and expiry, with validation", async () => {
    const path = `/api/iot-sims/${iotFx.sale.id}`;
    for (const [body, field] of [[{ renewalFee: "", expiryDate: "2027-01-01" }, "renewalFee"], [{ renewalFee: "-1", expiryDate: "2027-01-01" }, "renewalFee"],
      [{ renewalFee: "1500", expiryDate: "2027-02-30" }, "expiryDate"], [{ renewalFee: "1500", expiryDate: "" }, "expiryDate"], [{ renewalFee: "1500", expiryDate: "1999-01-01" }, "expiryDate"]] as const) {
      const r = await a("PUT", path, body);
      assert.equal(r.status, 422, `${JSON.stringify(body)}: ${r.text}`);
      assert.ok(r.data.errors[field], field);
    }
    assert.equal((await a("PUT", path, { renewalFee: "1500", expiryDate: "2027-01-01", x: 1 })).status, 422);
    const ok = await a("PUT", path, { renewalFee: "1,500", expiryDate: "2026-01-15" });
    assert.equal(ok.status, 200, ok.text);
    assert.equal(ok.data.renewalFeeMinor, 150000);
    assert.equal(ok.data.expiryDate, "2026-01-15");
    const due = (await a("GET", "/api/iot-sims/renewals")).data;
    assert.ok((due.due as Json[]).some((s) => s.saleId === iotFx.sale.id), "an expired SIM is listed under renewals");
    assert.ok(due.expired >= 1);
  });

  it("records a renewal: moves the expiry forward, keeps history, refuses going backwards", async () => {
    const path = `/api/iot-sims/${iotFx.sale.id}/renew`;
    const back = await a("POST", path, { amount: "1500", newExpiry: "2026-01-15", note: "" });
    assert.equal(back.status, 422);
    assert.match(back.data.errors.newExpiry, /after the current one/);
    assert.equal((await a("POST", path, { amount: "abc", newExpiry: "2027-01-15", note: "" })).status, 422);
    assert.equal((await a("POST", path, { amount: "1500", newExpiry: "2027-01-15", note: "x".repeat(301) })).status, 422);
    const r = await a("POST", path, { amount: "1500", newExpiry: "2027-01-15", note: "M-Pesa QX1" });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.data.expiryDate, "2027-01-15");
    const hist = await a("GET", `/api/iot-sims/${iotFx.sale.id}/renewals`);
    assert.equal(hist.status, 200);
    assert.equal(hist.data.length, 1);
    assert.deepEqual([hist.data[0].amountMinor, hist.data[0].previousExpiry, hist.data[0].newExpiry, hist.data[0].note], [150000, "2026-01-15", "2027-01-15", "M-Pesa QX1"]);
    const due = (await a("GET", "/api/iot-sims/renewals")).data;
    assert.ok(!(due.due as Json[]).some((s) => s.saleId === iotFx.sale.id), "no longer due");
    assert.ok((due.recent as Json[]).some((x) => x.saleId === iotFx.sale.id));
    // A renewal on a line that was never edited starts from its default expiry.
    const first = await findSim(iotFx.sale2.imei);
    const r2 = await a("POST", `/api/iot-sims/${iotFx.sale2.id}/renew`, { amount: "900", newExpiry: `${Number(first!.expiryDate.slice(0, 4)) + 1}${first!.expiryDate.slice(4)}`, note: "" });
    assert.equal(r2.status, 200, r2.text);
  });

  it("suspends and reactivates; a suspended SIM cannot be renewed and is left out of renewals", async () => {
    const s = await a("POST", `/api/iot-sims/${iotFx.sale.id}/suspend`, { suspended: true });
    assert.equal(s.status, 200, s.text);
    assert.equal(s.data.suspended, true);
    const r = await a("POST", `/api/iot-sims/${iotFx.sale.id}/renew`, { amount: "1500", newExpiry: "2028-01-15", note: "" });
    assert.equal(r.status, 422);
    assert.match(r.data.errors.newExpiry, /suspended/);
    assert.equal((await a("POST", `/api/iot-sims/${iotFx.sale.id}/suspend`, { suspended: "yes" })).status, 422);
    const g = ((await a("GET", "/api/iot-sims/groups")).data.groups as Json[]).find((x) => x.simCardId === iotFx.group.id)!;
    assert.deepEqual([g.active, g.suspended], [1, 1]);
    const back = await a("POST", `/api/iot-sims/${iotFx.sale.id}/suspend`, { suspended: false });
    assert.equal(back.data.suspended, false);
  });

  it("records the provider bill per month, shares it across active SIMs, and works out profit per year", async () => {
    const path = `/api/iot-sims/groups/${iotFx.group.id}/bills`;
    for (const [body, field] of [[{ period: "2026-13", amount: "100", note: "" }, "period"], [{ period: "", amount: "100", note: "" }, "period"], [{ period: "2026-10", amount: "", note: "" }, "amount"]] as const) {
      const r = await a("POST", path, body);
      assert.equal(r.status, 422, r.text);
      assert.ok(r.data.errors[field]);
    }
    const b1 = await a("POST", path, { period: "2026-09", amount: "100", note: "" });
    assert.equal(b1.status, 200, b1.text);
    const b2 = await a("POST", path, { period: "2026-10", amount: "200", note: "INV-1" });
    assert.equal(b2.data.lines, 2);
    const again = await a("POST", path, { period: "2026-10", amount: "250", note: "INV-1b" });
    assert.equal(again.status, 200);
    const list = (await a("GET", path)).data as Json[];
    assert.deepEqual(list.map((b) => [b.period, b.amountMinor]), [["2026-10", 25000], ["2026-09", 10000]], "same month replaced, newest first");
    const g = ((await a("GET", "/api/iot-sims/groups")).data.groups as Json[]).find((x) => x.simCardId === iotFx.group.id)!;
    assert.equal(g.perLineMinor, 12500);
    const sim = await findSim(iotFx.sale.imei);
    assert.equal(sim!.annualCostMinor, 12500 * 12, "monthly bill share, per year");
    assert.equal(sim!.profitMinor, 150000 - 150000);
    // Yearly billing: the share is not multiplied.
    assert.equal((await a("PUT", `/api/iot-sims/groups/${iotFx.group.id}`, { billingPeriod: "Yearly" })).status, 200);
    assert.equal((await findSim(iotFx.sale.imei))!.annualCostMinor, 12500);
    assert.equal((await a("PUT", `/api/iot-sims/groups/${iotFx.group.id}`, { billingPeriod: "Weekly" })).status, 422);
    const ov = await a("GET", "/api/iot-sims/overview");
    assert.equal(ov.status, 200);
    assert.ok((ov.data.recentBills as Json[]).some((b) => b.simCardId === iotFx.group.id));
  });

  it("keeps companies apart and rejects unknown ids", async () => {
    const none = "00000000-0000-4000-8000-000000000000";
    assert.equal((await a("PUT", `/api/iot-sims/${none}`, { renewalFee: "1", expiryDate: "2027-01-01" })).status, 404);
    assert.equal((await a("GET", `/api/iot-sims/groups/${fx.sim.id}/sims`)).status, 404, "a prepaid SIM card is not a group");
    assert.equal((await a("GET", "/api/iot-sims/groups/nope/sims")).status, 404);
    if (!B) return;
    assert.equal((await req(B, "GET", `/api/iot-sims/clients?q=${iotFx.sale.imei}`)).data.items.length, 0);
    assert.equal((await req(B, "GET", `/api/iot-sims/groups/${iotFx.group.id}/sims`)).status, 404);
    assert.equal((await req(B, "GET", `/api/iot-sims/groups/${iotFx.group.id}/bills`)).status, 404);
    assert.equal((await req(B, "POST", `/api/iot-sims/groups/${iotFx.group.id}/bills`, { period: "2026-10", amount: "1", note: "" })).status, 404);
    assert.equal((await req(B, "PUT", `/api/iot-sims/groups/${iotFx.group.id}`, { billingPeriod: "Monthly" })).status, 404);
    assert.equal((await req(B, "PUT", `/api/iot-sims/${iotFx.sale.id}`, { renewalFee: "1", expiryDate: "2030-01-01" })).status, 404);
    assert.equal((await req(B, "POST", `/api/iot-sims/${iotFx.sale.id}/renew`, { amount: "1", newExpiry: "2030-01-01", note: "" })).status, 404);
    assert.equal((await req(B, "POST", `/api/iot-sims/${iotFx.sale.id}/suspend`, { suspended: true })).status, 404);
    assert.equal((await req(B, "GET", `/api/iot-sims/${iotFx.sale.id}/renewals`)).status, 404);
    assert.ok(((await req(B, "GET", "/api/iot-sims/groups")).data.groups as Json[]).every((g) => g.simCardId !== iotFx.group.id));
    assert.equal((await findSim(iotFx.sale.imei))!.renewalFeeMinor, 150000, "unchanged by company B");
  });

  it("needs a session", { skip: !UNAUTH }, async () => {
    for (const [m, p] of [["GET", "/api/iot-sims/clients"], ["GET", "/api/iot-sims/groups"], ["GET", "/api/iot-sims/overview"], ["GET", "/api/iot-sims/renewals"],
      ["PUT", `/api/iot-sims/${iotFx.sale.id}`], ["POST", `/api/iot-sims/${iotFx.sale.id}/renew`]] as const) {
      assert.equal((await req(UNAUTH!, m, p, m === "GET" ? undefined : {})).status, 401, p);
    }
  });
});

describe("old sales (record only)", () => {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi" }).format(new Date());
  const totals = async () => (await a("GET", "/api/sales/history?limit=1")).data.totals as Json;
  const stockAll = async () => ({
    tracker: (await stockOf("Product", fx.tracker.id)).quantity,
    sim: (await stockOf("SIM Card", fx.sim.id)).quantity,
    licence: (await stockOf("Platform", fx.platform.id, "New Card")).quantity,
  });

  it("records a Package Sale without touching stock, revenue or profit", async () => {
    const before = await totals();
    const stock = await stockAll();
    const r = await a("POST", "/api/sales", sale({ oldSale: true, saleDate: "2025-03-15", cardType: "New Card", deduction: "", renewalFee: "1500", price: "", paid: "", installation: "999", otherExpenses: [] }));
    assert.equal(r.status, 201, r.text);
    assert.equal(r.data.oldSale, true);
    assert.deepEqual([r.data.totalMinor, r.data.paidMinor, r.data.profitMinor], [0, 0, 0]);
    assert.deepEqual(r.data.expensesMinor, { installation: 0, transport: 0, commission: 0, other: [] }, "an old sale records no expenses");
    assert.equal(r.data.licence.deduction, 0);
    assert.equal(r.data.sim.deducted, false);
    assert.deepEqual(r.data.stockTaken, []);
    assert.equal(r.data.licence.renewalFeeMinor, 150000, "the renewal fee is still recorded for billing");
    assert.equal(r.data.createdAt.slice(0, 10), "2026-10-17", "dated on the IMEI activation date from GPSPlatform (the typed date is ignored)");
    assert.deepEqual(await stockAll(), stock, "inventory unchanged");
    const after = await totals();
    assert.deepEqual([after.revenueMinor, after.balanceMinor, after.profitMinor], [before.revenueMinor, before.balanceMinor, before.profitMinor]);
    assert.equal(after.count, before.count + 1);
    assert.equal(after.oldSales, (before.oldSales ?? 0) + 1);
    const view = await a("GET", `/api/sales/${r.data.id}`);
    assert.equal(view.data.oldSale, true);
    // It appears in Billing with its original date as the activation fallback.
    const bill = await a("GET", `/api/billing?q=${r.data.imei}`);
    const v = (bill.data.items[0].vehicles as Json[]).find((x) => x.imei === r.data.imei)!;
    assert.equal(v.saleId, r.data.id);
    assert.equal(v.renewalFeeMinor, 150000);
  });

  it("works even when the items are out of stock, and for a Hosting Sale", async () => {
    const sim = await newSim(`OldSim ${run}`, 0);
    const pkg = await a("POST", "/api/sales", sale({ oldSale: true, saleDate: "2024-01-10", simId: sim.id, deduction: "", price: "", paid: "" }));
    assert.equal(pkg.status, 201, pkg.text);
    const hosting = await a("POST", "/api/sales", sale({ type: "Hosting Sale", productId: "", packageId: "", oldSale: true, saleDate: "2024-02-01", simId: sim.id, deductSim: true, cardType: "New Card", deduction: "", renewalFee: "800", price: "", paid: "" }));
    assert.equal(hosting.status, 201, hosting.text);
    assert.equal(hosting.data.sim.deducted, false, "an old sale never takes the SIM, even if asked");
    assert.equal((await stockOf("SIM Card", sim.id)).quantity, 0);
  });

  it("an IoT SIM on an old sale goes to Billing → IoT SIM with an expiry one year after the original date", async () => {
    const iot = (await a("POST", "/api/inventory/sim-cards", { name: `OldIoT ${run}`, type: "Local IoT" })).data;
    const r = await a("POST", "/api/sales", sale({ oldSale: true, saleDate: "2025-11-05", simId: iot.id, deduction: "", price: "", paid: "" }));
    assert.equal(r.status, 201, r.text);
    assert.equal(r.data.sim.iotBilling, true);
    const c = await a("GET", `/api/iot-sims/clients?q=${r.data.imei}`);
    const s = (c.data.items as Json[]).flatMap((x) => x.sims as Json[]).find((x) => x.imei === r.data.imei)!;
    assert.deepEqual([s.activationDate, s.expiryDate], ["2026-10-17", "2027-10-17"], "activation date from GPSPlatform; expiry a year later");
  });

  it("uses a typed date only when GPSPlatform has no activation date, and checks it", async () => {
    const NO_ACTIVATION = "352090100000053"; // mock device with only a model and plate
    const typed = await a("POST", "/api/sales", sale({ imei: NO_ACTIVATION, oldSale: true, saleDate: "2024-05-20", deduction: "", price: "", paid: "" }));
    assert.equal(typed.status, 201, typed.text);
    assert.equal(typed.data.createdAt.slice(0, 10), "2024-05-20");
    const tomorrow = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
    for (const [saleDate, msg] of [["", /no activation date for this IMEI/], ["2025-02-30", /valid date/], [tomorrow, /future/], ["1999-12-31", /2000/], ["15/03/2025", /valid date/]] as const) {
      const r = await a("POST", "/api/sales", sale({ imei: NO_ACTIVATION, oldSale: true, saleDate, deduction: "", price: "", paid: "" }));
      assert.equal(r.status, 422, `${saleDate}: ${r.text}`);
      assert.match(r.data.errors.saleDate, msg);
    }
    const ok = await a("POST", "/api/sales", sale({ imei: NO_ACTIVATION, oldSale: true, saleDate: today, deduction: "", price: "", paid: "" }));
    assert.equal(ok.status, 201, ok.text);
    assert.equal((await a("POST", "/api/sales", sale({ oldSale: "yes" }))).status, 422, "oldSale must be true or false");
  });

  it("a normal sale still needs price, deduction and stock", async () => {
    const r = await a("POST", "/api/sales", sale({ oldSale: false, price: "", deduction: "" }));
    assert.equal(r.status, 422);
    assert.ok(r.data.errors.price && r.data.errors.deduction);
  });
});

describe("sale payments (Record payment)", () => {
  const P = (id: string) => `/api/sales/${id}/payments`;
  const pay = (id: string, over: Json = {}, base = A) => req(base, "POST", P(id), { amount: "1000", method: "M-Pesa", reference: "", note: "", paidOn: today(), clientKey: key(), ...over });
  const today = () => new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
  const day = (offset: number) => new Date(Date.now() + 3 * 3600_000 + offset * 86_400_000).toISOString().slice(0, 10);
  const balanceTotal = async () => (await a("GET", "/api/sales/history?limit=1")).data.totals.balanceMinor as number;

  it("a sale not paid in full lists what was paid at the sale and its balance", async () => {
    const s = (await a("POST", "/api/sales", sale({ price: "12000", paid: "5000" }))).data;
    const r = await a("GET", P(s.id));
    assert.equal(r.status, 200, r.text);
    assert.deepEqual(r.data, { atSaleMinor: 500000, payments: [], totalMinor: 1200000, paidMinor: 500000, balanceMinor: 700000 });
  });

  it("checks the amount, method and date with the same rules as the form", async () => {
    const s = (await a("POST", "/api/sales", sale({ price: "12000", paid: "5000" }))).data;
    const err = async (over: Json) => (await pay(s.id, over)).data.errors as Json;
    assert.match((await err({ amount: "" })).amount, /required/);
    assert.match((await err({ amount: "0" })).amount, /more than 0/);
    assert.match((await err({ amount: "-5" })).amount, /negative/);
    assert.match((await err({ amount: "7000.01" })).amount, /cannot be more than the balance \(KES 7,000\.00\)/);
    assert.match((await err({ amount: "12.345" })).amount, /2 decimal/);
    assert.match((await err({ method: "" })).method, /Select how it was paid/);
    assert.match((await err({ method: "Bitcoin" })).method, /Select how it was paid/);
    assert.match((await err({ paidOn: day(1) })).paidOn, /future/);
    assert.match((await err({ paidOn: day(-1) })).paidOn, /before the sale/);
    assert.match((await err({ paidOn: "2026-02-30" })).paidOn, /valid date/);
    assert.match((await err({ reference: "x".repeat(61) })).reference, /60/);
    assert.equal((await pay(s.id, { extra: "1" })).status, 422, "unknown fields are refused");
    assert.equal((await a("GET", P(s.id))).data.paidMinor, 500000, "nothing was saved");
  });

  it("records payments until the sale is paid in full, never past it", async () => {
    const s = (await a("POST", "/api/sales", sale({ price: "12000", paid: "5000" }))).data;
    const before = await balanceTotal();
    const k = key();
    const first = await pay(s.id, { amount: "2,000", method: "M-Pesa", reference: "  SJK3H2 ", note: "Second instalment", clientKey: k });
    assert.equal(first.status, 200, first.text);
    assert.equal(first.data.sale.paidMinor, 700000);
    assert.equal(first.data.sale.profitMinor, s.profitMinor, "profit does not change");
    assert.equal(first.data.sale.totalMinor, s.totalMinor, "revenue does not change");
    const p1 = first.data.payments.payments[0];
    assert.deepEqual([p1.amountMinor, p1.method, p1.reference, p1.note, p1.paidOn], [200000, "M-Pesa", "SJK3H2", "Second instalment", today()]);
    assert.ok(p1.recordedBy, "who recorded it");
    assert.deepEqual([first.data.payments.atSaleMinor, first.data.payments.balanceMinor], [500000, 500000]);
    assert.equal(await balanceTotal(), before - 200000, "the outstanding balance in the history drops by the payment");

    const again = await pay(s.id, { amount: "2000", clientKey: k });
    assert.equal(again.status, 200);
    assert.equal(again.data.sale.paidMinor, 700000, "the same form sent twice is saved once");
    assert.equal(again.data.payments.payments.length, 1);

    // Two people paying the rest at the same moment: only one fits in the balance.
    const both = await Promise.all([pay(s.id, { amount: "5000" }), pay(s.id, { amount: "5000" })]);
    assert.deepEqual(both.map((r) => r.status).sort(), [200, 422], both.map((r) => r.text).join(" | "));
    const after = await a("GET", P(s.id));
    assert.deepEqual([after.data.paidMinor, after.data.balanceMinor, after.data.payments.length], [1200000, 0, 2]);
    const full = await a("GET", `/api/sales/${s.id}`);
    assert.equal(full.data.paidMinor, full.data.totalMinor, "paid in full");
    const more = await pay(s.id, { amount: "1" });
    assert.equal(more.status, 422);
    assert.match(more.text, /already paid in full/);
  });

  it("an old sale has nothing to collect; an unknown sale is not found", async () => {
    const sim = await newSim(`PaySim ${run}`, 0);
    const old = (await a("POST", "/api/sales", sale({ oldSale: true, saleDate: "2024-03-01", simId: sim.id, deduction: "", price: "", paid: "" }))).data;
    const r = await pay(old.id, { amount: "1" });
    assert.equal(r.status, 422);
    assert.match(r.text, /old sale/i);
    assert.equal((await a("GET", P("00000000-0000-4000-8000-000000000000"))).status, 404);
    assert.equal((await pay("00000000-0000-4000-8000-000000000000")).status, 404);
    assert.equal((await a("GET", P("not-a-uuid"))).status, 404);
  });

  it("another company cannot see or pay this company's sales", { skip: !B }, async () => {
    const s = (await a("POST", "/api/sales", sale({ price: "12000", paid: "0" }))).data;
    assert.equal((await req(B!, "GET", P(s.id))).status, 404);
    assert.equal((await pay(s.id, { amount: "100" }, B!)).status, 404);
    assert.equal((await a("GET", P(s.id))).data.paidMinor, 0, "untouched");
  });

  it("needs a session", { skip: !UNAUTH }, async () => {
    assert.equal((await req(UNAUTH!, "GET", P("00000000-0000-4000-8000-000000000000"))).status, 401);
    assert.equal((await req(UNAUTH!, "POST", P("00000000-0000-4000-8000-000000000000"), {})).status, 401);
  });
});
