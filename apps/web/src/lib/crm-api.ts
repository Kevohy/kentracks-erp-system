import type { Brand } from "./brands";
import type { Customer, CustomerType } from "./customers";
import type { Supplier, SupplierType } from "./suppliers";
import type { Technician } from "./technicians";

/** Browser client for the CRM API (src/app/api/crm). Same-origin; no secrets here. */

export type ApiFailure = { ok: false; message: string; fieldErrors: Record<string, string> };
export type ApiResult<T> = { ok: true; data: T } | ApiFailure;
/** What the add/edit dialogs need back from a save. */
export type SaveResult = { ok: true } | ApiFailure;

export async function call<T>(method: string, url: string, body?: unknown): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.status === 204) return { ok: true, data: undefined as T };
    const payload = (await res.json().catch(() => null)) as { error?: string; errors?: Record<string, string> } | null;
    if (res.ok) return { ok: true, data: payload as T };
    if (res.status === 401 && typeof window !== "undefined" && !/^\/(login|forgot-password)/.test(window.location.pathname)) {
      // The session ended (expired, signed out elsewhere, or the account was disabled): go back to sign in, then return here.
      // A full page load on purpose: it discards the in-memory app state and re-runs the sign-in check.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = `/login?expired=1&next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
    }
    return {
      ok: false,
      message: res.status === 401 ? "Your session has ended. Redirecting to sign in…" : (payload?.error ?? "Something went wrong. Please try again."),
      fieldErrors: payload?.errors ?? {},
    };
  } catch {
    return { ok: false, message: "Could not reach the server. Check your connection and try again.", fieldErrors: {} };
  }
}

type Values = Partial<Record<string, string>>;

export const crmApi = {
  brands: {
    list: () => call<Brand[]>("GET", "/api/settings/brands"),
    create: (name: string) => call<Brand>("POST", "/api/settings/brands", { name }),
    update: (id: string, name: string) => call<Brand>("PUT", `/api/settings/brands/${id}`, { name }),
  },
  customers: {
    list: () => call<Customer[]>("GET", "/api/crm/customers"),
    create: (type: CustomerType, v: Values) => call<Customer>("POST", "/api/crm/customers", { type, ...v }),
    update: (id: string, type: CustomerType, v: Values) => call<Customer>("PUT", `/api/crm/customers/${id}`, { type, ...v }),
    remove: (id: string) => call<void>("DELETE", `/api/crm/customers/${id}`),
  },
  suppliers: {
    list: () => call<Supplier[]>("GET", "/api/crm/suppliers"),
    create: (type: SupplierType, v: Values) => call<Supplier>("POST", "/api/crm/suppliers", { type, ...v }),
    update: (id: string, type: SupplierType, v: Values) => call<Supplier>("PUT", `/api/crm/suppliers/${id}`, { type, ...v }),
    remove: (id: string) => call<void>("DELETE", `/api/crm/suppliers/${id}`),
  },
  technicians: {
    list: () => call<Technician[]>("GET", "/api/crm/technicians"),
    create: (v: Values) => call<Technician>("POST", "/api/crm/technicians", v),
    update: (id: string, v: Values) => call<Technician>("PUT", `/api/crm/technicians/${id}`, v),
    remove: (id: string) => call<void>("DELETE", `/api/crm/technicians/${id}`),
  },
};
