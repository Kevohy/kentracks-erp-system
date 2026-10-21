/**
 * Administrator tool for user accounts. There is no public sign-up and no default account: users are created here,
 * on purpose, by someone with access to the database.
 *
 *   node scripts/user.mts create --email you@company.com --name "Full Name" --tenant-id <uuid>
 *   node scripts/user.mts create --email you@company.com --name "Full Name" --tenant-name "Company" [--create-tenant]
 *   node scripts/user.mts set-password --email you@company.com     (also signs that user out everywhere)
 *   node scripts/user.mts disable --email you@company.com          (also signs that user out everywhere)
 *   node scripts/user.mts enable  --email you@company.com
 *   node scripts/user.mts list
 *
 * DATABASE_URL selects the database. The password is typed at a hidden prompt (twice). For automation use
 * --password-stdin and pipe it in; it is never accepted as a command-line argument (those show up in process lists and shell history).
 * A database that is not on this machine is refused unless you add --allow-remote.
 */
import { createInterface } from "node:readline";
import { parseArgs } from "node:util";
import pg from "pg";
import { MIN_PASSWORD_LENGTH, hashPassword } from "../src/server/auth/password.ts";
import { EMAIL_RE, MAX_PASSWORD_LENGTH } from "../src/lib/auth-validation.ts";

// Same database as the app: read .env.local when DATABASE_URL is not already set in the shell.
if (!process.env.DATABASE_URL) {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    /* no .env.local */
  }
}

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    email: { type: "string" },
    name: { type: "string" },
    "tenant-id": { type: "string" },
    "tenant-name": { type: "string" },
    "create-tenant": { type: "boolean" },
    "password-stdin": { type: "boolean" },
    "allow-remote": { type: "boolean" },
  },
});
const command = positionals[0];
const fail = (msg: string): never => {
  console.error(`Error: ${msg}`);
  process.exit(1);
};

const url = process.env.DATABASE_URL ?? fail("Set DATABASE_URL first.");
const host = (() => { try { return new URL(url).hostname.replace(/^\[|\]$/g, ""); } catch { return fail("DATABASE_URL is not a valid connection string."); } })();
const isLocal = ["localhost", "127.0.0.1", "::1"].includes(host) || host.endsWith(".localhost");
if (!isLocal && !values["allow-remote"]) fail(`DATABASE_URL points at "${host}", which is not this machine. Add --allow-remote if that is intended.`);

function normaliseEmail(): string {
  const e = (values.email ?? "").trim().toLowerCase();
  if (!e || e.length > 254 || !EMAIL_RE.test(e)) fail("Give a valid --email.");
  return e;
}

/** Hidden prompt on a terminal, or one line from stdin with --password-stdin. */
async function readPassword(): Promise<string> {
  let pw: string;
  if (values["password-stdin"]) {
    const rl = createInterface({ input: process.stdin });
    pw = await new Promise<string>((resolve) => rl.once("line", resolve).once("close", () => resolve("")));
    rl.close();
  } else {
    if (!process.stdin.isTTY) fail("Not a terminal. Use --password-stdin to pipe the password in.");
    const ask = (label: string) =>
      new Promise<string>((resolve) => {
        process.stdout.write(label);
        process.stdin.setRawMode(true);
        process.stdin.resume();
        let buf = "";
        const onData = (chunk: Buffer) => {
          for (const ch of chunk.toString("utf8")) {
            if (ch === "\r" || ch === "\n") {
              process.stdin.setRawMode(false);
              process.stdin.pause();
              process.stdin.off("data", onData);
              process.stdout.write("\n");
              return resolve(buf);
            }
            if (ch === "\u0003") process.exit(130);
            if (ch === "\u007f" || ch === "\b") buf = buf.slice(0, -1);
            else buf += ch;
          }
        };
        process.stdin.on("data", onData);
      });
    pw = await ask("New password: ");
    if (pw !== (await ask("Repeat password: "))) fail("The two passwords differ.");
  }
  if (pw.length < MIN_PASSWORD_LENGTH) fail(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
  if (pw.length > MAX_PASSWORD_LENGTH) fail(`Use at most ${MAX_PASSWORD_LENGTH} characters.`);
  return pw;
}

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  console.log(`Database: ${host}`);
  if (command === "create") {
    const email = normaliseEmail();
    const fullName = (values.name ?? "").trim().replace(/\s+/g, " ");
    if (!fullName || fullName.length > 120) fail("Give --name (1-120 characters).");
    let tenantId = values["tenant-id"];
    if (tenantId) {
      const t = await client.query("select id from tenants where id = $1", [tenantId]).catch(() => ({ rows: [] }));
      if (!t.rows[0]) fail("No company has that --tenant-id.");
    } else if (values["tenant-name"]) {
      const found = await client.query("select id from tenants where name = $1", [values["tenant-name"]]);
      if (found.rows.length > 1) fail("More than one company has that name; use --tenant-id.");
      tenantId = found.rows[0]?.id;
      if (!tenantId) {
        if (!values["create-tenant"]) fail(`No company named "${values["tenant-name"]}". Add --create-tenant to create it.`);
        tenantId = (await client.query("insert into tenants (name) values ($1) returning id", [values["tenant-name"]])).rows[0].id;
        console.log(`Created company "${values["tenant-name"]}" (${tenantId}).`);
      }
    } else fail("Give --tenant-id or --tenant-name: every user belongs to one company.");
    if ((await client.query("select 1 from users where lower(email) = $1", [email])).rowCount) fail("A user with that email already exists.");
    const hash = await hashPassword(await readPassword());
    await client.query("insert into users (tenant_id, email, full_name, password_hash) values ($1, $2, $3, $4)", [tenantId, email, fullName, hash]);
    console.log(`Created user ${email} in company ${tenantId}.`);
  } else if (command === "set-password") {
    const email = normaliseEmail();
    const u = await client.query("select id from users where lower(email) = $1", [email]);
    if (!u.rows[0]) fail("No user with that email.");
    const hash = await hashPassword(await readPassword());
    await client.query("update users set password_hash = $2, updated_at = now() where id = $1", [u.rows[0].id, hash]);
    const gone = await client.query("delete from sessions where user_id = $1", [u.rows[0].id]);
    console.log(`Password changed for ${email}. ${gone.rowCount} session(s) ended.`);
  } else if (command === "disable" || command === "enable") {
    const email = normaliseEmail();
    const r = await client.query("update users set is_active = $2, updated_at = now() where lower(email) = $1 returning id", [email, command === "enable"]);
    if (!r.rows[0]) fail("No user with that email.");
    if (command === "disable") await client.query("delete from sessions where user_id = $1", [r.rows[0].id]);
    console.log(`${email} is now ${command}d.`);
  } else if (command === "list") {
    const r = await client.query("select u.email, u.full_name, t.name as company, u.is_active, u.last_login_at from users u join tenants t on t.id = u.tenant_id order by u.email");
    if (!r.rows.length) console.log("No users yet.");
    for (const u of r.rows) console.log(`${u.is_active ? "active  " : "disabled"}  ${u.email}  ${u.full_name}  [${u.company}]  last sign-in: ${u.last_login_at?.toISOString() ?? "never"}`);
  } else {
    fail("Commands: create, set-password, disable, enable, list. See the comment at the top of scripts/user.mts.");
  }
} finally {
  await client.end();
}
