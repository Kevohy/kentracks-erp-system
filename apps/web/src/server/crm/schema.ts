import { sql } from "drizzle-orm";
import { check, index, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

/**
 * CRM schema, derived from the frontend models in src/lib/{customers,suppliers,technicians}.ts
 * and the validators next to them. Every CRM row belongs to a tenant (company).
 *
 * Database checks repeat the cheap, structural frontend rules as a last line of defence;
 * the full rules (name characters, libphonenumber validity, ...) run in the API layer.
 */

export const customerType = pgEnum("customer_type", ["End User", "Distributor", "Company"]);
export const supplierType = pgEnum("supplier_type", ["Individual", "Company"]);

const id = () => uuid("id").primaryKey().defaultRandom();
const tenantId = () => uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "restrict" });
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

export const tenants = pgTable("tenants", {
  id: id(),
  name: text("name").notNull(),
  createdAt: createdAt(),
});

/** Brands a company sells under (for example Protrack, Kentracks). Managed under Settings → Brands; customers can be tagged with one. */
export const brands = pgTable(
  "brands",
  {
    id: id(),
    tenantId: tenantId(),
    name: text("name").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("brands_tenant_name_uq").on(t.tenantId, sql`lower(${t.name})`),
    check("brands_name_len", sql`char_length(${t.name}) BETWEEN 1 AND 40`),
  ],
);

// E.164 as produced by libphonenumber-js, e.g. +254712345678.
const E164 = sql.raw(`'^[+][1-9][0-9]{6,14}$'`);
const EMAIL = sql.raw(`'^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]{2,}$'`);

export const customers = pgTable(
  "customers",
  {
    id: id(),
    tenantId: tenantId(),
    type: customerType("type").notNull(),
    /** People only (End User, Distributor). */
    firstName: text("first_name"),
    lastName: text("last_name"),
    /** Companies only. */
    companyName: text("company_name"),
    /** What every list and dropdown shows: company name, or "first last" for people. */
    name: text("name").generatedAlwaysAs(
      sql`CASE WHEN type = 'Company' THEN company_name ELSE first_name || ' ' || last_name END`,
    ),
    account: text("account").notNull(),
    phone: text("phone").notNull(),
    email: text("email").notNull(),
    location: text("location").notNull(),
    /** Companies only, required for them. */
    pin: text("pin"),
    /** Optional. Renaming a brand in Settings updates every customer tagged with it. */
    brandId: uuid("brand_id").references(() => brands.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("customers_tenant_account_uq").on(t.tenantId, sql`lower(${t.account})`),
    index("customers_tenant_created_idx").on(t.tenantId, t.createdAt),
    index("customers_brand_idx").on(t.brandId),
    check(
      "customers_type_shape",
      sql`(${t.type} = 'Company' AND ${t.companyName} IS NOT NULL AND ${t.pin} IS NOT NULL AND ${t.firstName} IS NULL AND ${t.lastName} IS NULL)
       OR (${t.type} <> 'Company' AND ${t.firstName} IS NOT NULL AND ${t.lastName} IS NOT NULL AND ${t.companyName} IS NULL AND ${t.pin} IS NULL)`,
    ),
    check("customers_account_format", sql`${t.account} ~ '^[A-Za-z0-9._/-]+$' AND char_length(${t.account}) <= 40`),
    check("customers_phone_e164", sql`${t.phone} ~ ${E164}`),
    check("customers_email_format", sql`${t.email} ~ ${EMAIL} AND char_length(${t.email}) <= 254`),
    check("customers_text_lengths", sql`char_length(${t.location}) BETWEEN 1 AND 120 AND char_length(${t.firstName}) <= 60 AND char_length(${t.lastName}) <= 60 AND char_length(${t.companyName}) <= 120 AND char_length(${t.pin}) <= 20`),
  ],
);

export const suppliers = pgTable(
  "suppliers",
  {
    id: id(),
    tenantId: tenantId(),
    type: supplierType("type").notNull(),
    /** Full name for individuals, company name for companies. */
    name: text("name").notNull(),
    /** Companies only. */
    contactPerson: text("contact_person"),
    /** Individuals: their own. Companies: the contact person's. */
    phone: text("phone").notNull(),
    /** Individuals: their own. Companies: the contact person's. */
    email: text("email").notNull(),
    location: text("location").notNull(),
    /** Companies only, optional. */
    kraPin: text("kra_pin"),
    /** Companies only, required for them. */
    department: text("department"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("suppliers_tenant_created_idx").on(t.tenantId, t.createdAt),
    check(
      "suppliers_type_shape",
      sql`(${t.type} = 'Company' AND ${t.contactPerson} IS NOT NULL AND ${t.department} IS NOT NULL)
       OR (${t.type} = 'Individual' AND ${t.contactPerson} IS NULL AND ${t.kraPin} IS NULL AND ${t.department} IS NULL)`,
    ),
    check("suppliers_kra_pin_format", sql`${t.kraPin} IS NULL OR ${t.kraPin} ~ '^[AP][0-9]{9}[A-Z]$'`),
    check("suppliers_phone_e164", sql`${t.phone} ~ ${E164}`),
    check("suppliers_email_format", sql`${t.email} ~ ${EMAIL} AND char_length(${t.email}) <= 254`),
    check("suppliers_text_lengths", sql`char_length(${t.name}) BETWEEN 1 AND 120 AND char_length(${t.location}) BETWEEN 1 AND 120 AND char_length(${t.contactPerson}) <= 60 AND char_length(${t.department}) <= 60`),
  ],
);

export const technicians = pgTable(
  "technicians",
  {
    id: id(),
    tenantId: tenantId(),
    name: text("name").notNull(),
    phone: text("phone").notNull(),
    /** Optional. NULL when not provided (the UI shows an empty string). */
    email: text("email"),
    location: text("location").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("technicians_tenant_created_idx").on(t.tenantId, t.createdAt),
    check("technicians_phone_e164", sql`${t.phone} ~ ${E164}`),
    check("technicians_email_format", sql`${t.email} IS NULL OR (${t.email} ~ ${EMAIL} AND char_length(${t.email}) <= 254)`),
    check("technicians_text_lengths", sql`char_length(${t.name}) BETWEEN 1 AND 60 AND char_length(${t.location}) BETWEEN 1 AND 120`),
  ],
);
