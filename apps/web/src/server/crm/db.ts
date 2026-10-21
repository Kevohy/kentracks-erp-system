import "server-only";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { ApiError } from "./http";
import * as authSchema from "../auth/schema";
import * as erpSchema from "../erp/schema";
import * as crmSchema from "./schema";

const schema = { ...crmSchema, ...erpSchema, ...authSchema };

type Db = NodePgDatabase<typeof schema>;
const g = globalThis as unknown as { __crmPool?: Pool; __crmDb?: Db };

/** Lazily created so `next build` never needs a database. Credentials stay on the server. */
export function getDb(): Db {
  if (g.__crmDb) return g.__crmDb;
  const url = process.env.DATABASE_URL;
  if (!url) throw new ApiError(503, "The database is not configured");
  g.__crmPool = new Pool({ connectionString: url, max: 10, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30_000 });
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
