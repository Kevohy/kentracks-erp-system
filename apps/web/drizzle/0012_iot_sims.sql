CREATE TYPE "public"."iot_billing_period" AS ENUM('Monthly', 'Yearly');--> statement-breakpoint
CREATE TABLE "iot_sim_bills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"sim_card_id" uuid NOT NULL,
	"period" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"lines" integer NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "iot_sim_bills_period" CHECK ("iot_sim_bills"."period" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
	CONSTRAINT "iot_sim_bills_amount" CHECK ("iot_sim_bills"."amount_minor" BETWEEN 0 AND 1000000000 AND "iot_sim_bills"."lines" >= 0),
	CONSTRAINT "iot_sim_bills_note_len" CHECK (char_length("iot_sim_bills"."note") <= 300)
);
--> statement-breakpoint
CREATE TABLE "iot_sim_groups" (
	"sim_card_id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"billing_period" "iot_billing_period" DEFAULT 'Monthly' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "iot_sim_renewals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"sale_id" uuid NOT NULL,
	"amount_minor" bigint NOT NULL,
	"previous_expiry" date,
	"new_expiry" date NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "iot_sim_renewals_amount" CHECK ("iot_sim_renewals"."amount_minor" BETWEEN 0 AND 1000000000),
	CONSTRAINT "iot_sim_renewals_note_len" CHECK (char_length("iot_sim_renewals"."note") <= 300)
);
--> statement-breakpoint
CREATE TABLE "iot_sims" (
	"sale_id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"renewal_fee_minor" bigint,
	"expiry_date" date,
	"suspended" boolean DEFAULT false NOT NULL,
	"suspended_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "iot_sims_fee" CHECK ("iot_sims"."renewal_fee_minor" IS NULL OR "iot_sims"."renewal_fee_minor" BETWEEN 0 AND 1000000000)
);
--> statement-breakpoint
ALTER TABLE "iot_sim_bills" ADD CONSTRAINT "iot_sim_bills_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iot_sim_bills" ADD CONSTRAINT "iot_sim_bills_sim_card_id_sim_cards_id_fk" FOREIGN KEY ("sim_card_id") REFERENCES "public"."sim_cards"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iot_sim_groups" ADD CONSTRAINT "iot_sim_groups_sim_card_id_sim_cards_id_fk" FOREIGN KEY ("sim_card_id") REFERENCES "public"."sim_cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iot_sim_groups" ADD CONSTRAINT "iot_sim_groups_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iot_sim_renewals" ADD CONSTRAINT "iot_sim_renewals_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iot_sim_renewals" ADD CONSTRAINT "iot_sim_renewals_sale_id_package_sales_sale_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."package_sales"("sale_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iot_sims" ADD CONSTRAINT "iot_sims_sale_id_package_sales_sale_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."package_sales"("sale_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iot_sims" ADD CONSTRAINT "iot_sims_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "iot_sim_bills_group_period_uq" ON "iot_sim_bills" USING btree ("tenant_id","sim_card_id","period");--> statement-breakpoint
CREATE INDEX "iot_sim_groups_tenant_idx" ON "iot_sim_groups" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "iot_sim_renewals_tenant_sale_idx" ON "iot_sim_renewals" USING btree ("tenant_id","sale_id","created_at");--> statement-breakpoint
CREATE INDEX "iot_sim_renewals_tenant_created_idx" ON "iot_sim_renewals" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "iot_sims_tenant_idx" ON "iot_sims" USING btree ("tenant_id");