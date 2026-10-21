CREATE TABLE "sale_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"sale_id" uuid NOT NULL,
	"client_key" text,
	"amount_minor" bigint NOT NULL,
	"method" text NOT NULL,
	"reference" text DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"paid_on" date NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sale_payments_amount" CHECK ("sale_payments"."amount_minor" > 0 AND "sale_payments"."amount_minor" <= 100000000000),
	CONSTRAINT "sale_payments_method" CHECK ("sale_payments"."method" IN ('Cash', 'M-Pesa', 'Bank transfer', 'Cheque', 'Card', 'Other')),
	CONSTRAINT "sale_payments_text" CHECK (char_length("sale_payments"."reference") <= 60 AND char_length("sale_payments"."note") <= 300)
);
--> statement-breakpoint
ALTER TABLE "sale_payments" ADD CONSTRAINT "sale_payments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_payments" ADD CONSTRAINT "sale_payments_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sale_payments_tenant_sale_idx" ON "sale_payments" USING btree ("tenant_id","sale_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sale_payments_tenant_client_key_uq" ON "sale_payments" USING btree ("tenant_id","client_key") WHERE "sale_payments"."client_key" IS NOT NULL;