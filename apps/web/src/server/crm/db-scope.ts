import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Who the database work belongs to, for PostgreSQL row-level security (RLS, migration 0039).
 *
 * Every API request runs in a scope (handle() in http.ts) that getAuthContext fills with the signed-in user's
 * company. Before a pooled connection runs anything, db.ts stamps it with that company (app.tenant_id); the database
 * then shows and accepts only that company's rows, whatever the query says. A scope without a company sees nothing.
 *
 * Work that must span companies (signing in, the public verify page, the background GPS and SMS jobs listing the
 * companies to work on) runs explicitly in asSystem(); per-company job work runs in asTenant().
 */
export type DbScope = { tenantId: string | null; system: boolean };

const g = globalThis as typeof globalThis & { __ktDbScope?: AsyncLocalStorage<DbScope> };
const als = (g.__ktDbScope ??= new AsyncLocalStorage<DbScope>());

/**
 * Runs `fn` in `scope` and awaits it there. The await matters: drizzle queries are lazy and only start when awaited,
 * so a query handed back unawaited would run outside the scope.
 */
const within = <T>(scope: DbScope, fn: () => PromiseLike<T> | T): Promise<T> => als.run(scope, async () => await fn());

/** A request scope with no company yet; getAuthContext sets it once the session is known. */
export const inRequestScope = <T>(fn: () => PromiseLike<T> | T): Promise<T> => within({ tenantId: null, system: false }, fn);

/** Records the signed-in user's company for the rest of this request (no-op outside a request scope). */
export function setScopeTenant(tenantId: string): void {
  const s = als.getStore();
  if (s && !s.system) s.tenantId = tenantId;
}

/** Runs `fn` for one company (background jobs). */
export const asTenant = <T>(tenantId: string, fn: () => PromiseLike<T> | T): Promise<T> => within({ tenantId, system: false }, fn);

/** Runs `fn` across companies: only for system work that is not a user's request (see the list above). */
export const asSystem = <T>(fn: () => PromiseLike<T> | T): Promise<T> => within({ tenantId: null, system: true }, fn);

export const currentScope = (): DbScope | undefined => als.getStore();
