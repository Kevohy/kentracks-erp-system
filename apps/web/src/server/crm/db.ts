import "server-only";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool, type PoolClient } from "pg";
import { currentScope } from "./db-scope";
import { ApiError } from "./http";
import * as authSchema from "../auth/schema";
import * as erpSchema from "../erp/schema";
import * as crmSchema from "./schema";

const schema = { ...crmSchema, ...erpSchema, ...authSchema };

type Db = NodePgDatabase<typeof schema>;
const g = globalThis as unknown as { __crmPool?: Pool; __crmDb?: Db };

type Scoped = PoolClient & { __ktScope?: string; __ktRole?: boolean };

let warned = false;
/**
 * A superuser (or a role allowed to bypass RLS) would skip every row-level rule. On such a connection, switch to the
 * restricted kt_rls role (created by migration 0039) so the rules apply; done once per connection.
 */
async function restrict(client: Scoped): Promise<void> {
  if (client.__ktRole) return;
  const r = await client.query<{ skips: boolean; has: boolean }>(
    "SELECT (r.rolsuper OR r.rolbypassrls) AS skips, EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kt_rls') AS has FROM pg_roles r WHERE r.rolname = current_user");
  const { skips, has } = r.rows[0] ?? { skips: false, has: false };
  if (skips && has) await client.query("SET ROLE kt_rls");
  else if (skips && !warned) {
    warned = true;
    console.error("[db] The database user can bypass row-level security and the kt_rls role is missing: run the database updates (migration 0039).");
  }
  client.__ktRole = true;
}

/** Puts the current company (db-scope.ts) on the connection, if it is not there already. */
async function stamp(client: Scoped): Promise<void> {
  await restrict(client);
  const s = currentScope();
  const tenant = s?.system ? "" : (s?.tenantId ?? "");
  const system = s?.system ? "on" : "off";
  const key = `${tenant}|${system}`;
  if (client.__ktScope === key) return;
  client.__ktScope = undefined;
  await client.query("SELECT set_config('app.tenant_id', $1, false), set_config('app.rls_system', $2, false)", [tenant, system]);
  client.__ktScope = key;
}

/**
 * Makes every connection of the pool carry the current company before any query runs, so PostgreSQL's row-level
 * security (migration 0039) applies to every query: drizzle takes a client for transactions (connect) and runs
 * everything else on the pool (query). A connection is stamped again only when the company changes, so most queries
 * cost nothing extra. Without a company the database shows no company rows at all.
 */
function scoped(pool: Pool): Pool {
  const connect = pool.connect.bind(pool) as () => Promise<PoolClient>;
  const scopedConnect = async (): Promise<PoolClient> => {
    const client = (await connect()) as Scoped;
    try {
      await stamp(client);
    } catch (e) {
      client.release(e as Error);
      throw e;
    }
    return client;
  };
  const scopedQuery = async (...args: unknown[]) => {
    const client = (await connect()) as Scoped;
    let broken: Error | undefined;
    try {
      await stamp(client);
      return await (client.query as unknown as (...a: unknown[]) => Promise<unknown>)(...args);
    } catch (e) {
      if (e instanceof Error && /Connection terminated|ECONNRESET|connection.*closed/i.test(e.message)) broken = e;
      throw e;
    } finally {
      client.release(broken); // a broken connection is dropped, not reused
    }
  };
  Object.assign(pool, { connect: scopedConnect, query: scopedQuery });
  return pool;
}

/** Lazily created so `next build` never needs a database. Credentials stay on the server. */
export function getDb(): Db {
  if (g.__crmDb) return g.__crmDb;
  const url = process.env.DATABASE_URL;
  if (!url) throw new ApiError(503, "The database is not configured");
  g.__crmPool = scoped(new Pool({ connectionString: url, max: 10, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30_000 }));
  g.__crmPool.on("error", (e) => console.error("[crm] idle database client error:", e.message));
  g.__crmDb = drizzle(g.__crmPool, { schema });
  return g.__crmDb;
}

/** True only for a connection string that points at this machine. */
export function isLocalDatabaseUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const host = new URL(url).hostname.replace(/^\[|\]$/g, "");
    return host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".localhost");
  } catch {
    return false;
  }
}
