import "server-only";
import { randomInt } from "node:crypto";
import { sql } from "drizzle-orm";
import { validUntilOf, validateCertificate, type Certificate, type CertificateCheck, type CertificateCustomer, type CertificateDraft, type CustomerVehicle } from "@/lib/certificates";
import type { AuthContext } from "../crm/auth";
import { loadBrands } from "../crm/brands";
import { getDb } from "../crm/db";
import { asSystem } from "../crm/db-scope";
import { ApiError, isUuid } from "../crm/http";

/**
 * Documents → Certificates. A certificate is issued for one tracked vehicle of a customer: the latest Package or
 * Hosting sale of an IMEI. Any signed-in user of the company can issue one (day-to-day work, like recording a sale).
 */

type Body = Record<string, unknown>;
const invalid = (errors: Record<string, string>): never => {
  throw new ApiError(422, "Please correct the highlighted fields", errors);
};

// The device's install date: the GPS platform's activation date when known, else the day of the sale (Nairobi).
const INSTALLED_ON = sql.raw(`COALESCE(NULLIF(substring(ps.gps_activation_date from '^\\d{4}-\\d{2}-\\d{2}'), ''), to_char(s.created_at AT TIME ZONE 'Africa/Nairobi', 'YYYY-MM-DD'))`);

/** The customer's tracked vehicles: the latest Package or Hosting sale of each IMEI sold to them. */
async function vehiclesOf(tenantId: string, customerId: string, onlySale?: string): Promise<CustomerVehicle[]> {
  const r = await getDb().execute<{
    sale_id: string; imei: string; vehicle_plate: string; device_model: string | null; sim_number: string; technician_name: string | null;
    package_name: string; platform_name: string; sim_name: string; installed_on: string; certificates: number;
  }>(sql`
    SELECT * FROM (
      SELECT DISTINCT ON (ps.imei) s.id AS sale_id, ps.imei, ps.vehicle_plate, COALESCE(NULLIF(ps.gps_model, ''), ps.tracker_model) AS device_model,
             ps.sim_number, ps.technician_name, ps.package_name, ps.platform_name, ps.sim_name, ${INSTALLED_ON} AS installed_on,
             (SELECT count(*)::int FROM certificates c WHERE c.tenant_id = s.tenant_id AND c.sale_id = s.id) AS certificates,
             s.created_at
      FROM sales s JOIN package_sales ps ON ps.sale_id = s.id
      WHERE s.tenant_id = ${tenantId} AND s.customer_id = ${customerId}::uuid
      ORDER BY ps.imei, s.created_at DESC, s.id DESC
    ) v
    ${onlySale ? sql`WHERE v.sale_id = ${onlySale}::uuid` : sql``}
    ORDER BY v.created_at DESC
    LIMIT 500`);
  return r.rows.map((x) => ({
    saleId: x.sale_id, imei: x.imei, vehiclePlate: x.vehicle_plate, deviceModel: x.device_model ?? "", simNumber: x.sim_number,
    technicianName: x.technician_name ?? "", packageName: x.package_name, platformName: x.platform_name, simName: x.sim_name, installedOn: x.installed_on,
    certificates: x.certificates,
  }));
}

/** GET /api/certificates/customers — customers with at least one tracked vehicle. */
export async function listCertificateCustomers(ctx: AuthContext): Promise<CertificateCustomer[]> {
  const r = await getDb().execute<{ id: string; name: string; account: string; phone: string; email: string; location: string; brand_id: string | null; vehicles: number }>(sql`
    SELECT c.id, c.name, c.account, c.phone, c.email, c.location, c.brand_id, count(DISTINCT ps.imei)::int AS vehicles
    FROM customers c
    JOIN sales s ON s.customer_id = c.id AND s.tenant_id = c.tenant_id
    JOIN package_sales ps ON ps.sale_id = s.id
    WHERE c.tenant_id = ${ctx.tenantId}
    GROUP BY c.id
    ORDER BY c.name
    LIMIT 5000`);
  return r.rows.map((x) => ({ id: x.id, name: x.name, account: x.account, phone: x.phone, email: x.email, location: x.location, brandId: x.brand_id, vehicles: x.vehicles }));
}

/** GET /api/certificates/customers/{id}/vehicles */
export async function listCustomerVehicles(ctx: AuthContext, customerId: string): Promise<CustomerVehicle[] | null> {
  if (!isUuid(customerId)) return null;
  const [c] = (await getDb().execute<{ id: string }>(sql`SELECT id FROM customers WHERE id = ${customerId}::uuid AND tenant_id = ${ctx.tenantId}`)).rows;
  if (!c) return null;
  return vehiclesOf(ctx.tenantId, customerId);
}

type CertRow = {
  id: string; number: string; sale_id: string; customer_id: string; brand_id: string; customer_name: string; customer_phone: string; customer_account: string;
  customer_email: string; customer_location: string; verify_code: string; platform_name: string; sim_name: string;
  imei: string; device_model: string; sim_number: string; technician_name: string; vehicle_reg: string; make: string; model: string; year: number;
  chassis: string; contract_years: number | null; installed_on: string; valid_until: string | null; brand_name: string; brand_tagline: string;
  brand_phone: string; brand_email: string; brand_website: string; brand_location: string; director_name: string; issued_at: Date | string;
  issued_by_name: string | null;
};

async function readCertificates(tenantId: string, where: ReturnType<typeof sql>, limit: number): Promise<Certificate[]> {
  const db = getDb();
  const r = await db.execute<CertRow>(sql`
    SELECT c.id, c.number, c.sale_id, c.customer_id, c.brand_id, c.customer_name, c.customer_phone, c.customer_account, c.customer_email,
           c.customer_location, c.verify_code, c.platform_name, c.sim_name, c.imei, c.device_model,
           c.sim_number, c.technician_name, c.vehicle_reg, c.make, c.model, c.year, c.chassis, c.contract_years,
           to_char(c.installed_on, 'YYYY-MM-DD') AS installed_on, to_char(c.valid_until, 'YYYY-MM-DD') AS valid_until,
           c.brand_name, c.brand_tagline, c.brand_phone, c.brand_email, c.brand_website, c.brand_location, c.director_name,
           c.created_at AS issued_at, u.full_name AS issued_by_name
    FROM certificates c LEFT JOIN users u ON u.id = c.issued_by AND u.tenant_id = c.tenant_id
    WHERE c.tenant_id = ${tenantId} AND ${where}
    ORDER BY c.created_at DESC, c.number DESC
    LIMIT ${limit}`);
  const images = new Map((await loadBrands(db, tenantId)).map((b) => [b.id, b]));
  return r.rows.map((x) => ({
    id: x.id, number: x.number, saleId: x.sale_id, customerId: x.customer_id, brandId: x.brand_id, customerName: x.customer_name,
    customerPhone: x.customer_phone, customerAccount: x.customer_account, customerEmail: x.customer_email, customerLocation: x.customer_location,
    verifyCode: x.verify_code, platformName: x.platform_name, simName: x.sim_name, imei: x.imei, deviceModel: x.device_model, simNumber: x.sim_number,
    technicianName: x.technician_name, vehicleReg: x.vehicle_reg, make: x.make, model: x.model, year: x.year, chassis: x.chassis,
    contractYears: x.contract_years, installedOn: x.installed_on, validUntil: x.valid_until,
    brand: {
      name: x.brand_name, tagline: x.brand_tagline, phone: x.brand_phone, email: x.brand_email, website: x.brand_website, location: x.brand_location,
      directorName: x.director_name, logoUrl: images.get(x.brand_id)?.logoUrl ?? null, iconUrl: images.get(x.brand_id)?.iconUrl ?? null,
      signatureUrl: images.get(x.brand_id)?.signatureUrl ?? null, color: images.get(x.brand_id)?.color ?? "",
    },
    issuedAt: new Date(x.issued_at).toISOString(),
    issuedByName: x.issued_by_name,
  }));
}

/** GET /api/certificates — the newest certificates first. */
export const listCertificates = (ctx: AuthContext) => readCertificates(ctx.tenantId, sql`true`, 1000);

/** GET /api/certificates/{id} */
export async function getCertificate(ctx: AuthContext, id: string): Promise<Certificate | null> {
  if (!isUuid(id)) return null;
  return (await readCertificates(ctx.tenantId, sql`c.id = ${id}::uuid`, 1))[0] ?? null;
}

/** "Kentracks" or "Kentracks GPS" → "KT", "Protrack" → "PT", "Acme Fleet" → "AF". Letters only, at most 3. */
function prefixOf(brandName: string): string {
  const words = brandName.toUpperCase().replace(/[^A-Z ]/g, " ").split(/\s+/).filter(Boolean);
  // The company's own brands keep their usual prefix however the name is written ("Kentracks GPS" is still KT).
  const known: Record<string, string> = { KENTRACKS: "KT", PROTRACK: "PT" };
  if (words[0] && known[words[0]]) return known[words[0]];
  if (words.length >= 2) return words.slice(0, 3).map((w) => w[0]).join("");
  return (words[0] ?? "CERT").slice(0, 2);
}

/** 10 characters from an alphabet without look-alikes (no 0/O, 1/I/L): about 50 bits, not guessable. */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const verifyCode = () => Array.from({ length: 10 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");

const FIELDS = ["customerId", "saleId", "vehicleReg", "make", "model", "year", "chassis", "contract", "brandId"] as const;

/** POST /api/certificates — issues a certificate and gives it the next number for its brand and year. */
export async function createCertificate(ctx: AuthContext, body: Body): Promise<Certificate> {
  const extra = Object.keys(body).filter((k) => !(FIELDS as readonly string[]).includes(k));
  if (extra.length) invalid(Object.fromEntries(extra.map((k) => [k, "This field is not accepted"])));
  const draft = Object.fromEntries(FIELDS.map((k) => [k, typeof body[k] === "string" ? (body[k] as string) : body[k] === undefined ? "" : null])) as Record<string, string | null>;
  const wrong = FIELDS.filter((k) => draft[k] === null);
  if (wrong.length) invalid(Object.fromEntries(wrong.map((k) => [k, "Must be text"])));
  const d = draft as unknown as CertificateDraft;

  const { errors, value } = validateCertificate(d);
  const db = getDb();
  const customer = isUuid(d.customerId)
    ? (await db.execute<{ id: string; name: string; phone: string; account: string; email: string; location: string }>(sql`SELECT id, name, phone, account, email, location FROM customers WHERE id = ${d.customerId}::uuid AND tenant_id = ${ctx.tenantId}`)).rows[0]
    : undefined;
  if (d.customerId && !customer) errors.customerId = "Select a customer";
  const vehicle = customer && isUuid(d.saleId) ? (await vehiclesOf(ctx.tenantId, customer.id, d.saleId))[0] : undefined;
  if (d.saleId && customer && !vehicle) errors.saleId = "Select one of this customer's vehicles";
  const brand = isUuid(d.brandId) ? (await loadBrands(db, ctx.tenantId)).find((b) => b.id === d.brandId) : undefined;
  if (d.brandId && !brand) errors.brandId = "Select a brand";
  if (Object.keys(errors).length || !customer || !vehicle || !brand) return invalid(errors as Record<string, string>);

  const prefix = prefixOf(brand.name);
  const year = Number(new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi", year: "numeric" }).format(new Date()));
  const stem = `${prefix}-${year}-`;
  const issuedBy = isUuid(ctx.userId) ? ctx.userId : null;

  // Numbers are per company: the next one for this prefix and year. Two at once both try; the loser retries.
  for (let attempt = 0; attempt < 5; attempt++) {
    const [{ n }] = (await db.execute<{ n: number }>(sql`
      SELECT COALESCE(MAX(substring(number from ${`^${stem}(\\d+)$`})::int), 0) + 1 AS n
      FROM certificates WHERE tenant_id = ${ctx.tenantId} AND number LIKE ${`${stem}%`}`)).rows;
    const number = `${stem}${String(n).padStart(5, "0")}`;
    const code = verifyCode();
    try {
      const [row] = (await db.execute<{ id: string }>(sql`
        INSERT INTO certificates (tenant_id, number, verify_code, sale_id, customer_id, brand_id, customer_name, customer_phone, customer_account,
          customer_email, customer_location, platform_name, sim_name, imei,
          device_model, sim_number, technician_name, vehicle_reg, make, model, year, chassis, contract_years, installed_on, valid_until,
          brand_name, brand_tagline, brand_phone, brand_email, brand_website, brand_location, director_name, issued_by)
        VALUES (${ctx.tenantId}, ${number}, ${code}, ${vehicle.saleId}::uuid, ${customer.id}::uuid, ${brand.id}::uuid, ${customer.name}, ${customer.phone},
          ${customer.account}, ${customer.email}, ${customer.location}, ${vehicle.platformName}, ${vehicle.simName}, ${vehicle.imei}, ${vehicle.deviceModel}, ${vehicle.simNumber}, ${vehicle.technicianName}, ${value.vehicleReg},
          ${value.make}, ${value.model}, ${value.year}, ${value.chassis}, ${value.contractYears}, ${vehicle.installedOn}::date,
          ${validUntilOf(vehicle.installedOn, value.contractYears)}::date, ${brand.name}, ${brand.tagline}, ${brand.phone}, ${brand.email},
          ${brand.website}, ${brand.location}, ${brand.directorName}, ${issuedBy}::uuid)
        RETURNING id`)).rows;
      return (await getCertificate(ctx, row.id))!;
    } catch (e) {
      const code = ((e as { cause?: { code?: string } }).cause ?? (e as { code?: string })).code;
      if (code !== "23505") throw e;
    }
  }
  throw new ApiError(409, "Another certificate was issued at the same moment. Please try again.");
}

/**
 * GET /verify/{code} (public, no sign-in): confirms a certificate from the code printed on it and in its QR code.
 * Shows only what is needed to confirm it - the owner's name shortened, no phone, email or address, and the IMEI
 * with its last four digits hidden (as on the printed certificate).
 */
export const checkCertificate = (code: string) => asSystem(() => checkCertificateAny(code));

/** Looks the code up in every company (system scope: the public verify page has no signed-in user). */
async function checkCertificateAny(code: string): Promise<CertificateCheck | null> {
  const c = code.trim().toUpperCase();
  if (!/^[A-Z0-9]{10}$/.test(c)) return null;
  const [x] = (await getDb().execute<{
    verify_code: string; number: string; customer_name: string; vehicle_reg: string; make: string; model: string; year: number; imei: string;
    installed_on: string; valid_until: string | null; contract_years: number | null; brand_name: string; brand_website: string; brand_phone: string;
    issued_at: Date | string; expired: boolean;
  }>(sql`
    SELECT verify_code, number, customer_name, vehicle_reg, make, model, year, imei, to_char(installed_on, 'YYYY-MM-DD') AS installed_on,
           to_char(valid_until, 'YYYY-MM-DD') AS valid_until, contract_years, brand_name, brand_website, brand_phone, created_at AS issued_at,
           (valid_until IS NOT NULL AND valid_until < (now() AT TIME ZONE 'Africa/Nairobi')::date) AS expired
    FROM certificates WHERE verify_code = ${c}`)).rows;
  if (!x) return null;
  const words = x.customer_name.trim().split(/\s+/);
  const ownerName = words.length > 1 ? `${words[0]} ${words.slice(1).map((w) => `${w[0]}.`).join(" ")}` : words[0];
  return {
    verifyCode: x.verify_code, number: x.number, status: x.expired ? "Expired" : "Valid", ownerName, vehicleReg: x.vehicle_reg,
    makeModel: `${x.make} ${x.model}`, year: x.year, imeiMasked: `${x.imei.slice(0, -4)}****`, installedOn: x.installed_on, validUntil: x.valid_until,
    contractYears: x.contract_years, brandName: x.brand_name, brandWebsite: x.brand_website, brandPhone: x.brand_phone,
    issuedAt: new Date(x.issued_at).toISOString(),
  };
}
