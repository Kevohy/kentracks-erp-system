import { sql } from "drizzle-orm";
import { bigint, boolean, check, date, index, integer, numeric, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { customers, suppliers, technicians, tenants } from "../crm/schema";

/**
 * Inventory, Purchases and Sales schema, derived from the frontend models in
 * src/lib/{inventory,purchases,sales}.ts and the validators next to them.
 *
 * - Money is stored as integer minor units (cents) in bigint columns, exactly like the frontend.
 * - Stock is NOT a column: it is derived from received purchase items minus stock_adjustments.
 * - Names copied into purchase items and sales (label, customer_name, ...) are the snapshots the
 *   frontend documents ("so the record stays readable if inventory or packages change").
 * - Every top-level record belongs to a tenant; child rows are reached through their parent.
 */

export const simCardType = pgEnum("sim_card_type", ["International IoT", "Local IoT", "Prepaid", "Postpaid"]);
export const purchaseItemType = pgEnum("purchase_item_type", ["Product", "SIM Card", "Platform"]);
export const purchaseStatus = pgEnum("purchase_status", ["Pending", "Received"]);
export const saleType = pgEnum("sale_type", ["Package Sale", "Hosting Sale", "Retailer Sale"]);
export const cardType = pgEnum("card_type", ["New Card", "Annual Card", "Lifelong Card"]);
export const customerLink = pgEnum("customer_link", ["automatic", "manual"]);
export const verificationSource = pgEnum("verification_source", ["mock", "gpsplatform"]);

const id = () => uuid("id").primaryKey().defaultRandom();
const tenantId = () => uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "restrict" });
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const money = (name: string) => bigint(name, { mode: "number" });

// ------------------------------------------------------------------ inventory

export const productCategories = pgTable(
  "product_categories",
  {
    id: id(),
    tenantId: tenantId(),
    name: text("name").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    // Sale line 1 finds the "GPS Trackers" category by name, so a name can exist only once per company.
    uniqueIndex("product_categories_tenant_name_uq").on(t.tenantId, sql`lower(${t.name})`),
    check("product_categories_name_len", sql`char_length(${t.name}) BETWEEN 1 AND 80`),
  ],
);

export const products = pgTable(
  "products",
  {
    id: id(),
    tenantId: tenantId(),
    categoryId: uuid("category_id").notNull().references(() => productCategories.id, { onDelete: "restrict" }),
    model: text("model").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("products_tenant_category_idx").on(t.tenantId, t.categoryId),
    check("products_model_len", sql`char_length(${t.model}) BETWEEN 1 AND 80`),
  ],
);

export const simCards = pgTable(
  "sim_cards",
  {
    id: id(),
    tenantId: tenantId(),
    name: text("name").notNull(),
    type: simCardType("type").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("sim_cards_tenant_idx").on(t.tenantId, t.createdAt), check("sim_cards_name_len", sql`char_length(${t.name}) BETWEEN 1 AND 80`)],
);

/** The three licence types (New, Annual, Lifelong Card) are the same for every platform, so they are the card_type enum, not rows. */
export const platforms = pgTable(
  "platforms",
  {
    id: id(),
    tenantId: tenantId(),
    name: text("name").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("platforms_tenant_idx").on(t.tenantId, t.createdAt), check("platforms_name_len", sql`char_length(${t.name}) BETWEEN 1 AND 80`)],
);

// ------------------------------------------------------------------ purchases

export const purchases = pgTable(
  "purchases",
  {
    id: id(),
    tenantId: tenantId(),
    /** Chosen by the browser per purchase form, so a repeated submit returns the same purchase instead of adding another. */
    clientKey: text("client_key"),
    supplierId: uuid("supplier_id").notNull().references(() => suppliers.id, { onDelete: "restrict" }),
    date: date("date", { mode: "string" }).notNull(),
    status: purchaseStatus("status").notNull(),
    notes: text("notes").notNull().default(""),
    totalMinor: money("total_minor").notNull(),
    paidMinor: money("paid_minor").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("purchases_tenant_created_idx").on(t.tenantId, t.createdAt),
    uniqueIndex("purchases_tenant_client_key_uq").on(t.tenantId, t.clientKey).where(sql`${t.clientKey} IS NOT NULL`),
    check("purchases_amounts", sql`${t.paidMinor} >= 0 AND ${t.paidMinor} <= ${t.totalMinor}`),
    check("purchases_notes_len", sql`char_length(${t.notes}) <= 500`),
  ],
);

const itemShape = (type: unknown, product: unknown, sim: unknown, platform: unknown) =>
  sql`(${type} = 'Product' AND ${product} IS NOT NULL AND ${sim} IS NULL AND ${platform} IS NULL)
   OR (${type} = 'SIM Card' AND ${product} IS NULL AND ${sim} IS NOT NULL AND ${platform} IS NULL)
   OR (${type} = 'Platform' AND ${product} IS NULL AND ${sim} IS NULL AND ${platform} IS NOT NULL)`;

export const purchaseItems = pgTable(
  "purchase_items",
  {
    id: id(),
    purchaseId: uuid("purchase_id").notNull().references(() => purchases.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    itemType: purchaseItemType("item_type").notNull(),
    productId: uuid("product_id").references(() => products.id, { onDelete: "restrict" }),
    simCardId: uuid("sim_card_id").references(() => simCards.id, { onDelete: "restrict" }),
    platformId: uuid("platform_id").references(() => platforms.id, { onDelete: "restrict" }),
    /** Model, SIM card name or platform name at the time of purchase. */
    label: text("label").notNull(),
    /** Products only. */
    categoryName: text("category_name"),
    /** Platforms only: which licence card was bought. */
    cardType: cardType("card_type"),
    quantity: integer("quantity").notNull(),
    unitPriceMinor: money("unit_price_minor").notNull(),
  },
  (t) => [
    uniqueIndex("purchase_items_purchase_position_uq").on(t.purchaseId, t.position),
    index("purchase_items_product_idx").on(t.productId),
    index("purchase_items_sim_idx").on(t.simCardId),
    index("purchase_items_platform_idx").on(t.platformId),
    check("purchase_items_one_target", itemShape(t.itemType, t.productId, t.simCardId, t.platformId)),
    check("purchase_items_category_name", sql`(${t.itemType} = 'Product') = (${t.categoryName} IS NOT NULL)`),
    check("purchase_items_card_type", sql`${t.cardType} IS NULL OR ${t.itemType} = 'Platform'`),
    check("purchase_items_quantity", sql`${t.quantity} BETWEEN 1 AND 100000`),
    check("purchase_items_price", sql`${t.unitPriceMinor} BETWEEN 0 AND 1000000000`),
    check("purchase_items_label_len", sql`char_length(${t.label}) BETWEEN 1 AND 80`),
  ],
);

// ---------------------------------------------------------------------- sales

/** Package names managed under Settings. The price is entered on each sale. */
export const salePackages = pgTable(
  "sale_packages",
  {
    id: id(),
    tenantId: tenantId(),
    name: text("name").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("sale_packages_tenant_name_uq").on(t.tenantId, sql`lower(${t.name})`),
    check("sale_packages_name_len", sql`char_length(${t.name}) BETWEEN 1 AND 60`),
  ],
);

export const sales = pgTable(
  "sales",
  {
    id: id(),
    tenantId: tenantId(),
    /** Chosen by the browser per sale form, so a repeated submit returns the same sale instead of adding another. */
    clientKey: text("client_key"),
    type: saleType("type").notNull(),
    customerId: uuid("customer_id").notNull().references(() => customers.id, { onDelete: "restrict" }),
    customerName: text("customer_name").notNull(),
    totalMinor: money("total_minor").notNull(),
    paidMinor: money("paid_minor").notNull(),
    /** Total minus item costs minus expenses, worked out when the sale was made. Negative is a loss. */
    profitMinor: money("profit_minor").notNull(),
    /** Items that had no buying price yet, so the profit is not complete. */
    costMissing: text("cost_missing").array().notNull().default(sql`'{}'::text[]`),
    /**
     * An old sale (made before this system) recorded only so the device, SIM and renewals can be tracked. It takes
     * nothing from inventory and has no money: total, paid and profit are 0 and it is left out of revenue and profit.
     * Its created_at is the original sale date.
     */
    oldSale: boolean("old_sale").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    index("sales_tenant_created_idx").on(t.tenantId, t.createdAt),
    // Sale history: newest first per company, optionally per sale type, paged by (created_at, id).
    index("sales_tenant_created_id_idx").on(t.tenantId, t.createdAt.desc(), t.id.desc()),
    index("sales_tenant_type_created_id_idx").on(t.tenantId, t.type, t.createdAt.desc(), t.id.desc()),
    uniqueIndex("sales_tenant_client_key_uq").on(t.tenantId, t.clientKey).where(sql`${t.clientKey} IS NOT NULL`),
    check(
      "sales_amounts",
      sql`(${t.oldSale} AND ${t.totalMinor} = 0 AND ${t.paidMinor} = 0 AND ${t.profitMinor} = 0)
       OR (NOT ${t.oldSale} AND ${t.totalMinor} > 0 AND ${t.paidMinor} >= 0 AND ${t.paidMinor} <= ${t.totalMinor})`,
    ),
  ],
);

/** The extra details of a Package Sale or Hosting Sale (one row per such sale). */
export const packageSales = pgTable(
  "package_sales",
  {
    saleId: uuid("sale_id").primaryKey().references(() => sales.id, { onDelete: "cascade" }),
    customerLink: customerLink("customer_link").notNull(),
    imei: text("imei").notNull(),
    vehiclePlate: text("vehicle_plate").notNull().default(""),
    gpsAccount: text("gps_account").notNull().default(""),
    verificationSource: verificationSource("verification_source").notNull(),
    /** The GPS platform that verified the IMEI ("Kentracks", "iTrack"); null for mock data and older sales. */
    verificationPlatform: text("verification_platform"),
    packageId: uuid("package_id").notNull().references(() => salePackages.id, { onDelete: "restrict" }),
    packageName: text("package_name").notNull(),
    /** Null for a Hosting Sale, which has no tracker line. */
    trackerProductId: uuid("tracker_product_id").references(() => products.id, { onDelete: "restrict" }),
    trackerCategoryName: text("tracker_category_name"),
    trackerModel: text("tracker_model"),
    platformId: uuid("platform_id").notNull().references(() => platforms.id, { onDelete: "restrict" }),
    platformName: text("platform_name").notNull(),
    cardType: cardType("card_type").notNull(),
    /** Platform licences taken for this sale: exactly 0, 0.5 or 1. */
    deduction: numeric("deduction", { precision: 2, scale: 1, mode: "number" }).notNull(),
    simCardId: uuid("sim_card_id").notNull().references(() => simCards.id, { onDelete: "restrict" }),
    simName: text("sim_name").notNull(),
    /** The SIM number GPSPlatform returned for the IMEI. */
    simNumber: text("sim_number").notNull().default(""),
    /** True when one SIM card was taken out of inventory stock for this sale. */
    simDeducted: boolean("sim_deducted").notNull(),
    /** Prepaid SIMs: send the customer a monthly SMS reminder (bulk SMS integration comes later). */
    smsReminder: boolean("sms_reminder").notNull().default(false),
    /** Prepaid SIMs: add to automatic airtime recharge (airtime integration comes later). */
    autoRecharge: boolean("auto_recharge").notNull().default(false),
    /** IoT SIMs: listed under Billing → IoT SIM (billing module comes later). Set automatically from the SIM type. */
    iotBilling: boolean("iot_billing").notNull().default(false),
    technicianId: uuid("technician_id").references(() => technicians.id, { onDelete: "restrict" }),
    technicianName: text("technician_name"),
    installationMinor: money("installation_minor").notNull(),
    transportMinor: money("transport_minor").notNull(),
    commissionMinor: money("commission_minor").notNull(),
    notes: text("notes").notNull().default(""),
    costTrackerMinor: money("cost_tracker_minor").notNull(),
    costSimMinor: money("cost_sim_minor").notNull(),
    costLicenceMinor: money("cost_licence_minor").notNull(),
    /** New Card only: renewal fee agreed with the customer, charged when the licence expires. */
    renewalFeeMinor: money("renewal_fee_minor"),
    /** New Card only: the platform expiration date GPSPlatform returned for the device. */
    platformExpirationDate: text("platform_expiration_date"),
    /** Billing: the device as GPSPlatform last reported it (refreshed from the Billing page). Null until first checked. */
    gpsModel: text("gps_model"),
    gpsStatus: text("gps_status"),
    gpsActivationDate: text("gps_activation_date"),
    gpsExpirationDate: text("gps_expiration_date"),
    gpsSyncedAt: timestamp("gps_synced_at", { withTimezone: true }),
  },
  (t) => [
    // Billing: the latest sale of each IMEI.
    index("package_sales_imei_idx").on(t.imei),
    check("package_sales_imei", sql`${t.imei} ~ '^[0-9]{15}$'`),
    check("package_sales_deduction", sql`${t.deduction} IN (0, 0.5, 1)`),
    check(
      "package_sales_tracker_all_or_none",
      sql`(${t.trackerProductId} IS NULL AND ${t.trackerCategoryName} IS NULL AND ${t.trackerModel} IS NULL)
       OR (${t.trackerProductId} IS NOT NULL AND ${t.trackerCategoryName} IS NOT NULL AND ${t.trackerModel} IS NOT NULL)`,
    ),
    check("package_sales_technician_both_or_none", sql`(${t.technicianId} IS NULL) = (${t.technicianName} IS NULL)`),
    check("package_sales_expenses", sql`${t.installationMinor} >= 0 AND ${t.transportMinor} >= 0 AND ${t.commissionMinor} >= 0`),
    check("package_sales_costs", sql`${t.costTrackerMinor} >= 0 AND ${t.costSimMinor} >= 0 AND ${t.costLicenceMinor} >= 0`),
    check("package_sales_notes_len", sql`char_length(${t.notes}) <= 500`),
  ],
);

export const packageSaleExpenses = pgTable(
  "package_sale_expenses",
  {
    id: id(),
    saleId: uuid("sale_id").notNull().references(() => sales.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    description: text("description").notNull(),
    amountMinor: money("amount_minor").notNull(),
  },
  (t) => [
    uniqueIndex("package_sale_expenses_sale_position_uq").on(t.saleId, t.position),
    check("package_sale_expenses_values", sql`char_length(${t.description}) BETWEEN 1 AND 80 AND ${t.amountMinor} > 0`),
  ],
);

export const retailerProductLines = pgTable(
  "retailer_product_lines",
  {
    id: id(),
    saleId: uuid("sale_id").notNull().references(() => sales.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "restrict" }),
    categoryName: text("category_name").notNull(),
    model: text("model").notNull(),
    quantity: integer("quantity").notNull(),
    unitPriceMinor: money("unit_price_minor").notNull(),
    /** Latest buying price when the sale was made; NULL when there was none. */
    unitCostMinor: money("unit_cost_minor"),
  },
  (t) => [
    uniqueIndex("retailer_product_lines_sale_position_uq").on(t.saleId, t.position),
    check("retailer_product_lines_values", sql`${t.quantity} BETWEEN 1 AND 100000 AND ${t.unitPriceMinor} BETWEEN 1 AND 1000000000 AND (${t.unitCostMinor} IS NULL OR ${t.unitCostMinor} >= 0)`),
  ],
);

export const retailerCardLines = pgTable(
  "retailer_card_lines",
  {
    id: id(),
    saleId: uuid("sale_id").notNull().references(() => sales.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    platformId: uuid("platform_id").notNull().references(() => platforms.id, { onDelete: "restrict" }),
    platformName: text("platform_name").notNull(),
    cardType: cardType("card_type").notNull(),
    quantity: integer("quantity").notNull(),
    unitPriceMinor: money("unit_price_minor").notNull(),
    unitCostMinor: money("unit_cost_minor"),
  },
  (t) => [
    uniqueIndex("retailer_card_lines_sale_position_uq").on(t.saleId, t.position),
    check("retailer_card_lines_values", sql`${t.quantity} BETWEEN 1 AND 100000 AND ${t.unitPriceMinor} BETWEEN 1 AND 1000000000 AND (${t.unitCostMinor} IS NULL OR ${t.unitCostMinor} >= 0)`),
  ],
);

/** Quantities taken out of stock by a sale. Purchase history is never changed. */
export const stockAdjustments = pgTable(
  "stock_adjustments",
  {
    id: id(),
    tenantId: tenantId(),
    saleId: uuid("sale_id").notNull().references(() => sales.id, { onDelete: "cascade" }),
    itemType: purchaseItemType("item_type").notNull(),
    productId: uuid("product_id").references(() => products.id, { onDelete: "restrict" }),
    simCardId: uuid("sim_card_id").references(() => simCards.id, { onDelete: "restrict" }),
    platformId: uuid("platform_id").references(() => platforms.id, { onDelete: "restrict" }),
    /** Platform licences can be taken in halves (deduction 0.5), so quantities allow one decimal. */
    /** Platform licences: the card type taken (NULL for licences taken before card types were tracked). */
    cardType: cardType("card_type"),
    quantity: numeric("quantity", { precision: 12, scale: 1, mode: "number" }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("stock_adjustments_tenant_idx").on(t.tenantId, t.itemType),
    index("stock_adjustments_sale_idx").on(t.saleId),
    check("stock_adjustments_one_target", itemShape(t.itemType, t.productId, t.simCardId, t.platformId)),
    check("stock_adjustments_card_type", sql`${t.cardType} IS NULL OR ${t.itemType} = 'Platform'`),
    check("stock_adjustments_quantity", sql`${t.quantity} > 0`),
  ],
);

// ------------------------------------------------------------- sale payments

/**
 * Money received after a sale for the part not paid at the time (Sales → sale → Record payment). Each payment adds to
 * sales.paid_minor in the same transaction, and the total paid can never pass the sale total (sales_amounts). The
 * amount paid when the sale was made is sales.paid_minor minus these payments.
 */
export const salePayments = pgTable(
  "sale_payments",
  {
    id: id(),
    tenantId: tenantId(),
    saleId: uuid("sale_id").notNull().references(() => sales.id, { onDelete: "cascade" }),
    /** Chosen by the browser per payment form, so a repeated submit returns the same payment instead of adding another. */
    clientKey: text("client_key"),
    amountMinor: money("amount_minor").notNull(),
    method: text("method").notNull(),
    reference: text("reference").notNull().default(""),
    note: text("note").notNull().default(""),
    /** The day the money was received (Nairobi). */
    paidOn: date("paid_on", { mode: "string" }).notNull(),
    /** The signed-in user who recorded it. */
    createdBy: uuid("created_by"),
    createdAt: createdAt(),
  },
  (t) => [
    index("sale_payments_tenant_sale_idx").on(t.tenantId, t.saleId, t.createdAt),
    uniqueIndex("sale_payments_tenant_client_key_uq").on(t.tenantId, t.clientKey).where(sql`${t.clientKey} IS NOT NULL`),
    check("sale_payments_amount", sql`${t.amountMinor} > 0 AND ${t.amountMinor} <= 100000000000`),
    check("sale_payments_method", sql`${t.method} IN ('Cash', 'M-Pesa', 'Bank transfer', 'Cheque', 'Card', 'Other')`),
    check("sale_payments_text", sql`char_length(${t.reference}) <= 60 AND char_length(${t.note}) <= 300`),
  ],
);

// ------------------------------------------------------------------ IoT SIMs

/**
 * Billing → IoT SIM. Every Package/Hosting sale that took an IoT SIM out of stock (package_sales.iot_billing) is an
 * IoT SIM line. A SIM line has its own yearly renewal (separate from the platform licence). Rows here exist only once
 * something was set: without a row the fee is not set yet and the expiry is one year after the sale.
 */
export const iotSims = pgTable(
  "iot_sims",
  {
    saleId: uuid("sale_id").primaryKey().references(() => packageSales.saleId, { onDelete: "cascade" }),
    tenantId: tenantId(),
    renewalFeeMinor: money("renewal_fee_minor"),
    expiryDate: date("expiry_date"),
    suspended: boolean("suspended").notNull().default(false),
    suspendedAt: timestamp("suspended_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("iot_sims_tenant_idx").on(t.tenantId),
    check("iot_sims_fee", sql`${t.renewalFeeMinor} IS NULL OR ${t.renewalFeeMinor} BETWEEN 0 AND 1000000000`),
  ],
);

/** Every renewal recorded for an IoT SIM line (payment received and the new expiry). */
export const iotSimRenewals = pgTable(
  "iot_sim_renewals",
  {
    id: id(),
    tenantId: tenantId(),
    saleId: uuid("sale_id").notNull().references(() => packageSales.saleId, { onDelete: "cascade" }),
    amountMinor: money("amount_minor").notNull(),
    previousExpiry: date("previous_expiry"),
    newExpiry: date("new_expiry").notNull(),
    note: text("note").notNull().default(""),
    /** The signed-in user who recorded it. */
    createdBy: uuid("created_by"),
    createdAt: createdAt(),
  },
  (t) => [
    index("iot_sim_renewals_tenant_sale_idx").on(t.tenantId, t.saleId, t.createdAt),
    index("iot_sim_renewals_tenant_created_idx").on(t.tenantId, t.createdAt),
    check("iot_sim_renewals_amount", sql`${t.amountMinor} BETWEEN 0 AND 1000000000`),
    check("iot_sim_renewals_note_len", sql`char_length(${t.note}) <= 300`),
  ],
);

export const iotBillingPeriod = pgEnum("iot_billing_period", ["Monthly", "Yearly"]);

/** A group is an IoT SIM card item from inventory (e.g. "Safaricom — International IoT"); this holds how its provider bills. */
export const iotSimGroups = pgTable(
  "iot_sim_groups",
  {
    simCardId: uuid("sim_card_id").primaryKey().references(() => simCards.id, { onDelete: "cascade" }),
    tenantId: tenantId(),
    billingPeriod: iotBillingPeriod("billing_period").notNull().default("Monthly"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("iot_sim_groups_tenant_idx").on(t.tenantId)],
);

/** The provider's bill for one group and period (YYYY-MM; for yearly billing, the month the bill came). */
export const iotSimBills = pgTable(
  "iot_sim_bills",
  {
    id: id(),
    tenantId: tenantId(),
    simCardId: uuid("sim_card_id").notNull().references(() => simCards.id, { onDelete: "restrict" }),
    period: text("period").notNull(),
    amountMinor: money("amount_minor").notNull(),
    /** Active SIM lines in the group when the bill was recorded (the bill is shared across them). */
    lines: integer("lines").notNull(),
    note: text("note").notNull().default(""),
    createdBy: uuid("created_by"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("iot_sim_bills_group_period_uq").on(t.tenantId, t.simCardId, t.period),
    check("iot_sim_bills_period", sql`${t.period} ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'`),
    check("iot_sim_bills_amount", sql`${t.amountMinor} BETWEEN 0 AND 1000000000 AND ${t.lines} >= 0`),
    check("iot_sim_bills_note_len", sql`char_length(${t.note}) <= 300`),
  ],
);

// ------------------------------------------------------------- GPS platforms

/** GPS platforms the ERP can talk to: Kentracks (api.kentracksgps.com) and iTrack (api.itrack.top). */
export const GPS_PLATFORM_IDS = ["kentracks", "itrack"] as const;

/**
 * A company's API accounts on a GPS platform (Settings → GPS Platforms); a company may have several per platform.
 * The Kentracks API signs in with md5(md5(password) + time), so only md5(password) is kept: the password as typed is
 * never stored, and none of this is sent back to the browser.
 */
export const gpsPlatformAccounts = pgTable(
  "gps_platform_accounts",
  {
    id: id(),
    tenantId: tenantId(),
    platform: text("platform").notNull(),
    account: text("account").notNull(),
    passwordMd5: text("password_md5").notNull(),
    createdBy: uuid("created_by"),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("gps_platform_accounts_uq").on(t.tenantId, t.platform, sql`lower(${t.account})`),
    index("gps_platform_accounts_tenant_idx").on(t.tenantId, t.platform, t.createdAt),
    check("gps_platform_accounts_platform", sql`${t.platform} IN ('kentracks', 'itrack')`),
    check("gps_platform_accounts_account", sql`char_length(${t.account}) BETWEEN 1 AND 64`),
    check("gps_platform_accounts_md5", sql`${t.passwordMd5} ~ '^[0-9a-f]{32}$'`),
  ],
);

