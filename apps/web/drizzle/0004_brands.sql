CREATE TABLE "brands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brands_name_len" CHECK (char_length("brands"."name") BETWEEN 1 AND 40)
);
--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "brand_id" uuid;--> statement-breakpoint
ALTER TABLE "brands" ADD CONSTRAINT "brands_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "brands_tenant_name_uq" ON "brands" USING btree ("tenant_id",lower("name"));--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customers_brand_idx" ON "customers" USING btree ("brand_id");