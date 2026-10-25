CREATE TABLE "sms_reminder_blocks" (
	"tenant_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"blocked_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sms_reminder_settings" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"message" text NOT NULL,
	"send_hour" integer DEFAULT 9 NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_run_at" timestamp with time zone,
	"last_run_note" text,
	CONSTRAINT "sms_reminder_settings_hour" CHECK ("sms_reminder_settings"."send_hour" BETWEEN 6 AND 20)
);
--> statement-breakpoint
ALTER TABLE "sms_reminder_blocks" ADD CONSTRAINT "sms_reminder_blocks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_reminder_blocks" ADD CONSTRAINT "sms_reminder_blocks_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_reminder_settings" ADD CONSTRAINT "sms_reminder_settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sms_reminder_blocks_uq" ON "sms_reminder_blocks" USING btree ("tenant_id","customer_id");