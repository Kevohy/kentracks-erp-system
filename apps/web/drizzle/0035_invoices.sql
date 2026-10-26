CREATE TABLE "invoice_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"kind" text NOT NULL,
	"sale_id" uuid,
	"name" text NOT NULL,
	"quantity" numeric(10, 2) NOT NULL,
	"unit_price_minor" bigint NOT NULL,
	"total_minor" bigint NOT NULL,
	CONSTRAINT "invoice_lines_kind" CHECK ("invoice_lines"."kind" IN ('item', 'expense')),
	CONSTRAINT "invoice_lines_values" CHECK (char_length("invoice_lines"."name") BETWEEN 1 AND 160 AND "invoice_lines"."quantity" > 0 AND "invoice_lines"."unit_price_minor" >= 0 AND "invoice_lines"."total_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"number" text NOT NULL,
	"verify_code" text NOT NULL,
	"customer_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"title" text NOT NULL,
	"invoice_date" date NOT NULL,
	"due_date" date NOT NULL,
	"status" text DEFAULT 'Unpaid' NOT NULL,
	"payment_method" text DEFAULT '' NOT NULL,
	"payment_details" text DEFAULT '' NOT NULL,
	"vat" boolean DEFAULT false NOT NULL,
	"vat_rate" integer DEFAULT 16 NOT NULL,
	"items_minor" bigint NOT NULL,
	"expenses_minor" bigint NOT NULL,
	"vat_minor" bigint NOT NULL,
	"total_minor" bigint NOT NULL,
	"customer_name" text NOT NULL,
	"customer_phone" text DEFAULT '' NOT NULL,
	"customer_email" text DEFAULT '' NOT NULL,
	"customer_location" text DEFAULT '' NOT NULL,
	"brand_name" text NOT NULL,
	"brand_tagline" text DEFAULT '' NOT NULL,
	"brand_phone" text DEFAULT '' NOT NULL,
	"brand_email" text DEFAULT '' NOT NULL,
	"brand_website" text DEFAULT '' NOT NULL,
	"brand_location" text DEFAULT '' NOT NULL,
	"director_name" text DEFAULT '' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone,
	CONSTRAINT "invoices_status" CHECK ("invoices"."status" IN ('Unpaid', 'Paid')),
	CONSTRAINT "invoices_verify_code" CHECK ("invoices"."verify_code" ~ '^[A-Z0-9]{10}$'),
	CONSTRAINT "invoices_dates" CHECK ("invoices"."due_date" >= "invoices"."invoice_date"),
	CONSTRAINT "invoices_vat_rate" CHECK ("invoices"."vat_rate" BETWEEN 0 AND 100),
	CONSTRAINT "invoices_amounts" CHECK ("invoices"."items_minor" >= 0 AND "invoices"."expenses_minor" >= 0 AND "invoices"."vat_minor" >= 0 AND "invoices"."total_minor" = "invoices"."items_minor" + "invoices"."expenses_minor" + "invoices"."vat_minor"),
	CONSTRAINT "invoices_text_len" CHECK (char_length("invoices"."title") BETWEEN 1 AND 120 AND char_length("invoices"."payment_method") <= 40 AND char_length("invoices"."payment_details") <= 200)
);
--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invoice_lines_invoice_idx" ON "invoice_lines" USING btree ("invoice_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_tenant_number_uq" ON "invoices" USING btree ("tenant_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_verify_code_uq" ON "invoices" USING btree ("verify_code");--> statement-breakpoint
CREATE INDEX "invoices_tenant_created_idx" ON "invoices" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "invoices_customer_idx" ON "invoices" USING btree ("tenant_id","customer_id");