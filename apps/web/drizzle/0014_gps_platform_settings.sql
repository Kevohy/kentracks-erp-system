CREATE TABLE "gps_platform_settings" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"account" text NOT NULL,
	"password_md5" text NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gps_platform_settings_account" CHECK (char_length("gps_platform_settings"."account") BETWEEN 1 AND 64),
	CONSTRAINT "gps_platform_settings_md5" CHECK ("gps_platform_settings"."password_md5" ~ '^[0-9a-f]{32}$')
);
--> statement-breakpoint
ALTER TABLE "gps_platform_settings" ADD CONSTRAINT "gps_platform_settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;