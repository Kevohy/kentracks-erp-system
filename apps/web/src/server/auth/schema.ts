import { sql } from "drizzle-orm";
import { boolean, check, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { tenants } from "../crm/schema";

/**
 * Authentication schema. A user belongs to exactly one tenant (company); the tenant used by every
 * CRM / Inventory / Purchases / Sales query is read from the user's server-side session, never from the browser.
 *
 * - Passwords are stored only as salted scrypt hashes (see password.ts). There is no plaintext column.
 * - Sessions store only a SHA-256 hash of the random cookie value, so a database leak does not yield usable cookies.
 * - There is no public sign-up: users are created by an administrator with scripts/user.mts.
 */

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "restrict" }),
    /** Stored lower-cased and trimmed; sign-in is case-insensitive. */
    email: text("email").notNull(),
    fullName: text("full_name").notNull(),
    passwordHash: text("password_hash").notNull(),
    /** A disabled user cannot sign in and every session of theirs stops working immediately. */
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("users_email_uq").on(sql`lower(${t.email})`),
    index("users_tenant_idx").on(t.tenantId),
    check("users_email_format", sql`${t.email} = lower(${t.email}) AND ${t.email} ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]{2,}$' AND char_length(${t.email}) <= 254`),
    check("users_name_length", sql`char_length(${t.fullName}) BETWEEN 1 AND 120`),
    check("users_hash_format", sql`${t.passwordHash} LIKE 'scrypt$%'`),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    /** Hex SHA-256 of the random token held in the browser cookie. */
    tokenHash: text("token_hash").primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    /** Absolute expiry: the session ends here no matter how active it is. */
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    /** "Remember me" was ticked: longer lifetime and a persistent cookie. */
    remember: boolean("remember").notNull().default(false),
    userAgent: text("user_agent"),
  },
  (t) => [
    index("sessions_user_idx").on(t.userId),
    index("sessions_expires_idx").on(t.expiresAt),
    check("sessions_hash_format", sql`${t.tokenHash} ~ '^[0-9a-f]{64}$'`),
    check("sessions_ua_length", sql`char_length(${t.userAgent}) <= 200`),
  ],
);

/** Failed sign-in attempts, used for rate limiting. Keys are hashes (of the email, or of the client address). */
export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scope: text("scope").notNull(),
    keyHash: text("key_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("login_attempts_lookup_idx").on(t.scope, t.keyHash, t.createdAt),
    index("login_attempts_created_idx").on(t.createdAt),
    check("login_attempts_scope", sql`${t.scope} IN ('account', 'ip')`),
  ],
);
