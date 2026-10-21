CREATE TYPE "public"."customer_type" AS ENUM('End User', 'Distributor', 'Company');--> statement-breakpoint
CREATE TYPE "public"."supplier_type" AS ENUM('Individual', 'Company');--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"type" "customer_type" NOT NULL,
	"first_name" text,
	"last_name" text,
	"company_name" text,
	"name" text GENERATED ALWAYS AS (CASE WHEN type = 'Company' THEN company_name ELSE first_name || ' ' || last_name END) STORED,
	"account" text NOT NULL,
	"phone" text NOT NULL,
	"email" text NOT NULL,
	"location" text NOT NULL,
	"pin" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customers_type_shape" CHECK (("customers"."type" = 'Company' AND "customers"."company_name" IS NOT NULL AND "customers"."pin" IS NOT NULL AND "customers"."first_name" IS NULL AND "customers"."last_name" IS NULL)
       OR ("customers"."type" <> 'Company' AND "customers"."first_name" IS NOT NULL AND "customers"."last_name" IS NOT NULL AND "customers"."company_name" IS NULL AND "customers"."pin" IS NULL)),
	CONSTRAINT "customers_account_format" CHECK ("customers"."account" ~ '^[A-Za-z0-9._/-]+$' AND char_length("customers"."account") <= 40),
	CONSTRAINT "customers_phone_e164" CHECK ("customers"."phone" ~ '^[+][1-9][0-9]{6,14}$'),
	CONSTRAINT "customers_email_format" CHECK ("customers"."email" ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]{2,}$' AND char_length("customers"."email") <= 254),
	CONSTRAINT "customers_text_lengths" CHECK (char_length("customers"."location") BETWEEN 1 AND 120 AND char_length("customers"."first_name") <= 60 AND char_length("customers"."last_name") <= 60 AND char_length("customers"."company_name") <= 120 AND char_length("customers"."pin") <= 20)
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"type" "supplier_type" NOT NULL,
	"name" text NOT NULL,
	"contact_person" text,
	"phone" text NOT NULL,
	"email" text NOT NULL,
	"location" text NOT NULL,
	"kra_pin" text,
	"department" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "suppliers_type_shape" CHECK (("suppliers"."type" = 'Company' AND "suppliers"."contact_person" IS NOT NULL AND "suppliers"."department" IS NOT NULL)
       OR ("suppliers"."type" = 'Individual' AND "suppliers"."contact_person" IS NULL AND "suppliers"."kra_pin" IS NULL AND "suppliers"."department" IS NULL)),
	CONSTRAINT "suppliers_kra_pin_format" CHECK ("suppliers"."kra_pin" IS NULL OR "suppliers"."kra_pin" ~ '^[AP][0-9]{9}[A-Z]$'),
	CONSTRAINT "suppliers_phone_e164" CHECK ("suppliers"."phone" ~ '^[+][1-9][0-9]{6,14}$'),
	CONSTRAINT "suppliers_email_format" CHECK ("suppliers"."email" ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]{2,}$' AND char_length("suppliers"."email") <= 254),
	CONSTRAINT "suppliers_text_lengths" CHECK (char_length("suppliers"."name") BETWEEN 1 AND 120 AND char_length("suppliers"."location") BETWEEN 1 AND 120 AND char_length("suppliers"."contact_person") <= 60 AND char_length("suppliers"."department") <= 60)
);
--> statement-breakpoint
CREATE TABLE "technicians" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"location" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "technicians_phone_e164" CHECK ("technicians"."phone" ~ '^[+][1-9][0-9]{6,14}$'),
	CONSTRAINT "technicians_email_format" CHECK ("technicians"."email" IS NULL OR ("technicians"."email" ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]{2,}$' AND char_length("technicians"."email") <= 254)),
	CONSTRAINT "technicians_text_lengths" CHECK (char_length("technicians"."name") BETWEEN 1 AND 60 AND char_length("technicians"."location") BETWEEN 1 AND 120)
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "technicians" ADD CONSTRAINT "technicians_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "customers_tenant_account_uq" ON "customers" USING btree ("tenant_id",lower("account"));--> statement-breakpoint
CREATE INDEX "customers_tenant_created_idx" ON "customers" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "suppliers_tenant_created_idx" ON "suppliers" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "technicians_tenant_created_idx" ON "technicians" USING btree ("tenant_id","created_at");