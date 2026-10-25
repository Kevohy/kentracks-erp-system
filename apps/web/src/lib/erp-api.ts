import { call } from "./crm-api";
import type { Platform, Product, ProductCategory, SimCard } from "./inventory";
import type { Purchase } from "./purchases";
import type { PurchaseDraft } from "./purchase-validation";
import type { RetailerDraft } from "./retailer-validation";
import type { PackageSaleDraft } from "./sale-validation";
import type { Sale, SalePackage, SalesPage, SimService } from "./sales";
import type { GpsAccountStatus, GpsPlatformInfo } from "./gps-platforms";
import type { DashboardSummary } from "./dashboard";
import type { AfricasTalkingStatus, AirtimeBatch, AirtimeLine, AirtimeMonthly, AirtimeOverview, AirtimePlanDraft } from "./airtime";
import type { PaymentDraft, SalePayments } from "./sale-payments";
import type { SmsAudience, SmsBatch, SmsCustomer, SmsKind, SmsOverview, SmsReminderLine, SmsReminderSettings, SmsTemplate, SmsTemplateDraft, TextSmsStatus } from "./sms";
import type { VerifyOutcome } from "./gps-platform";

import type { BillingCustomer, BillingFilter, BillingPage, BillingSyncResult } from "./billing";
import type { BillingPeriod, IotBill, IotClientsPage, IotGroupsResult, IotOverview, IotRenewal, IotRenewalsResult, IotSim, IotSimsPage } from "./iot-sims";

/** Browser client for the Inventory, Purchases, Sales and Settings API (src/app/api). Same-origin; no secrets here. */

export type { StockRow } from "./purchases";
import type { StockRow } from "./purchases";

export const erpApi = {
  textSms: {
    get: () => call<TextSmsStatus>("GET", "/api/settings/textsms"),
  },
  sms: {
    overview: () => call<SmsOverview>("GET", "/api/sms/overview"),
    customers: () => call<SmsCustomer[]>("GET", "/api/sms/customers"),
    reminders: (type: "airtime" | "expiry") => call<SmsReminderLine[]>("GET", `/api/sms/reminders?type=${type}`),
    /** `clientKey` makes a repeated submit return the same send instead of sending again. */
    send: (draft: { kind: SmsAudience; ids?: string[]; phones?: string; message: string; templateName?: string; scheduleAt?: string; clientKey: string }) =>
      call<SmsBatch>("POST", "/api/sms/send", draft),
    history: (kind?: SmsKind) => call<SmsBatch[]>("GET", `/api/sms/history${kind ? `?kind=${kind}` : ""}`),
    batch: (id: string) => call<SmsBatch>("GET", `/api/sms/batches/${encodeURIComponent(id)}`),
    delivery: (id: string) => call<SmsBatch>("POST", `/api/sms/batches/${encodeURIComponent(id)}/delivery`, {}),
    templates: () => call<SmsTemplate[]>("GET", "/api/sms/templates"),
    createTemplate: (d: SmsTemplateDraft) => call<SmsTemplate>("POST", "/api/sms/templates", d),
    updateTemplate: (id: string, d: SmsTemplateDraft) => call<SmsTemplate>("PUT", `/api/sms/templates/${encodeURIComponent(id)}`, d),
    deleteTemplate: (id: string) => call<{ deleted: true }>("DELETE", `/api/sms/templates/${encodeURIComponent(id)}`),
    reminderSettings: () => call<SmsReminderSettings>("GET", "/api/sms/reminder-settings"),
    saveReminderSettings: (d: { enabled: boolean; message: string; sendHour: string }) => call<SmsReminderSettings>("PUT", "/api/sms/reminder-settings", d),
    block: (customerId: string, blocked: boolean) => call<{ blocked: boolean }>("POST", `/api/sms/blocks/${encodeURIComponent(customerId)}`, { blocked }),
    /** Send today's monthly airtime reminders now (what the automatic job does). */
    runReminders: () => call<{ due: number; batch: SmsBatch | null; note: string; settings: SmsReminderSettings }>("POST", "/api/sms/reminders/run", {}),
  },
  africasTalking: {
    get: () => call<AfricasTalkingStatus>("GET", "/api/settings/africastalking"),
    test: () => call<{ ok: boolean; balance?: string; message?: string }>("POST", "/api/settings/africastalking/test"),
  },
  airtime: {
    lines: () => call<AirtimeLine[]>("GET", "/api/airtime/lines"),
    history: () => call<AirtimeBatch[]>("GET", "/api/airtime/history"),
    /** `clientKey` makes a repeated submit return the same send instead of sending airtime again. */
    send: (saleIds: string[], amount: string, clientKey: string) => call<AirtimeBatch>("POST", "/api/airtime/send", { saleIds, amount, clientKey }),
    monthly: () => call<AirtimeMonthly>("GET", "/api/airtime/monthly"),
    overview: () => call<AirtimeOverview>("GET", "/api/airtime/overview"),
    suspend: (saleId: string, suspended: boolean) => call<AirtimeMonthly>("POST", `/api/airtime/plans/${encodeURIComponent(saleId)}/suspend`, { suspended }),
    topUp: (phone: string, amount: string, clientKey: string) => call<AirtimeBatch>("POST", "/api/airtime/topup", { phone, amount, clientKey }),
    remove: (saleId: string, next: "None" | "SMS reminder", notify: "sms" | "none", message: string) =>
      call<{ monthly: AirtimeMonthly; sms: { status: "Sent" | "Failed"; error: string | null } | null }>("POST", `/api/airtime/plans/${encodeURIComponent(saleId)}/remove`, { next, notify, message }),
    candidates: () => call<AirtimeLine[]>("GET", "/api/airtime/candidates"),
    subscribe: (saleId: string, reason: string) => call<AirtimeMonthly>("POST", `/api/airtime/subscribe/${encodeURIComponent(saleId)}`, { reason }),
    approve: (saleId: string, draft: AirtimePlanDraft) => call<AirtimeMonthly>("PUT", `/api/airtime/plans/${encodeURIComponent(saleId)}`, draft),
    stop: (saleId: string) => call<AirtimeMonthly>("DELETE", `/api/airtime/plans/${encodeURIComponent(saleId)}`),
    imeiExpiry: (saleId: string) => call<{ imeiExpiry: string | null; lifelong: boolean; message?: string }>("POST", `/api/airtime/plans/${encodeURIComponent(saleId)}/imei-expiry`, {}),
    sendMonthly: (saleIds: string[], clientKey: string) => call<AirtimeBatch>("POST", "/api/airtime/send-monthly", { saleIds, clientKey }),
  },
  dashboard: { get: () => call<DashboardSummary>("GET", "/api/dashboard") },
  gps: {
    /** Verify one IMEI on the server with the company's GPS platform accounts. */
    verify: (imei: string) => call<VerifyOutcome>("GET", `/api/gps/verify?${new URLSearchParams({ imei })}`),
    /** How IMEIs are verified for this company: Kentracks, the development mock, or not connected. */
    mode: () => call<{ mode: "live" | "mock" | "none"; accounts: number; platforms: string[] }>("GET", "/api/gps/mode"),
  },
  categories: {
    list: () => call<ProductCategory[]>("GET", "/api/inventory/categories"),
    create: (name: string) => call<ProductCategory>("POST", "/api/inventory/categories", { name }),
  },
  products: {
    list: () => call<Product[]>("GET", "/api/inventory/products"),
    create: (category: string, model: string) => call<Product>("POST", "/api/inventory/products", { category, model }),
  },
  simCards: {
    list: () => call<SimCard[]>("GET", "/api/inventory/sim-cards"),
    create: (name: string, type: string) => call<SimCard>("POST", "/api/inventory/sim-cards", { name, type }),
  },
  platforms: {
    list: () => call<Platform[]>("GET", "/api/inventory/platforms"),
    create: (name: string) => call<Platform>("POST", "/api/inventory/platforms", { name }),
  },
  stock: { list: () => call<StockRow[]>("GET", "/api/inventory/stock") },
  purchases: {
    list: () => call<Purchase[]>("GET", "/api/purchases"),
    /** `clientKey` makes a repeated submit of the same form return the saved purchase instead of adding another. */
    create: (draft: PurchaseDraft, clientKey: string) => call<Purchase>("POST", "/api/purchases", { ...draft, clientKey }),
  },
  sales: {
    list: () => call<Sale[]>("GET", "/api/sales"),
    get: (id: string) => call<Sale>("GET", `/api/sales/${id}`),
    /** One page of the sale history (newest first) with totals on the first page. */
    history: (o: { cursor?: string | null; q?: string; type?: string; limit?: number }) => {
      const p = new URLSearchParams();
      if (o.cursor) p.set("cursor", o.cursor);
      if (o.q) p.set("q", o.q);
      if (o.type) p.set("type", o.type);
      p.set("limit", String(o.limit ?? 50));
      return call<SalesPage>("GET", `/api/sales/history?${p}`);
    },
    createPackage: (kind: "Package Sale" | "Hosting Sale", imei: string, draft: PackageSaleDraft, clientKey: string) =>
      call<Sale>("POST", "/api/sales", { ...draft, type: kind, imei, clientKey }),
    createRetailer: (draft: RetailerDraft, clientKey: string) => call<Sale>("POST", "/api/sales", { ...draft, type: "Retailer Sale", clientKey }),
    payments: (id: string) => call<SalePayments>("GET", `/api/sales/${id}/payments`),
    /** `clientKey` makes a repeated submit of the same payment form return the saved payment instead of adding another. */
    recordPayment: (id: string, draft: PaymentDraft, clientKey: string) =>
      call<{ sale: Sale; payments: SalePayments }>("POST", `/api/sales/${id}/payments`, { ...draft, clientKey }),
    /** Change the airtime service of a sold tracker SIM (logged in the sale's history). */
    changeService: (id: string, service: SimService, reason: string) => call<Sale>("POST", `/api/sales/${id}/sim-service`, { service, reason }),
  },
  billing: {
    /** One page of customers with their tracked vehicles, plus totals. */
    page: (o: { q?: string; filter?: BillingFilter; offset?: number; limit?: number }) => {
      const p = new URLSearchParams();
      if (o.q) p.set("q", o.q);
      if (o.filter && o.filter !== "All") p.set("filter", o.filter);
      p.set("offset", String(o.offset ?? 0));
      p.set("limit", String(o.limit ?? 20));
      return call<BillingPage>("GET", `/api/billing?${p}`);
    },
    /** Ask GPSPlatform for fresh device details for these customers. */
    sync: (customerIds: string[], force = false) => call<BillingSyncResult>("POST", "/api/billing/sync", { customerIds, force }),
    /** Change the renewal fee of one sold device (not for Lifelong Cards). Returns the customer again. */
    updateRenewalFee: (saleId: string, renewalFee: string) => call<BillingCustomer>("PUT", `/api/billing/renewal-fee/${saleId}`, { renewalFee }),
  },
  iotSims: {
    clients: (o: { q?: string; offset?: number; limit?: number }) =>
      call<IotClientsPage>("GET", `/api/iot-sims/clients?${new URLSearchParams({ q: o.q ?? "", offset: String(o.offset ?? 0), limit: String(o.limit ?? 20) })}`),
    groups: () => call<IotGroupsResult>("GET", "/api/iot-sims/groups"),
    groupSims: (id: string, o: { q?: string; offset?: number; limit?: number } = {}) =>
      call<IotSimsPage>("GET", `/api/iot-sims/groups/${id}/sims?${new URLSearchParams({ q: o.q ?? "", offset: String(o.offset ?? 0), limit: String(o.limit ?? 50) })}`),
    updateGroup: (id: string, billingPeriod: BillingPeriod) => call<{ billingPeriod: BillingPeriod }>("PUT", `/api/iot-sims/groups/${id}`, { billingPeriod }),
    bills: (id: string) => call<IotBill[]>("GET", `/api/iot-sims/groups/${id}/bills`),
    recordBill: (id: string, v: { period: string; amount: string; note: string }) => call<IotBill>("POST", `/api/iot-sims/groups/${id}/bills`, v),
    overview: () => call<IotOverview>("GET", "/api/iot-sims/overview"),
    renewals: () => call<IotRenewalsResult>("GET", "/api/iot-sims/renewals"),
    update: (saleId: string, v: { renewalFee: string; expiryDate: string }) => call<IotSim>("PUT", `/api/iot-sims/${saleId}`, v),
    renew: (saleId: string, v: { amount: string; newExpiry: string; note: string }) => call<IotSim>("POST", `/api/iot-sims/${saleId}/renew`, v),
    suspend: (saleId: string, suspended: boolean) => call<IotSim>("POST", `/api/iot-sims/${saleId}/suspend`, { suspended }),
    history: (saleId: string) => call<IotRenewal[]>("GET", `/api/iot-sims/${saleId}/renewals`),
  },
  gpsPlatforms: {
    list: () => call<GpsPlatformInfo[]>("GET", "/api/settings/gps-platforms"),
    /** Signs in with these details and adds the account only if the platform accepts them. */
    add: (platform: string, account: string, password: string) => call<GpsAccountStatus>("POST", `/api/settings/gps-platforms/${platform}/accounts`, { account, password }),
    /** An empty password keeps the saved one. */
    update: (id: string, account: string, password: string) => call<GpsAccountStatus>("PUT", `/api/settings/gps-platforms/accounts/${id}`, { account, password }),
    remove: (id: string) => call<{ id: string }>("DELETE", `/api/settings/gps-platforms/accounts/${id}`),
    test: (id: string) => call<{ ok: boolean; message?: string; account: GpsAccountStatus }>("POST", `/api/settings/gps-platforms/accounts/${id}/test`),
  },
  packages: {
    list: () => call<SalePackage[]>("GET", "/api/settings/packages"),
    create: (name: string) => call<SalePackage>("POST", "/api/settings/packages", { name }),
    update: (id: string, name: string) => call<SalePackage>("PUT", `/api/settings/packages/${id}`, { name }),
  },
};

/** A new random key for one form submission. */
export const newClientKey = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
