import { defineConfig } from "drizzle-kit";

// Next reads .env.local; make the db commands read it too when DATABASE_URL is not already set.
if (!process.env.DATABASE_URL) {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    /* no .env.local: DATABASE_URL must come from the shell */
  }
}

export default defineConfig({
  dialect: "postgresql",
  schema: ["./src/server/crm/schema.ts", "./src/server/erp/schema.ts", "./src/server/auth/schema.ts"],
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
});
