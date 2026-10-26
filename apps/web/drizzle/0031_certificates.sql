CREATE TABLE "certificates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"number" text NOT NULL,
	"sale_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"customer_name" text NOT NULL,
	"customer_phone" text DEFAULT '' NOT NULL,
	"customer_account" text DEFAULT '' NOT NULL,
	"imei" text NOT NULL,
	"device_model" text DEFAULT '' NOT NULL,
	"sim_number" text DEFAULT '' NOT NULL,
	"technician_name" text DEFAULT '' NOT NULL,
	"vehicle_reg" text NOT NULL,
	"make" text NOT NULL,
	"model" text NOT NULL,
	"year" integer NOT NULL,
	"chassis" text NOT NULL,
	"contract_years" integer,
	"installed_on" date NOT NULL,
	"valid_until" date,
	"brand_name" text NOT NULL,
	"brand_tagline" text DEFAULT '' NOT NULL,
	"brand_phone" text DEFAULT '' NOT NULL,
	"brand_email" text DEFAULT '' NOT NULL,
	"brand_website" text DEFAULT '' NOT NULL,
	"brand_location" text DEFAULT '' NOT NULL,
	"director_name" text DEFAULT '' NOT NULL,
	"issued_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "certificates_imei" CHECK ("certificates"."imei" ~ '^[0-9]{15}$'),
	CONSTRAINT "certificates_year" CHECK ("certificates"."year" BETWEEN 1950 AND 2100),
	CONSTRAINT "certificates_contract" CHECK ("certificates"."contract_years" IS NULL OR "certificates"."contract_years" BETWEEN 1 AND 5),
	CONSTRAINT "certificates_text_len" CHECK (char_length("certificates"."vehicle_reg") BETWEEN 1 AND 20 AND char_length("certificates"."make") BETWEEN 1 AND 40 AND char_length("certificates"."model") BETWEEN 1 AND 40 AND char_length("certificates"."chassis") BETWEEN 1 AND 30)
);
--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "certificates_tenant_number_uq" ON "certificates" USING btree ("tenant_id","number");--> statement-breakpoint
CREATE INDEX "certificates_tenant_issued_idx" ON "certificates" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "certificates_sale_idx" ON "certificates" USING btree ("tenant_id","sale_id");