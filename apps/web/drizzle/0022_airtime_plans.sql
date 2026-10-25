CREATE TABLE "airtime_plans" (
	"sale_id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"monthly_amount_minor" bigint NOT NULL,
	"renewal_price_minor" bigint NOT NULL,
	"expiry_source" text NOT NULL,
	"custom_expiry" date,
	"approved_by" uuid,
	"approved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "airtime_plans_amount" CHECK ("airtime_plans"."monthly_amount_minor" BETWEEN 500 AND 1000000 AND "airtime_plans"."renewal_price_minor" >= 0),
	CONSTRAINT "airtime_plans_expiry" CHECK (("airtime_plans"."expiry_source" = 'IMEI' AND "airtime_plans"."custom_expiry" IS NULL) OR ("airtime_plans"."expiry_source" = 'Custom' AND "airtime_plans"."custom_expiry" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "airtime_batches" DROP CONSTRAINT "airtime_batches_amount";--> statement-breakpoint
ALTER TABLE "airtime_batches" ALTER COLUMN "amount_minor" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "airtime_batches" ADD COLUMN "kind" text DEFAULT 'Manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "airtime_plans" ADD CONSTRAINT "airtime_plans_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "airtime_plans" ADD CONSTRAINT "airtime_plans_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "airtime_plans_tenant_idx" ON "airtime_plans" USING btree ("tenant_id");--> statement-breakpoint
ALTER TABLE "airtime_batches" ADD CONSTRAINT "airtime_batches_kind" CHECK ("airtime_batches"."kind" IN ('Manual', 'Monthly'));--> statement-breakpoint
ALTER TABLE "airtime_batches" ADD CONSTRAINT "airtime_batches_amount" CHECK (("airtime_batches"."amount_minor" IS NULL OR "airtime_batches"."amount_minor" BETWEEN 500 AND 1000000) AND "airtime_batches"."recipients" BETWEEN 1 AND 1000);