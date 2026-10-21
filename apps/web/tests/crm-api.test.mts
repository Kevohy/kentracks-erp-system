/**
 * Integration tests for the CRM API. They need a running server and a migrated LOCAL database:
 *
 *   CRM_TEST_BASE_URL        a server; signed in as the user of company A (CRM_TEST_EMAIL / CRM_TEST_PASSWORD)  [required]
 *   CRM_TEST_OTHER_URL       a server; signed in as the user of company B (CRM_TEST_OTHER_EMAIL / _PASSWORD)  [optional]
 *   CRM_TEST_UNAUTH_URL      a server that gets NO session (every endpoint must answer 401)                [optional]
 *   CRM_TEST_BROKEN_DB_URL   a server whose database cannot be reached (safe errors)                       [optional]
 *
 * See apps/web/tests/README.md. Every record created here is deleted again.
 */
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { e164, freshEmail, freshPhone } from "./contacts.mts";
import { makeSessions } from "./session.mts";

const A = process.env.CRM_TEST_BASE_URL;
const B = process.env.CRM_TEST_OTHER_URL;
const UNAUTH = process.env.CRM_TEST_UNAUTH_URL;
const BROKEN = process.env.CRM_TEST_BROKEN_DB_URL;
if (!A) throw new Error("Set CRM_TEST_BASE_URL (see tests/README.md)");
const sessionFor = makeSessions({ a: A, b: B, broken: BROKEN });

type Json = Record<string, unknown>;
async function req(base: string, method: string, path: string, body?: unknown, headers: Record<string, string> = { "Content-Type": "application/json" }) {
  const cookie = await sessionFor(base);
  const sent = { ...(body === undefined ? {} : headers), ...(cookie ? { Cookie: cookie } : {}) };
  const res = await fetch(base + path, { method, headers: sent, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body) });
  const text = await res.text();
  let data: Json | Json[] | null = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* not json */ }
  return { status: res.status, data, text, headers: res.headers };
}
const api = (m: string, p: string, b?: unknown) => req(A, m, p, b);
const run = Date.now().toString(36);
/** Every customer needs a brand (Settings → Brands); a new company starts with Protrack and Kentracks. */
const BRAND = ((await api("GET", "/api/settings/brands")).data as Json[])[0].id as string;
const created: string[] = [];
const track = (path: string, id: unknown) => created.push(`${path}/${id}`);
after(async () => { for (const p of created) await api("DELETE", p); });

const person = (over: Json = {}) => ({ type: "End User", firstName: "Test", lastName: "Person", account: `T-${run}-1`, phone: freshPhone(), email: freshEmail("person"), location: "Nairobi", brandId: BRAND, ...over });
const company = (over: Json = {}) => ({ type: "Company", companyName: "Test Co Ltd", account: `T-${run}-C`, phone: freshPhone(), email: freshEmail("co"), pin: "P000000001A", location: "Mombasa", brandId: BRAND, ...over });

describe("customers", () => {
  const P = "/api/crm/customers";
  it("creates, reads, lists, updates, persists and deletes a person (End User)", async () => {
    const ph = freshPhone();
    const c = await api("POST", P, person({ phone: ph }));
    assert.equal(c.status, 201);
    const row = c.data as Json; track(P, row.id);
    assert.equal(row.name, "Test Person");
    assert.equal(row.firstName, "Test");
    assert.equal(row.phone, e164(ph), "phone is stored as E.164");
    assert.equal(row.pin, undefined);
    assert.equal((await api("GET", `${P}/${row.id}`)).status, 200);
    assert.ok(((await api("GET", P)).data as Json[]).some((x) => x.id === row.id), "appears in the list (persisted)");
    const u = await api("PUT", `${P}/${row.id}`, person({ firstName: "Renamed", location: "Thika" }));
    assert.equal(u.status, 200);
    assert.equal((u.data as Json).name, "Renamed Person");
    assert.equal(((await api("GET", `${P}/${row.id}`)).data as Json).location, "Thika", "update persisted");
    assert.equal((await api("DELETE", `${P}/${row.id}`)).status, 204);
    assert.equal((await api("GET", `${P}/${row.id}`)).status, 404);
  });
  it("supports Distributor and Company with their own fields", async () => {
    const d = await api("POST", P, person({ type: "Distributor", account: `T-${run}-D` })); assert.equal(d.status, 201); track(P, (d.data as Json).id);
    assert.equal((d.data as Json).type, "Distributor");
    const c = await api("POST", P, company()); assert.equal(c.status, 201); track(P, (c.data as Json).id);
    const row = c.data as Json;
    assert.equal(row.name, "Test Co Ltd"); assert.equal(row.pin, "P000000001A"); assert.equal(row.firstName, undefined);
  });
  it("rejects duplicate accounts per tenant, ignoring case", async () => {
    const a = await api("POST", P, person({ account: `T-${run}-dup` })); assert.equal(a.status, 201); track(P, (a.data as Json).id);
    const b = await api("POST", P, person({ account: `T-${run}-DUP`, phone: "0733345678" }));
    assert.equal(b.status, 409);
    assert.ok((b.data as { errors: Json }).errors.account);
    const other = await api("POST", P, person({ account: `T-${run}-dup2` })); track(P, (other.data as Json).id);
    const clash = await api("PUT", `${P}/${(other.data as Json).id}`, person({ account: `T-${run}-dup` }));
    assert.equal(clash.status, 409, "editing into an existing account is rejected too");
    const same = await api("PUT", `${P}/${(a.data as Json).id}`, person({ account: `T-${run}-dup`, location: "Same" }));
    assert.equal(same.status, 200, "keeping its own account is fine");
  });
  it("normalises like the form: account whitespace removed, name whitespace collapsed", async () => {
    const ph = freshPhone();
    const r = await api("POST", P, person({ account: ` T-${run}-n orm `, firstName: "  Mary   Ann ", phone: `+254 ${ph.slice(1, 4)} ${ph.slice(4, 7)} ${ph.slice(7)}` }));
    assert.equal(r.status, 201); track(P, (r.data as Json).id);
    assert.equal((r.data as Json).account, `T-${run}-norm`); assert.equal((r.data as Json).firstName, "Mary Ann"); assert.equal((r.data as Json).phone, e164(ph));
  });
  it("validates with the same rules as the form", async () => {
    const bad = await api("POST", P, person({ firstName: "R2D2", phone: "123", email: "nope", account: "bad account!", location: "" }));
    assert.equal(bad.status, 422);
    const errors = (bad.data as { errors: Json }).errors;
    for (const f of ["firstName", "phone", "email", "account", "location"]) assert.ok(errors[f], `error for ${f}`);
    assert.ok((await api("POST", P, company({ pin: "" }))).status === 422, "company PIN is required");
    assert.ok(((await api("POST", P, person({ pin: "P1" }))).data as { errors: Json }).errors.pin, "people have no PIN");
    assert.equal((await api("POST", P, person({ type: "Nope" }))).status, 422);
    assert.equal((await api("POST", P, person({ firstName: 5 }))).status, 422);
    assert.equal((await api("POST", P, { type: "End User" })).status, 422, "missing fields");
  });
  it("needs a phone number or an email, not both: either keeps the customer's privacy", async () => {
    const phoneOnly = await api("POST", P, person({ account: `T-${run}-po`, email: "" }));
    assert.equal(phoneOnly.status, 201, phoneOnly.text); track(P, (phoneOnly.data as Json).id);
    assert.equal((phoneOnly.data as Json).email, "");
    const emailOnly = await api("POST", P, person({ account: `T-${run}-eo`, phone: "" }));
    assert.equal(emailOnly.status, 201, emailOnly.text); track(P, (emailOnly.data as Json).id);
    assert.equal((emailOnly.data as Json).phone, "");
    const company1 = await api("POST", P, company({ account: `T-${run}-ce`, phone: "   " }));
    assert.equal(company1.status, 201, "companies too; blank counts as not given"); track(P, (company1.data as Json).id);
    const neither = await api("POST", P, person({ account: `T-${run}-ne`, phone: "", email: " " }));
    assert.equal(neither.status, 422);
    assert.match((neither.data as { errors: Json }).errors.phone, /phone number or an email/);
    assert.match((neither.data as { errors: Json }).errors.email, /phone number or an email/);
    const clear = await api("PUT", `${P}/${(phoneOnly.data as Json).id}`, person({ account: `T-${run}-po`, phone: "", email: "" }));
    assert.equal(clear.status, 422, "an edit cannot remove both");
    const bad = await api("POST", P, person({ account: `T-${run}-bp`, phone: "123", email: "" }));
    assert.ok((bad.data as { errors: Json }).errors.phone.startsWith("Enter a valid phone"), "a phone that is given must still be valid");
  });
  it("one customer per phone number and per email in a company", async () => {
    const ph = freshPhone();
    const em = freshEmail("Dup");
    const first = await api("POST", P, person({ account: `T-${run}-u1`, firstName: "First", phone: ph, email: em }));
    assert.equal(first.status, 201, first.text); track(P, (first.data as Json).id);
    // The same number written another way, and the same email in other capitals, are still the same.
    const samePhone = await api("POST", P, person({ account: `T-${run}-u2`, phone: e164(ph).replace("+254", "+254 ") }));
    assert.equal(samePhone.status, 409);
    assert.equal((samePhone.data as { errors: Json }).errors.phone, `This phone number is already used by First Person (T-${run}-u1)`);
    const sameEmail = await api("POST", P, person({ account: `T-${run}-u3`, phone: "", email: em.toUpperCase() }));
    assert.equal(sameEmail.status, 409);
    assert.equal((sameEmail.data as { errors: Json }).errors.email, `This email is already used by First Person (T-${run}-u1)`);
    const all = await api("POST", P, person({ account: `T-${run}-U1`, phone: ph, email: em }));
    assert.equal(all.status, 409, "account, phone and email all taken");
    const e = (all.data as { errors: Json }).errors;
    assert.ok(e.account && e.phone && e.email, JSON.stringify(e));
    // Editing: keeping its own phone and email is fine; taking another customer's is not.
    assert.equal((await api("PUT", `${P}/${(first.data as Json).id}`, person({ account: `T-${run}-u1`, firstName: "First", phone: ph, email: em, location: "Kisumu" }))).status, 200);
    const second = await api("POST", P, person({ account: `T-${run}-u4` })); track(P, (second.data as Json).id);
    const steal = await api("PUT", `${P}/${(second.data as Json).id}`, person({ account: `T-${run}-u4`, phone: ph }));
    assert.equal(steal.status, 409);
    assert.ok((steal.data as { errors: Json }).errors.phone);
    // Empty values are "not given", so many customers may leave the same field empty.
    for (const k of ["a", "b"]) {
      const r = await api("POST", P, person({ account: `T-${run}-ne${k}`, phone: "" }));
      assert.equal(r.status, 201, r.text); track(P, (r.data as Json).id);
    }
    // Once a customer is deleted its phone and email are free again.
    const freed = freshPhone();
    const x = await api("POST", P, person({ account: `T-${run}-fr1`, phone: freed })); assert.equal(x.status, 201);
    assert.equal((await api("DELETE", `${P}/${(x.data as Json).id}`)).status, 204);
    const y = await api("POST", P, person({ account: `T-${run}-fr2`, phone: freed })); assert.equal(y.status, 201); track(P, (y.data as Json).id);
  });
  it("does not allow changing the type of an existing customer", async () => {
    const a = await api("POST", P, person({ account: `T-${run}-t` })); track(P, (a.data as Json).id);
    const r = await api("PUT", `${P}/${(a.data as Json).id}`, company({ account: `T-${run}-t` }));
    assert.equal(r.status, 422);
  });
});

describe("suppliers", () => {
  const P = "/api/crm/suppliers";
  const ind = (o: Json = {}) => ({ type: "Individual", fullName: "Amina Test", phone: "0722000111", email: "amina@example.com", location: "Eastleigh", ...o });
  const co = (o: Json = {}) => ({ type: "Company", companyName: "Test Supplies & Co.", kraPin: "P051234567A", location: "Industrial Area", contactName: "Peter Kamau", contactEmail: "peter@example.com", contactPhone: "0711000222", contactDepartment: "Sales", ...o });
  it("full CRUD for an individual", async () => {
    const r = await api("POST", P, ind()); assert.equal(r.status, 201);
    const row = r.data as Json; track(P, row.id);
    assert.deepEqual({ type: row.type, name: row.name, phone: row.phone, contactPerson: row.contactPerson, kraPin: row.kraPin, department: row.department }, { type: "Individual", name: "Amina Test", phone: "+254722000111", contactPerson: undefined, kraPin: undefined, department: undefined });
    assert.equal(((await api("PUT", `${P}/${row.id}`, ind({ fullName: "Amina Updated" }))).data as Json).name, "Amina Updated");
    assert.ok(((await api("GET", P)).data as Json[]).some((x) => x.id === row.id && x.name === "Amina Updated"));
    assert.equal((await api("DELETE", `${P}/${row.id}`)).status, 204);
    assert.equal((await api("GET", `${P}/${row.id}`)).status, 404);
  });
  it("company keeps contact person, department and optional KRA PIN", async () => {
    const r = await api("POST", P, co()); assert.equal(r.status, 201);
    const row = r.data as Json; track(P, row.id);
    assert.equal(row.contactPerson, "Peter Kamau"); assert.equal(row.department, "Sales"); assert.equal(row.kraPin, "P051234567A"); assert.equal(row.phone, "+254711000222", "company phone is the contact person's");
    const noPin = await api("POST", P, co({ kraPin: "" })); assert.equal(noPin.status, 201); track(P, (noPin.data as Json).id);
    assert.equal((noPin.data as Json).kraPin, undefined);
    const u = await api("PUT", `${P}/${row.id}`, co({ kraPin: "", contactDepartment: "Accounts" }));
    assert.equal((u.data as Json).kraPin, undefined); assert.equal((u.data as Json).department, "Accounts");
  });
  it("validates", async () => {
    const bad = await api("POST", P, co({ kraPin: "X123", contactPhone: "1", contactEmail: "x", contactDepartment: "", companyName: "<<>>" }));
    assert.equal(bad.status, 422);
    for (const f of ["kraPin", "contactPhone", "contactEmail", "contactDepartment", "companyName"]) assert.ok((bad.data as { errors: Json }).errors[f], f);
    assert.equal((await api("POST", P, ind({ contactName: "x" }))).status, 422, "individual has no contact fields");
    assert.equal((await api("POST", P, ind({ type: "Customer" }))).status, 422);
  });
});

describe("technicians", () => {
  const P = "/api/crm/technicians";
  const t = (o: Json = {}) => ({ name: "Samuel Test", phone: "0712000301", email: "sam@example.com", location: "Westlands", ...o });
  it("full CRUD, email optional", async () => {
    const r = await api("POST", P, t({ email: "" })); assert.equal(r.status, 201);
    const row = r.data as Json; track(P, row.id);
    assert.equal(row.email, "", "no email is shown as an empty string like the form expects");
    const u = await api("PUT", `${P}/${row.id}`, t({ email: "new@example.com" }));
    assert.equal((u.data as Json).email, "new@example.com");
    assert.ok(((await api("GET", P)).data as Json[]).some((x) => x.id === row.id));
    assert.equal((await api("DELETE", `${P}/${row.id}`)).status, 204);
    assert.equal((await api("GET", `${P}/${row.id}`)).status, 404);
  });
  it("validates", async () => {
    const bad = await api("POST", P, t({ name: "", phone: "abc", email: "bad", location: "" }));
    assert.equal(bad.status, 422);
    for (const f of ["name", "phone", "email", "location"]) assert.ok((bad.data as { errors: Json }).errors[f], f);
  });
});

describe("request handling", () => {
  it("rejects malformed bodies, content types and ids safely", async () => {
    assert.equal((await req(A, "POST", "/api/crm/technicians", "{nope")).status, 400);
    assert.equal((await req(A, "POST", "/api/crm/technicians", "[1]")).status, 400);
    assert.equal((await req(A, "POST", "/api/crm/technicians", "name=x", { "Content-Type": "application/x-www-form-urlencoded" })).status, 415);
    assert.equal((await req(A, "POST", "/api/crm/technicians", "x".repeat(20000))).status, 413);
    for (const m of ["GET", "DELETE"]) assert.equal((await api(m, "/api/crm/customers/not-a-uuid")).status, 404);
    assert.equal((await api("GET", "/api/crm/customers/00000000-0000-4000-8000-000000000000")).status, 404);
    const r = await api("GET", "/api/crm/customers");
    assert.equal(r.headers.get("cache-control"), "no-store");
  });
  it("is safe against SQL injection payloads", async () => {
    const r = await api("POST", "/api/crm/technicians", { name: "x'; DROP TABLE technicians;--", phone: "0712000301", location: "x" });
    assert.equal(r.status, 422, "rejected by validation, never reaching SQL");
    const ok = await api("POST", "/api/crm/technicians", { name: "Test", phone: "0712000301", location: "Robert'); DROP TABLE technicians;--" });
    assert.equal(ok.status, 201, "stored verbatim as data via parameters"); track("/api/crm/technicians", (ok.data as Json).id);
    assert.equal((await api("GET", "/api/crm/technicians")).status, 200, "table still exists");
  });
});

describe("tenant isolation", { skip: !B }, () => {
  it("another company cannot list, read, update or delete this company's records", async () => {
    const mine = await api("POST", "/api/crm/customers", person({ account: `T-${run}-iso` })); assert.equal(mine.status, 201);
    const id = (mine.data as Json).id as string; track("/api/crm/customers", id);
    const list = await req(B!, "GET", "/api/crm/customers");
    assert.ok(!(list.data as Json[]).some((x) => x.id === id), "not in the other tenant's list");
    assert.equal((await req(B!, "GET", `/api/crm/customers/${id}`)).status, 404);
    assert.equal((await req(B!, "PUT", `/api/crm/customers/${id}`, person({ account: `T-${run}-iso`, location: "Hacked" }))).status, 404);
    assert.equal((await req(B!, "DELETE", `/api/crm/customers/${id}`)).status, 404);
    assert.equal(((await api("GET", `/api/crm/customers/${id}`)).data as Json).location, "Nairobi", "untouched");
    const brandB = ((await req(B!, "GET", "/api/settings/brands")).data as Json[])[0].id;
    const theirs = ((await api("GET", `/api/crm/customers/${id}`)).data as Json);
    const same = await req(B!, "POST", "/api/crm/customers", person({ account: `T-${run}-iso`, brandId: brandB, phone: theirs.phone, email: theirs.email }));
    assert.equal(same.status, 201, "the same account, phone and email may exist in another company");
    await req(B!, "DELETE", `/api/crm/customers/${(same.data as Json).id}`);
  });
});

describe("authentication", { skip: !UNAUTH }, () => {
  it("answers 401 to every CRM route without a session", async () => {
    for (const p of ["customers", "suppliers", "technicians"]) {
      assert.equal((await req(UNAUTH!, "GET", `/api/crm/${p}`)).status, 401);
      assert.equal((await req(UNAUTH!, "POST", `/api/crm/${p}`, {})).status, 401);
      assert.equal((await req(UNAUTH!, "GET", `/api/crm/${p}/00000000-0000-4000-8000-000000000000`)).status, 401);
      assert.equal((await req(UNAUTH!, "PUT", `/api/crm/${p}/00000000-0000-4000-8000-000000000000`, {})).status, 401);
      assert.equal((await req(UNAUTH!, "DELETE", `/api/crm/${p}/00000000-0000-4000-8000-000000000000`)).status, 401);
    }
  });
});

describe("database errors", { skip: !BROKEN }, () => {
  it("returns a generic 500 and leaks no connection details", async () => {
    const r = await req(BROKEN!, "GET", "/api/crm/customers");
    assert.equal(r.status, 500);
    assert.ok(!/postgres|password|ECONN|localhost|5432|select/i.test(r.text), r.text);
  });
});
