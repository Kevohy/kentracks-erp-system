CREATE TABLE "sale_service_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"sale_id" uuid NOT NULL,
	"from_service" text NOT NULL,
	"to_service" text NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"sms_status" text,
	"sms_error" text,
	"changed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sale_service_changes_service" CHECK ("sale_service_changes"."from_service" IN ('None', 'SMS reminder', 'Automatic airtime recharge') AND "sale_service_changes"."to_service" IN ('None', 'SMS reminder', 'Automatic airtime recharge')),
	CONSTRAINT "sale_service_changes_sms" CHECK ("sale_service_changes"."sms_status" IS NULL OR "sale_service_changes"."sms_status" IN ('Sent', 'Failed'))
);
--> statement-breakpoint
ALTER TABLE "airtime_plans" ADD COLUMN "suspended_reason" text;--> statement-breakpoint
ALTER TABLE "sale_service_changes" ADD CONSTRAINT "sale_service_changes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_service_changes" ADD CONSTRAINT "sale_service_changes_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sale_service_changes_sale_idx" ON "sale_service_changes" USING btree ("tenant_id","sale_id","created_at");--> statement-breakpoint
ALTER TABLE "airtime_plans" ADD CONSTRAINT "airtime_plans_suspended_reason" CHECK ("airtime_plans"."suspended_reason" IS NULL OR "airtime_plans"."suspended_reason" IN ('Manual', 'Expired'));--> statement-breakpoint
UPDATE "airtime_plans" SET "suspended_reason" = 'Manual' WHERE "suspended" AND "suspended_reason" IS NULL;
