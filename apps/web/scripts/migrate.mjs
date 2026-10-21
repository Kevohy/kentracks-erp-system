/**
 * Applies the database migrations in ./drizzle (the same files `drizzle-kit migrate` uses) and exits. The production
 * container runs this before the app starts, so every deploy brings the database up to date first. Migrations that
 * were already applied are skipped; if one fails the container stops and the app does not start on a half-updated
 * database. The connection string is never printed.
 */
import path from "node:path";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("[migrate] DATABASE_URL is not set.");
  process.exit(1);
}
const folder = process.env.MIGRATIONS_DIR || path.join(import.meta.dirname, "..", "drizzle");

// The database may still be starting (first deploy): try for about a minute.
const pool = new pg.Pool({ connectionString: url, max: 1, connectionTimeoutMillis: 5000 });
for (let attempt = 1; ; attempt++) {
  try {
    await pool.query("select 1");
    break;
  } catch (e) {
    if (attempt >= 12) {
      console.error(`[migrate] Could not reach the database: ${e.code ?? e.message}`);
      process.exit(1);
    }
    console.log(`[migrate] Waiting for the database (${attempt})…`);
    await new Promise((r) => setTimeout(r, 5000));
  }
}

try {
  const started = Date.now();
  await migrate(drizzle(pool), { migrationsFolder: folder });
  console.log(`[migrate] Database is up to date (${Date.now() - started} ms).`);
} catch (e) {
  console.error(`[migrate] Migration failed: ${e.cause?.message ?? e.message}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
