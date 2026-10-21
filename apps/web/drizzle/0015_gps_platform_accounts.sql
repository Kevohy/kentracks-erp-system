CREATE TABLE "gps_platform_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"account" text NOT NULL,
	"password_md5" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gps_platform_accounts_platform" CHECK ("gps_platform_accounts"."platform" IN ('kentracks')),
	CONSTRAINT "gps_platform_accounts_account" CHECK (char_length("gps_platform_accounts"."account") BETWEEN 1 AND 64),
	CONSTRAINT "gps_platform_accounts_md5" CHECK ("gps_platform_accounts"."password_md5" ~ '^[0-9a-f]{32}$')
);
--> statement-breakpoint
ALTER TABLE "gps_platform_accounts" ADD CONSTRAINT "gps_platform_accounts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "gps_platform_accounts_uq" ON "gps_platform_accounts" USING btree ("tenant_id","platform",lower("account"));--> statement-breakpoint
CREATE INDEX "gps_platform_accounts_tenant_idx" ON "gps_platform_accounts" USING btree ("tenant_id","platform","created_at");--> statement-breakpoint
INSERT INTO "gps_platform_accounts" ("tenant_id", "platform", "account", "password_md5", "created_by", "created_at", "updated_at")
SELECT "tenant_id", 'kentracks', "account", "password_md5", "updated_by", "updated_at", "updated_at" FROM "gps_platform_settings";
