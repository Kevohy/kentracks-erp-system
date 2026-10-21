// Creates (or reuses) a company row for LOCAL development and prints its id (use it with `auth:user create --tenant-id`).
// Refuses to run against any database that is not on this machine. Creates no CRM records.
import pg from "pg";

const url = process.env.DATABASE_URL;
const host = (() => { try { return new URL(url ?? "").hostname.replace(/^\[|\]$/g, ""); } catch { return ""; } })();
if (!["localhost", "127.0.0.1", "::1"].includes(host) && !host.endsWith(".localhost")) {
  console.error("Refusing to run: DATABASE_URL must point at localhost.");
  process.exit(1);
}
const name = process.argv[2] ?? "Local development company";
const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  const found = await client.query("select id from tenants where name = $1 limit 1", [name]);
  const id = found.rows[0]?.id ?? (await client.query("insert into tenants (name) values ($1) returning id", [name])).rows[0].id;
  console.log(id);
} finally {
  await client.end();
}
