CREATE TABLE "airtime_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"client_key" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"recipients" integer NOT NULL,
	"sent" integer DEFAULT 0 NOT NULL,
	"failed" integer DEFAULT 0 NOT NULL,
	"total_amount" text,
	"total_discount" text,
	"error" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "airtime_batches_amount" CHECK ("airtime_batches"."amount_minor" BETWEEN 500 AND 1000000 AND "airtime_batches"."recipients" BETWEEN 1 AND 1000)
);
--> statement-breakpoint
CREATE TABLE "airtime_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"sale_id" uuid,
	"phone" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"status" text NOT NULL,
	"request_id" text,
	"discount" text,
	"error" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "airtime_items_status" CHECK ("airtime_items"."status" IN ('Pending', 'Sent', 'Failed', 'Unknown'))
);
--> statement-breakpoint
ALTER TABLE "airtime_batches" ADD CONSTRAINT "airtime_batches_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "airtime_items" ADD CONSTRAINT "airtime_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "airtime_items" ADD CONSTRAINT "airtime_items_batch_id_airtime_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."airtime_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "airtime_items" ADD CONSTRAINT "airtime_items_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "airtime_batches_tenant_client_key_uq" ON "airtime_batches" USING btree ("tenant_id","client_key");--> statement-breakpoint
CREATE INDEX "airtime_batches_tenant_created_idx" ON "airtime_batches" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "airtime_items_batch_idx" ON "airtime_items" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "airtime_items_tenant_sale_idx" ON "airtime_items" USING btree ("tenant_id","sale_id","updated_at");