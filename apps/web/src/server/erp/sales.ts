import "server-only";
import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";
import type { Customer } from "@/lib/customers";
import { matchCustomer, saleTypes, type PackageSale, type RetailerSale, type Sale, type SalesPage, type AirtimeLineStatus, type SimService, type SimServiceChange, type StockTaken } from "@/lib/sales";
import { validateEmail, validatePhone } from "@/lib/validation";
import { normalizeDate, todayInNairobi } from "@/lib/billing";
import { validatePackageSale, type PackageSaleDraft } from "@/lib/sale-validation";
import { validateRetailerSale, type RetailerDraft } from "@/lib/retailer-validation";
import type { AuthContext } from "../crm/auth";
import { getDb } from "../crm/db";
import { isUuid, uniqueViolation } from "../crm/http";
import { Replay } from "../crm/routes";
import { toCustomer } from "../crm/customers";
import { toTechnician } from "../crm/technicians";
import { customers, technicians } from "../crm/schema";
import { Reader, throwValidation, type Body } from "./body";
import { verifyImeiOnServer } from "./gps";
import { loadCategories, loadPlatforms, loadProducts, loadSimCards, loadStock, stockLookup, type Db, type Tx } from "./inventory";
import { loadPackages } from "./packages";
import { smsReminderInfo } from "./sms-reminder-info";
import { packageSaleExpenses, packageSales, platforms as platformsTable, products as productsTable, retailerCardLines, retailerProductLines, sales, simCards, stockAdjustments } from "./schema";

const LIMIT = 2000;
export const SALE_BODY_BYTES = 64 * 1024;

// ------------------------------------------------------------------- reading

type SaleRow = typeof sales.$inferSelect;

async function loadSales(tenantId: string, only?: string): Promise<Sale[]> {
  const db = getDb();
  const where = only ? and(eq(sales.tenantId, tenantId), eq(sales.id, only)) : eq(sales.tenantId, tenantId);
  const rows: SaleRow[] = await db.select().from(sales).where(where).orderBy(desc(sales.createdAt), desc(sales.id)).limit(LIMIT);
  return buildSales(tenantId, rows);
}

/** Turns sale rows into full sale records; reads the details of these rows only. */
async function buildSales(tenantId: string, rows: SaleRow[]): Promise<Sale[]> {
  const db = getDb();
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const [details, expenses, productLines, cardLines] = await Promise.all([
    db.select().from(packageSales).where(inArray(packageSales.saleId, ids)),
    db.select().from(packageSaleExpenses).where(inArray(packageSaleExpenses.saleId, ids)).orderBy(asc(packageSaleExpenses.position)),
    db.select().from(retailerProductLines).where(inArray(retailerProductLines.saleId, ids)).orderBy(asc(retailerProductLines.position)),
    db.select().from(retailerCardLines).where(inArray(retailerCardLines.saleId, ids)).orderBy(asc(retailerCardLines.position)),
  ]);
  // What each sale took out of stock, with the item's current name.
  const taken = await db
    .select({ saleId: stockAdjustments.saleId, itemType: stockAdjustments.itemType, quantity: stockAdjustments.quantity, product: productsTable.model, sim: simCards.name, simType: simCards.type, platform: platformsTable.name })
    .from(stockAdjustments)
    .leftJoin(productsTable, eq(productsTable.id, stockAdjustments.productId))
    .leftJoin(simCards, eq(simCards.id, stockAdjustments.simCardId))
    .leftJoin(platformsTable, eq(platformsTable.id, stockAdjustments.platformId))
    .where(and(eq(stockAdjustments.tenantId, tenantId), inArray(stockAdjustments.saleId, ids)))
    .orderBy(asc(stockAdjustments.createdAt), asc(stockAdjustments.itemType), asc(stockAdjustments.id));
  // Changes of the airtime service after the sale (newest first).
  const changes = await db.execute<{ sale_id: string; kind: "Service" | "Suspended" | "Resumed"; from_service: SimService; to_service: SimService; reason: string; sms_status: "Sent" | "Failed" | null; sms_error: string | null; created_at: string | Date; by_name: string | null }>(sql`
    SELECT ch.sale_id, ch.kind, ch.from_service, ch.to_service, ch.reason, ch.sms_status, ch.sms_error, ch.created_at, u.full_name AS by_name
    FROM sale_service_changes ch LEFT JOIN users u ON u.id = ch.changed_by AND u.tenant_id = ch.tenant_id
    WHERE ch.tenant_id = ${tenantId} AND ch.sale_id IN (${sql.join(ids.map((i) => sql`${i}::uuid`), sql`, `)})
    ORDER BY ch.created_at DESC, ch.id DESC`);
  const changesBySale = new Map<string, SimServiceChange[]>();
  for (const c of changes.rows) {
    const list = changesBySale.get(c.sale_id) ?? [];
    list.push({ kind: c.kind, from: c.from_service, to: c.to_service, reason: c.reason, at: new Date(c.created_at).toISOString(), by: c.by_name, sms: c.sms_status ? { status: c.sms_status, error: c.sms_error } : null });
    changesBySale.set(c.sale_id, list);
  }
  // Automatic airtime: approval and suspension of each line.
  const plans = await db.execute<{ sale_id: string; suspended: boolean; suspended_reason: string | null }>(sql`
    SELECT sale_id, suspended, suspended_reason FROM airtime_plans
    WHERE tenant_id = ${tenantId} AND sale_id IN (${sql.join(ids.map((i) => sql`${i}::uuid`), sql`, `)})`);
  const planBySale = new Map(plans.rows.map((p) => [p.sale_id, p]));
  const airtimeStatusOf = (saleId: string, autoRecharge: boolean): AirtimeLineStatus | null => {
    if (!autoRecharge) return null;
    const p = planBySale.get(saleId);
    if (!p) return "Waiting for approval";
    if (!p.suspended) return "Active";
    return p.suspended_reason === "Expired" ? "Suspended (device expired)" : "Suspended";
  };
  // SMS reminder: this month's monthly airtime reminder and the latest ones (from Bulk SMS history).
  const reminderSales = details.filter((d) => d.smsReminder && !d.autoRecharge && !d.iotBilling).map((d) => d.saleId);
  const reminders = await smsReminderInfo(tenantId, reminderSales);
  const takenBySale = new Map<string, StockTaken[]>();
  for (const t of taken) {
    const name = t.itemType === "Product" ? t.product : t.itemType === "SIM Card" ? (t.sim ? `${t.sim} ${t.simType}` : null) : t.platform;
    takenBySale.set(t.saleId, [...(takenBySale.get(t.saleId) ?? []), { itemType: t.itemType, name: name ?? "Deleted item", quantity: t.quantity }]);
  }
  const detailBySale = new Map(details.map((d) => [d.saleId, d]));

  return rows.map((s): Sale => {
    if (s.type === "Retailer Sale") {
      const sale: RetailerSale = {
        id: s.id,
        type: "Retailer Sale",
        customerId: s.customerId,
        customerName: s.customerName,
        productLines: productLines
          .filter((l) => l.saleId === s.id)
          .map((l) => ({ categoryName: l.categoryName, productId: l.productId, model: l.model, quantity: l.quantity, unitPriceMinor: l.unitPriceMinor, lineTotalMinor: l.quantity * l.unitPriceMinor, unitCostMinor: l.unitCostMinor })),
        cardLines: cardLines
          .filter((l) => l.saleId === s.id)
          .map((l) => ({ platformId: l.platformId, platformName: l.platformName, cardType: l.cardType, quantity: l.quantity, unitPriceMinor: l.unitPriceMinor, lineTotalMinor: l.quantity * l.unitPriceMinor, unitCostMinor: l.unitCostMinor })),
        totalMinor: s.totalMinor,
        paidMinor: s.paidMinor,
        // Cost is the profit the sale reported subtracted from its total.
        costMinor: s.totalMinor - s.profitMinor,
        costMissing: s.costMissing,
        profitMinor: s.profitMinor,
        createdAt: s.createdAt.toISOString(),
        stockTaken: takenBySale.get(s.id) ?? [],
      };
      return sale;
    }
    const d = detailBySale.get(s.id)!;
    const other = expenses.filter((e) => e.saleId === s.id).map((e) => ({ description: e.description, amountMinor: e.amountMinor }));
    const sale: PackageSale = {
      id: s.id,
      type: s.type,
      customerId: s.customerId,
      customerName: s.customerName,
      customerLink: d.customerLink,
      imei: d.imei,
      vehiclePlate: d.vehiclePlate,
      gpsAccount: d.gpsAccount,
      verificationSource: d.verificationSource,
      verificationPlatform: d.verificationPlatform,
      packageId: d.packageId,
      packageName: d.packageName,
      packagePriceMinor: s.totalMinor,
      tracker: d.trackerProductId ? { categoryName: d.trackerCategoryName as string, productId: d.trackerProductId, model: d.trackerModel as string } : null,
      licence: { platformId: d.platformId, platformName: d.platformName, cardType: d.cardType, deduction: d.deduction, renewalFeeMinor: d.renewalFeeMinor, expirationDate: d.platformExpirationDate },
      sim: { id: d.simCardId, name: d.simName, number: d.simNumber, deducted: d.simDeducted, smsReminder: d.smsReminder, autoRecharge: d.autoRecharge, iotBilling: d.iotBilling, serviceChanges: changesBySale.get(s.id) ?? [], airtimeStatus: airtimeStatusOf(s.id, d.autoRecharge), reminder: reminders.get(s.id) ?? null },
      technician: d.technicianId ? { id: d.technicianId, name: d.technicianName as string } : null,
      expensesMinor: { installation: d.installationMinor, transport: d.transportMinor, commission: d.commissionMinor, other },
      notes: d.notes,
      totalMinor: s.totalMinor,
      paidMinor: s.paidMinor,
      costMinor: { tracker: d.costTrackerMinor, sim: d.costSimMinor, licence: d.costLicenceMinor },
      costMissing: s.costMissing,
      profitMinor: s.profitMinor,
      createdAt: s.createdAt.toISOString(),
      stockTaken: takenBySale.get(s.id) ?? [],
      oldSale: s.oldSale,
    };
    return sale;
  });
}

export const listSales = (ctx: AuthContext) => loadSales(ctx.tenantId);

// ------------------------------------------------------------ sale history

const PAGE_MAX = 100;
const encodeCursor = (r: SaleRow) => Buffer.from(`${r.createdAt.toISOString()}|${r.id}`).toString("base64url");
function decodeCursor(c: string): { at: Date; id: string } | null {
  const [at, id] = Buffer.from(c, "base64url").toString().split("|");
  const d = new Date(at ?? "");
  return Number.isNaN(d.getTime()) || !isUuid(id ?? "") ? null : { at: d, id };
}

/**
 * One page of the sale history, newest first, filtered and searched in the database so it stays fast with
 * hundreds of thousands of sales. Paging is by (created_at, id), so pages never skip or repeat a sale.
 */
export async function listSalesPage(ctx: AuthContext, url: URL): Promise<SalesPage> {
  const p = url.searchParams;
  const limit = Math.min(Math.max(Number(p.get("limit")) || 50, 1), PAGE_MAX);
  const q = (p.get("q") ?? "").trim().slice(0, 100);
  const type = p.get("type") ?? "";
  if (type && !(saleTypes as readonly string[]).includes(type)) throwValidation({ type: `Type must be one of: ${saleTypes.join(", ")}` });
  const cursorRaw = p.get("cursor");
  const cursor = cursorRaw ? decodeCursor(cursorRaw) : null;
  if (cursorRaw && !cursor) throwValidation({ cursor: "Invalid cursor" });

  const like = `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
  const filters = [
    eq(sales.tenantId, ctx.tenantId),
    type ? eq(sales.type, type as SaleRow["type"]) : undefined,
    q
      ? or(
          sql`${sales.customerName} ILIKE ${like}`,
          sql`EXISTS (SELECT 1 FROM ${packageSales} ps WHERE ps.sale_id = ${sales.id} AND (ps.imei ILIKE ${like} OR ps.vehicle_plate ILIKE ${like} OR ps.package_name ILIKE ${like}))`,
        )
      : undefined,
  ].filter((f) => f !== undefined);
  const db = getDb();
  const pageWhere = cursor ? and(...filters, sql`(${sales.createdAt}, ${sales.id}) < (${cursor.at.toISOString()}::timestamptz, ${cursor.id}::uuid)`) : and(...filters);

  const [rows, totals] = await Promise.all([
    db.select().from(sales).where(pageWhere).orderBy(desc(sales.createdAt), desc(sales.id)).limit(limit + 1),
    cursor
      ? Promise.resolve(undefined)
      : db
          .select({
            count: sql<string>`count(*)`,
            // Old sales carry no money (all 0) and are recorded for tracking only; they are left out of these totals.
            revenue: sql<string>`coalesce(sum(${sales.totalMinor}) FILTER (WHERE NOT ${sales.oldSale}), 0)`,
            balance: sql<string>`coalesce(sum(${sales.totalMinor} - ${sales.paidMinor}) FILTER (WHERE NOT ${sales.oldSale}), 0)`,
            profit: sql<string>`coalesce(sum(${sales.profitMinor}) FILTER (WHERE NOT ${sales.oldSale}), 0)`,
            oldSales: sql<string>`count(*) FILTER (WHERE ${sales.oldSale})`,
          })
          .from(sales)
          .where(and(...filters))
          .then((r) => r[0]),
  ]);
  const more = rows.length > limit;
  const pageRows = more ? rows.slice(0, limit) : rows;
  return {
    items: await buildSales(ctx.tenantId, pageRows),
    nextCursor: more ? encodeCursor(pageRows[pageRows.length - 1]) : null,
    ...(totals ? { totals: { count: Number(totals.count), oldSales: Number(totals.oldSales), revenueMinor: Number(totals.revenue), balanceMinor: Number(totals.balance), profitMinor: Number(totals.profit) } } : {}),
  };
}
export async function getSale(ctx: AuthContext, id: string): Promise<Sale | null> {
  return (await loadSales(ctx.tenantId, id))[0] ?? null;
}

// ------------------------------------------------------------------ creating

export async function createSale(ctx: AuthContext, body: Body): Promise<Sale | Replay<Sale>> {
  const type = body.type;
  if (typeof type !== "string" || !(saleTypes as readonly string[]).includes(type)) throwValidation({ type: `Type must be one of: ${saleTypes.join(", ")}` });

  const clientKey = new Reader({ clientKey: body.clientKey }, ["clientKey"]);
  const key = clientKey.clientKey();
  clientKey.done();

  // A repeated submit of the same form returns the sale that was already saved.
  const replay = async () => {
    if (!key) return null;
    const [row] = await getDb().select({ id: sales.id }).from(sales).where(and(eq(sales.tenantId, ctx.tenantId), eq(sales.clientKey, key)));
    return row ? await getSale(ctx, row.id) : null;
  };
  const existing = await replay();
  if (existing) return new Replay(existing);

  try {
    const id = type === "Retailer Sale" ? await createRetailerSale(ctx, body, key) : await createPackageSale(ctx, body, type as "Package Sale" | "Hosting Sale", key);
    return (await getSale(ctx, id)) as Sale;
  } catch (e) {
    // Two identical submits raced past the check above: answer with the one that won.
    if (uniqueViolation(e) === "sales_tenant_client_key_uq") {
      const won = await replay();
      if (won) return new Replay(won);
    }
    throw e;
  }
}

async function customerById(db: Db, tenantId: string, id: string): Promise<Customer[]> {
  if (!isUuid(id)) return [];
  return (await db.select().from(customers).where(and(eq(customers.id, id), eq(customers.tenantId, tenantId)))).map((r) => toCustomer(r));
}

/** Today's cost basis and stock are read inside the transaction, after the SIM row is locked. */
async function createPackageSale(ctx: AuthContext, body: Body, kind: "Package Sale" | "Hosting Sale", clientKey: string | null): Promise<string> {
  const r = new Reader(body, [
    "type", "clientKey", "imei", "customerId", "customerLink", "packageId", "productId", "platformId", "cardType", "deduction",
    "renewalFee", "simId", "technicianId", "installation", "transport", "commission", "price", "paid", "notes", "deductSim", "smsReminder", "autoRecharge", "otherExpenses",
    "oldSale", "saleDate",
  ]);
  const imei = r.text("imei");
  const linkRaw = r.text("customerLink");
  if (linkRaw !== "automatic" && linkRaw !== "manual") r.errors.customerLink = "Customer link must be automatic or manual";
  const draft: PackageSaleDraft = {
    customerId: r.text("customerId"),
    customerLink: linkRaw === "automatic" ? "automatic" : "manual",
    packageId: r.text("packageId"),
    productId: r.text("productId"),
    platformId: r.text("platformId"),
    cardType: r.text("cardType"),
    renewalFee: r.text("renewalFee"),
    deduction: r.text("deduction"),
    simId: r.text("simId"),
    technicianId: r.text("technicianId"),
    installation: r.text("installation"),
    transport: r.text("transport"),
    commission: r.text("commission"),
    price: r.text("price"),
    paid: r.text("paid"),
    notes: r.text("notes"),
    deductSim: r.bool("deductSim"),
    smsReminder: r.bool("smsReminder"),
    autoRecharge: r.bool("autoRecharge"),
    otherExpenses: r.rows("otherExpenses", ["description", "amount"]) as unknown as PackageSaleDraft["otherExpenses"],
    oldSale: r.bool("oldSale"),
    saleDate: r.text("saleDate"),
  };
  r.done();

  // The server checks the IMEI itself; device details sent by the browser are never used.
  const verification = await verifyImeiOnServer(ctx.tenantId, imei);

  const db = getDb();
  return db.transaction(async (tx) => {
    // Serialises sales that take stock from the same SIM card, so two sales cannot both take the last one.
    if (isUuid(draft.simId)) {
      await tx.select({ id: simCards.id }).from(simCards).where(and(eq(simCards.id, draft.simId), eq(simCards.tenantId, ctx.tenantId))).for("update");
    }
    if (isUuid(draft.platformId)) {
      await tx.select({ id: platformsTable.id }).from(platformsTable).where(and(eq(platformsTable.id, draft.platformId), eq(platformsTable.tenantId, ctx.tenantId))).for("update");
    }
    // Same for the tracker: two sales cannot both sell the last unit.
    if (kind === "Package Sale" && isUuid(draft.productId)) {
      await tx.select({ id: productsTable.id }).from(productsTable).where(and(eq(productsTable.id, draft.productId), eq(productsTable.tenantId, ctx.tenantId))).for("update");
    }
    const [packages, categories, products, platforms, sims, stockRows] = await Promise.all([
      loadPackages(tx, ctx.tenantId),
      loadCategories(tx, ctx.tenantId),
      loadProducts(tx, ctx.tenantId),
      loadPlatforms(tx, ctx.tenantId),
      loadSimCards(tx, ctx.tenantId),
      loadStock(tx, ctx.tenantId),
    ]);
    const customerList = await customerById(tx, ctx.tenantId, draft.customerId);
    const technicianList = isUuid(draft.technicianId)
      ? (await tx.select().from(technicians).where(and(eq(technicians.id, draft.technicianId), eq(technicians.tenantId, ctx.tenantId)))).map(toTechnician)
      : [];

    const { errors, result, saleDate } = validatePackageSale(draft, {
      kind,
      verified: verification.ok ? { device: verification.device, source: verification.source } : null,
      customers: customerList,
      packages, categories, products, platforms, simCards: sims, technicians: technicianList,
      stockOf: stockLookup(stockRows),
      today: todayInNairobi(),
    });
    if (!verification.ok) errors.imei = verification.message;

    // "Automatic" means the device's platform account or contact matched this customer; check that instead of
    // trusting the browser.
    if (draft.customerLink === "automatic" && verification.ok && customerList[0] && !errors.customer) {
      const contact = verification.device.contact;
      const account = verification.device.account;
      const phone = contact?.phone ? validatePhone(contact.phone) : undefined;
      const email = contact?.email ? validateEmail(contact.email) : undefined;
      const conditions = [
        account ? sql`lower(${customers.account}) = lower(${account})` : undefined,
        phone && !phone.error ? eq(customers.phone, phone.value) : undefined,
        email && !email.error ? sql`lower(${customers.email}) = lower(${email.value})` : undefined,
      ].filter((c) => c !== undefined);
      const candidates = conditions.length
        ? await tx.select().from(customers).where(and(eq(customers.tenantId, ctx.tenantId), or(...conditions))).limit(50)
        : [];
      const match = matchCustomer(contact, candidates.map((r) => toCustomer(r)), account);
      if (match.status !== "matched" || match.customer.id !== customerList[0].id) errors.customer = "This customer does not match the device contact. Choose the customer manually";
    }
    if (Object.keys(errors).length || !result) throwValidation(errors);

    const [sale] = await tx
      .insert(sales)
      .values({
        tenantId: ctx.tenantId,
        clientKey,
        type: result.type,
        customerId: result.customerId,
        customerName: result.customerName,
        totalMinor: result.totalMinor,
        paidMinor: result.paidMinor,
        profitMinor: result.profitMinor,
        costMissing: result.costMissing,
        oldSale: result.oldSale,
        // An old sale is dated on its original sale day (midday in Nairobi), so history, Billing and IoT SIM use that date.
        ...(result.oldSale && saleDate ? { createdAt: new Date(`${saleDate}T09:00:00.000Z`) } : {}),
      })
      .returning({ id: sales.id });
    await tx.insert(packageSales).values({
      saleId: sale.id,
      customerLink: result.customerLink,
      imei: result.imei,
      vehiclePlate: result.vehiclePlate,
      gpsAccount: result.gpsAccount,
      verificationSource: result.verificationSource,
      verificationPlatform: result.verificationPlatform,
      packageId: result.packageId,
      packageName: result.packageName,
      trackerProductId: result.tracker?.productId ?? null,
      trackerCategoryName: result.tracker?.categoryName ?? null,
      trackerModel: result.tracker?.model ?? null,
      platformId: result.licence.platformId,
      platformName: result.licence.platformName,
      cardType: result.licence.cardType as (typeof packageSales.$inferInsert)["cardType"],
      deduction: result.licence.deduction,
      renewalFeeMinor: result.licence.renewalFeeMinor,
      platformExpirationDate: result.licence.expirationDate,
      simCardId: result.sim.id,
      simName: result.sim.name,
      simNumber: result.sim.number,
      simDeducted: result.sim.deducted,
      smsReminder: result.sim.smsReminder,
      autoRecharge: result.sim.autoRecharge,
      iotBilling: result.sim.iotBilling,
      technicianId: result.technician?.id ?? null,
      technicianName: result.technician?.name ?? null,
      installationMinor: result.expensesMinor.installation,
      transportMinor: result.expensesMinor.transport,
      commissionMinor: result.expensesMinor.commission,
      notes: result.notes,
      costTrackerMinor: result.costMinor.tracker,
      costSimMinor: result.costMinor.sim,
      costLicenceMinor: result.costMinor.licence,
      // Billing starts from what GPSPlatform reported when the device was sold.
      ...(verification.ok
        ? {
            gpsModel: verification.device.model,
            gpsStatus: verification.device.status ?? null,
            gpsActivationDate: normalizeDate(verification.device.activationDate),
            gpsExpirationDate: normalizeDate(verification.device.expirationDate),
            gpsLastSeen: verification.device.lastSeen && /^\d{4}-\d{2}-\d{2}( \d{2}:\d{2})?$/.test(verification.device.lastSeen) ? verification.device.lastSeen : null,
            gpsSyncedAt: new Date(),
          }
        : {}),
    });
    if (result.expensesMinor.other.length) {
      await tx.insert(packageSaleExpenses).values(result.expensesMinor.other.map((o, position) => ({ saleId: sale.id, position, description: o.description, amountMinor: o.amountMinor })));
    }
    if (result.sim.deducted) {
      await tx.insert(stockAdjustments).values({ tenantId: ctx.tenantId, saleId: sale.id, itemType: "SIM Card", simCardId: result.sim.id, quantity: 1 });
    }
    // The tracker sold and the platform licence used leave inventory (an old sale takes nothing: it was sold before).
    if (result.tracker && !result.oldSale) {
      await tx.insert(stockAdjustments).values({ tenantId: ctx.tenantId, saleId: sale.id, itemType: "Product", productId: result.tracker.productId, quantity: 1 });
    }
    if (result.licence.deduction > 0) {
      await tx.insert(stockAdjustments).values({ tenantId: ctx.tenantId, saleId: sale.id, itemType: "Platform", platformId: result.licence.platformId, cardType: result.licence.cardType as (typeof stockAdjustments.$inferInsert)["cardType"], quantity: result.licence.deduction });
    }
    return sale.id;
  });
}

async function createRetailerSale(ctx: AuthContext, body: Body, clientKey: string | null): Promise<string> {
  const r = new Reader(body, ["type", "clientKey", "customerId", "productLines", "cardLines", "paid"]);
  const draft: RetailerDraft = {
    customerId: r.text("customerId"),
    productLines: r.rows("productLines", ["categoryId", "productId", "quantity", "unitPrice"]) as unknown as RetailerDraft["productLines"],
    cardLines: r.rows("cardLines", ["platformId", "cardType", "quantity", "unitPrice"]) as unknown as RetailerDraft["cardLines"],
    paid: r.text("paid"),
  };
  r.done();

  const db = getDb();
  return db.transaction(async (tx: Tx) => {
    // Lock the products being sold so two sales cannot both take the last units.
    const productIds = [...new Set(draft.productLines.map((l) => l.productId).filter(isUuid))].sort();
    if (productIds.length) {
      await tx.select({ id: productsTable.id }).from(productsTable).where(and(eq(productsTable.tenantId, ctx.tenantId), inArray(productsTable.id, productIds))).for("update");
    }
    const platformIds = [...new Set(draft.cardLines.map((l) => l.platformId).filter(isUuid))].sort();
    if (platformIds.length) {
      await tx.select({ id: platformsTable.id }).from(platformsTable).where(and(eq(platformsTable.tenantId, ctx.tenantId), inArray(platformsTable.id, platformIds))).for("update");
    }
    const [categories, products, platforms, stockRows] = await Promise.all([
      loadCategories(tx, ctx.tenantId),
      loadProducts(tx, ctx.tenantId),
      loadPlatforms(tx, ctx.tenantId),
      loadStock(tx, ctx.tenantId),
    ]);
    const { errors, result } = validateRetailerSale(draft, {
      customers: await customerById(tx, ctx.tenantId, draft.customerId),
      categories, products, platforms,
      stockOf: stockLookup(stockRows),
    });
    if (!result) throwValidation(errors);

    const [sale] = await tx
      .insert(sales)
      .values({
        tenantId: ctx.tenantId,
        clientKey,
        type: "Retailer Sale",
        customerId: result.customerId,
        customerName: result.customerName,
        totalMinor: result.totalMinor,
        paidMinor: result.paidMinor,
        profitMinor: result.profitMinor,
        costMissing: result.costMissing,
      })
      .returning({ id: sales.id });
    if (result.productLines.length) {
      await tx.insert(retailerProductLines).values(
        result.productLines.map((l, position) => ({ saleId: sale.id, position, productId: l.productId, categoryName: l.categoryName, model: l.model, quantity: l.quantity, unitPriceMinor: l.unitPriceMinor, unitCostMinor: l.unitCostMinor })),
      );
      // Products sold leave inventory.
      await tx.insert(stockAdjustments).values(
        result.productLines.map((l) => ({ tenantId: ctx.tenantId, saleId: sale.id, itemType: "Product" as const, productId: l.productId, quantity: l.quantity })),
      );
    }
    if (result.cardLines.length) {
      await tx.insert(retailerCardLines).values(
        result.cardLines.map((l, position) => ({ saleId: sale.id, position, platformId: l.platformId, platformName: l.platformName, cardType: l.cardType as (typeof retailerCardLines.$inferInsert)["cardType"], quantity: l.quantity, unitPriceMinor: l.unitPriceMinor, unitCostMinor: l.unitCostMinor })),
      );
      // Platform cards sold leave inventory.
      await tx.insert(stockAdjustments).values(
        result.cardLines.map((l) => ({ tenantId: ctx.tenantId, saleId: sale.id, itemType: "Platform" as const, platformId: l.platformId, cardType: l.cardType as (typeof stockAdjustments.$inferInsert)["cardType"], quantity: l.quantity })),
      );
    }
    return sale.id;
  });
}
