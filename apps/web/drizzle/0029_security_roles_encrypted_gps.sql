ALTER TABLE "gps_platform_accounts" DROP CONSTRAINT "gps_platform_accounts_md5";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "role" text DEFAULT 'staff' NOT NULL;--> statement-breakpoint
-- Everyone who could sign in before roles existed keeps full access. New users are staff unless created as admins.
UPDATE "users" SET "role" = 'admin';--> statement-breakpoint
ALTER TABLE "gps_platform_accounts" ADD CONSTRAINT "gps_platform_accounts_md5" CHECK ("gps_platform_accounts"."password_md5" ~ '^[0-9a-f]{32}$' OR "gps_platform_accounts"."password_md5" ~ '^v1:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$');--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role" CHECK ("users"."role" IN ('admin', 'staff'));