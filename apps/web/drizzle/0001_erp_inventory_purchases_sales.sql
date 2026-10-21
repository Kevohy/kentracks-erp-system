CREATE TYPE "public"."card_type" AS ENUM('New Card', 'Annual Card', 'Lifelong Card');--> statement-breakpoint
CREATE TYPE "public"."customer_link" AS ENUM('automatic', 'manual');--> statement-breakpoint
CREATE TYPE "public"."purchase_item_type" AS ENUM('Product', 'SIM Card', 'Platform');--> statement-breakpoint
CREATE TYPE "public"."purchase_status" AS ENUM('Pending', 'Received');--> statement-breakpoint
CREATE TYPE "public"."sale_type" AS ENUM('Package Sale', 'Hosting Sale', 'Retailer Sale');--> statement-breakpoint
CREATE TYPE "public"."sim_card_type" AS ENUM('International IoT', 'Local IoT', 'Prepaid', 'Postpaid');--> statement-breakpoint
CREATE TYPE "public"."verification_source" AS ENUM('mock', 'gpsplatform');--> statement-breakpoint
CREATE TABLE "package_sale_expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sale_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"description" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	CONSTRAINT "package_sale_expenses_values" CHECK (char_length("package_sale_expenses"."description") BETWEEN 1 AND 80 AND "package_sale_expenses"."amount_minor" > 0)
);
--> statement-breakpoint
CREATE TABLE "package_sales" (
	"sale_id" uuid PRIMARY KEY NOT NULL,
	"customer_link" "customer_link" NOT NULL,
	"imei" text NOT NULL,
	"vehicle_plate" text DEFAULT '' NOT NULL,
	"gps_account" text DEFAULT '' NOT NULL,
	"verification_source" "verification_source" NOT NULL,
	"package_id" uuid NOT NULL,
	"package_name" text NOT NULL,
	"tracker_product_id" uuid,
	"tracker_category_name" text,
	"tracker_model" text,
	"platform_id" uuid NOT NULL,
	"platform_name" text NOT NULL,
	"card_type" "card_type" NOT NULL,
	"deduction" numeric(2, 1) NOT NULL,
	"sim_card_id" uuid NOT NULL,
	"sim_name" text NOT NULL,
	"sim_number" text DEFAULT '' NOT NULL,
	"sim_deducted" boolean NOT NULL,
	"technician_id" uuid,
	"technician_name" text,
	"installation_minor" bigint NOT NULL,
	"transport_minor" bigint NOT NULL,
	"commission_minor" bigint NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"cost_tracker_minor" bigint NOT NULL,
	"cost_sim_minor" bigint NOT NULL,
	"cost_licence_minor" bigint NOT NULL,
	CONSTRAINT "package_sales_imei" CHECK ("package_sales"."imei" ~ '^[0-9]{15}$'),
	CONSTRAINT "package_sales_deduction" CHECK ("package_sales"."deduction" IN (0, 0.5, 1)),
	CONSTRAINT "package_sales_tracker_all_or_none" CHECK (("package_sales"."tracker_product_id" IS NULL AND "package_sales"."tracker_category_name" IS NULL AND "package_sales"."tracker_model" IS NULL)
       OR ("package_sales"."tracker_product_id" IS NOT NULL AND "package_sales"."tracker_category_name" IS NOT NULL AND "package_sales"."tracker_model" IS NOT NULL)),
	CONSTRAINT "package_sales_technician_both_or_none" CHECK (("package_sales"."technician_id" IS NULL) = ("package_sales"."technician_name" IS NULL)),
	CONSTRAINT "package_sales_expenses" CHECK ("package_sales"."installation_minor" >= 0 AND "package_sales"."transport_minor" >= 0 AND "package_sales"."commission_minor" >= 0),
	CONSTRAINT "package_sales_costs" CHECK ("package_sales"."cost_tracker_minor" >= 0 AND "package_sales"."cost_sim_minor" >= 0 AND "package_sales"."cost_licence_minor" >= 0),
	CONSTRAINT "package_sales_notes_len" CHECK (char_length("package_sales"."notes") <= 500)
);
--> statement-breakpoint
CREATE TABLE "platforms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platforms_name_len" CHECK (char_length("platforms"."name") BETWEEN 1 AND 80)
);
--> statement-breakpoint
CREATE TABLE "product_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_categories_name_len" CHECK (char_length("product_categories"."name") BETWEEN 1 AND 80)
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"model" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_model_len" CHECK (char_length("products"."model") BETWEEN 1 AND 80)
);
--> statement-breakpoint
CREATE TABLE "purchase_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purchase_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"item_type" "purchase_item_type" NOT NULL,
	"product_id" uuid,
	"sim_card_id" uuid,
	"platform_id" uuid,
	"label" text NOT NULL,
	"category_name" text,
	"quantity" integer NOT NULL,
	"unit_price_minor" bigint NOT NULL,
	CONSTRAINT "purchase_items_one_target" CHECK (("purchase_items"."item_type" = 'Product' AND "purchase_items"."product_id" IS NOT NULL AND "purchase_items"."sim_card_id" IS NULL AND "purchase_items"."platform_id" IS NULL)
   OR ("purchase_items"."item_type" = 'SIM Card' AND "purchase_items"."product_id" IS NULL AND "purchase_items"."sim_card_id" IS NOT NULL AND "purchase_items"."platform_id" IS NULL)
   OR ("purchase_items"."item_type" = 'Platform' AND "purchase_items"."product_id" IS NULL AND "purchase_items"."sim_card_id" IS NULL AND "purchase_items"."platform_id" IS NOT NULL)),
	CONSTRAINT "purchase_items_category_name" CHECK (("purchase_items"."item_type" = 'Product') = ("purchase_items"."category_name" IS NOT NULL)),
	CONSTRAINT "purchase_items_quantity" CHECK ("purchase_items"."quantity" BETWEEN 1 AND 100000),
	CONSTRAINT "purchase_items_price" CHECK ("purchase_items"."unit_price_minor" BETWEEN 0 AND 1000000000),
	CONSTRAINT "purchase_items_label_len" CHECK (char_length("purchase_items"."label") BETWEEN 1 AND 80)
);
--> statement-breakpoint
CREATE TABLE "purchases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"client_key" text,
	"supplier_id" uuid NOT NULL,
	"date" date NOT NULL,
	"status" "purchase_status" NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"total_minor" bigint NOT NULL,
	"paid_minor" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchases_amounts" CHECK ("purchases"."paid_minor" >= 0 AND "purchases"."paid_minor" <= "purchases"."total_minor"),
	CONSTRAINT "purchases_notes_len" CHECK (char_length("purchases"."notes") <= 500)
);
--> statement-breakpoint
CREATE TABLE "retailer_card_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sale_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"platform_id" uuid NOT NULL,
	"platform_name" text NOT NULL,
	"card_type" "card_type" NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price_minor" bigint NOT NULL,
	"unit_cost_minor" bigint,
	CONSTRAINT "retailer_card_lines_values" CHECK ("retailer_card_lines"."quantity" BETWEEN 1 AND 100000 AND "retailer_card_lines"."unit_price_minor" BETWEEN 1 AND 1000000000 AND ("retailer_card_lines"."unit_cost_minor" IS NULL OR "retailer_card_lines"."unit_cost_minor" >= 0))
);
--> statement-breakpoint
CREATE TABLE "retailer_product_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sale_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"product_id" uuid NOT NULL,
	"category_name" text NOT NULL,
	"model" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price_minor" bigint NOT NULL,
	"unit_cost_minor" bigint,
	CONSTRAINT "retailer_product_lines_values" CHECK ("retailer_product_lines"."quantity" BETWEEN 1 AND 100000 AND "retailer_product_lines"."unit_price_minor" BETWEEN 1 AND 1000000000 AND ("retailer_product_lines"."unit_cost_minor" IS NULL OR "retailer_product_lines"."unit_cost_minor" >= 0))
);
--> statement-breakpoint
CREATE TABLE "sale_packages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sale_packages_name_len" CHECK (char_length("sale_packages"."name") BETWEEN 1 AND 60)
);
--> statement-breakpoint
CREATE TABLE "sales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"client_key" text,
	"type" "sale_type" NOT NULL,
	"customer_id" uuid NOT NULL,
	"customer_name" text NOT NULL,
	"total_minor" bigint NOT NULL,
	"paid_minor" bigint NOT NULL,
	"profit_minor" bigint NOT NULL,
	"cost_missing" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sales_amounts" CHECK ("sales"."total_minor" > 0 AND "sales"."paid_minor" >= 0 AND "sales"."paid_minor" <= "sales"."total_minor")
);
--> statement-breakpoint
CREATE TABLE "sim_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" "sim_card_type" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sim_cards_name_len" CHECK (char_length("sim_cards"."name") BETWEEN 1 AND 80)
);
--> statement-breakpoint
CREATE TABLE "stock_adjustments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"sale_id" uuid NOT NULL,
	"item_type" "purchase_item_type" NOT NULL,
	"product_id" uuid,
	"sim_card_id" uuid,
	"platform_id" uuid,
	"quantity" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_adjustments_one_target" CHECK (("stock_adjustments"."item_type" = 'Product' AND "stock_adjustments"."product_id" IS NOT NULL AND "stock_adjustments"."sim_card_id" IS NULL AND "stock_adjustments"."platform_id" IS NULL)
   OR ("stock_adjustments"."item_type" = 'SIM Card' AND "stock_adjustments"."product_id" IS NULL AND "stock_adjustments"."sim_card_id" IS NOT NULL AND "stock_adjustments"."platform_id" IS NULL)
   OR ("stock_adjustments"."item_type" = 'Platform' AND "stock_adjustments"."product_id" IS NULL AND "stock_adjustments"."sim_card_id" IS NULL AND "stock_adjustments"."platform_id" IS NOT NULL)),
	CONSTRAINT "stock_adjustments_quantity" CHECK ("stock_adjustments"."quantity" > 0)
);
--> statement-breakpoint
ALTER TABLE "package_sale_expenses" ADD CONSTRAINT "package_sale_expenses_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_sales" ADD CONSTRAINT "package_sales_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_sales" ADD CONSTRAINT "package_sales_package_id_sale_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."sale_packages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_sales" ADD CONSTRAINT "package_sales_tracker_product_id_products_id_fk" FOREIGN KEY ("tracker_product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_sales" ADD CONSTRAINT "package_sales_platform_id_platforms_id_fk" FOREIGN KEY ("platform_id") REFERENCES "public"."platforms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_sales" ADD CONSTRAINT "package_sales_sim_card_id_sim_cards_id_fk" FOREIGN KEY ("sim_card_id") REFERENCES "public"."sim_cards"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_sales" ADD CONSTRAINT "package_sales_technician_id_technicians_id_fk" FOREIGN KEY ("technician_id") REFERENCES "public"."technicians"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platforms" ADD CONSTRAINT "platforms_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_product_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."product_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_purchase_id_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."purchases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_sim_card_id_sim_cards_id_fk" FOREIGN KEY ("sim_card_id") REFERENCES "public"."sim_cards"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_platform_id_platforms_id_fk" FOREIGN KEY ("platform_id") REFERENCES "public"."platforms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retailer_card_lines" ADD CONSTRAINT "retailer_card_lines_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retailer_card_lines" ADD CONSTRAINT "retailer_card_lines_platform_id_platforms_id_fk" FOREIGN KEY ("platform_id") REFERENCES "public"."platforms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retailer_product_lines" ADD CONSTRAINT "retailer_product_lines_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retailer_product_lines" ADD CONSTRAINT "retailer_product_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_packages" ADD CONSTRAINT "sale_packages_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sim_cards" ADD CONSTRAINT "sim_cards_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_sim_card_id_sim_cards_id_fk" FOREIGN KEY ("sim_card_id") REFERENCES "public"."sim_cards"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_platform_id_platforms_id_fk" FOREIGN KEY ("platform_id") REFERENCES "public"."platforms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "package_sale_expenses_sale_position_uq" ON "package_sale_expenses" USING btree ("sale_id","position");--> statement-breakpoint
CREATE INDEX "platforms_tenant_idx" ON "platforms" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "product_categories_tenant_name_uq" ON "product_categories" USING btree ("tenant_id",lower("name"));--> statement-breakpoint
CREATE INDEX "products_tenant_category_idx" ON "products" USING btree ("tenant_id","category_id");--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_items_purchase_position_uq" ON "purchase_items" USING btree ("purchase_id","position");--> statement-breakpoint
CREATE INDEX "purchase_items_product_idx" ON "purchase_items" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "purchase_items_sim_idx" ON "purchase_items" USING btree ("sim_card_id");--> statement-breakpoint
CREATE INDEX "purchase_items_platform_idx" ON "purchase_items" USING btree ("platform_id");--> statement-breakpoint
CREATE INDEX "purchases_tenant_created_idx" ON "purchases" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "purchases_tenant_client_key_uq" ON "purchases" USING btree ("tenant_id","client_key") WHERE "purchases"."client_key" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "retailer_card_lines_sale_position_uq" ON "retailer_card_lines" USING btree ("sale_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "retailer_product_lines_sale_position_uq" ON "retailer_product_lines" USING btree ("sale_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "sale_packages_tenant_name_uq" ON "sale_packages" USING btree ("tenant_id",lower("name"));--> statement-breakpoint
CREATE INDEX "sales_tenant_created_idx" ON "sales" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_tenant_client_key_uq" ON "sales" USING btree ("tenant_id","client_key") WHERE "sales"."client_key" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "sim_cards_tenant_idx" ON "sim_cards" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "stock_adjustments_tenant_idx" ON "stock_adjustments" USING btree ("tenant_id","item_type");