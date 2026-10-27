-- Row-level security: the database itself keeps each company's data to that company.
--
-- The app stamps every database connection with the signed-in user's company (app.tenant_id, src/server/crm/db.ts)
-- before it runs anything. With these rules a row can only be read, added, changed or deleted when it belongs to that
-- company, whatever a query says; without a company, nothing is visible. FORCE makes the rules apply to the app's own
-- database user too (it owns the tables, and owners skip RLS otherwise).
--
-- System work that spans companies (sign-in, the public verify page, background jobs listing companies) sets
-- app.rls_system = 'on' explicitly (asSystem in src/server/crm/db-scope.ts).
-- A future migration that changes company rows must start with: SELECT set_config('app.rls_system', 'on', false);
-- Sign-in tables (tenants, users, sessions, login_attempts) are not covered: signing in must look a user up by email.

-- A PostgreSQL superuser (or a role with BYPASSRLS) skips every rule, even forced ones. Databases created by the
-- official Docker image make their main user a superuser, so the app could connect as one. For that case this creates
-- kt_rls: a role that cannot log in, is not a superuser and cannot skip RLS, with ordinary access to the tables. The app
-- switches each connection to it (SET ROLE kt_rls in src/server/crm/db.ts) when it connects as a superuser, so the rules
-- always apply. Settings → Server Monitoring shows whether they do. (Skipped when this migration does not run as a
-- role that may create roles; the app's own non-superuser owner is then covered by FORCE.)
DO $$
BEGIN
  IF (SELECT rolsuper OR rolcreaterole FROM pg_roles WHERE rolname = current_user) THEN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kt_rls') THEN
      CREATE ROLE kt_rls NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
    END IF;
    GRANT USAGE ON SCHEMA public TO kt_rls;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO kt_rls;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO kt_rls;
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO kt_rls;
    -- Tables added by later migrations get the same access.
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO kt_rls;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO kt_rls;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO kt_rls;
    -- Server Monitoring reads how many database updates were applied.
    IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'drizzle') THEN
      GRANT USAGE ON SCHEMA drizzle TO kt_rls;
      GRANT SELECT ON ALL TABLES IN SCHEMA drizzle TO kt_rls;
    END IF;
    EXECUTE format('GRANT kt_rls TO %I', current_user);
  END IF;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION kt_rls_allows(row_tenant uuid) RETURNS boolean
  LANGUAGE sql STABLE PARALLEL SAFE
  AS $$ SELECT current_setting('app.rls_system', true) = 'on'
            OR row_tenant = nullif(current_setting('app.tenant_id', true), '')::uuid $$;
--> statement-breakpoint
ALTER TABLE "airtime_batches" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "airtime_batches" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "airtime_batches_read" ON "airtime_batches" FOR SELECT USING (kt_rls_allows(tenant_id));--> statement-breakpoint
CREATE POLICY "airtime_batches_add" ON "airtime_batches" FOR INSERT WITH CHECK (kt_rls_allows(tenant_id));--> statement-breakpoint
CREATE POLICY "airtime_batches_change" ON "airtime_batches" FOR UPDATE USING (kt_rls_allows(tenant_id)) WITH CHECK (kt_rls_allows(tenant_id));--> statement-breakpoint
CREATE POLICY "airtime_batches_remove" ON "airtime_batches" FOR DELETE USING (kt_rls_allows(tenant_id));
--> statement-breakpoint
ALTER TABLE "airtime_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "airtime_items" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "airtime_items_read" ON "airtime_items" FOR SELECT USING (kt_rls_allows(tenant_id));--> statement-breakpoint
CREATE POLICY "airtime_items_add" ON "airtime_items" FOR INSERT WITH CHECK (kt_rls_allows(tenant_id));--> statement-breakpoint
CREATE POLICY "airtime_items_change" ON "airtime_items" FOR UPDATE USING (kt_rls_allows(tenant_id)) WITH CHECK (kt_rls_allows(tenant_id));--> statement-breakpoint
CREATE POLICY "airtime_items_remove" ON "airtime_items" FOR DELETE USING (kt_rls_allows(tenant_id));
--> statement-breakpoint
ALTER TABLE "airtime_plans" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "airtime_plans" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "airtime_plans_read" ON "airtime_plans" FOR SELECT USING (kt_rls_allows(tenant_id));--> statement-breakpoint
CREATE POLICY "airtime_plans_add" ON "airtime_plans" FOR INSERT WITH CHECK (kt_rls_allows(tenant_id));--> statement-breakpoint
CREATE POLICY "airtime_plans_change" ON "airtime_plans" FOR UPDATE USING (kt_rls_allows(tenant_id)) WITH CHECK (kt_rls_allows(tenant_id));--> statement-breakpoint
CREATE POLICY "airtime_plans_remove" ON "airtime_plans" FOR DELETE USING (kt_rls_allows(tenant_id));
--> statement-breakpoint
ALTER TABLE "brand_images" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "brand_images" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "brand_images_read" ON "brand_images" FOR SELECT USING (kt_rls_allows(tenant_id));--> statement-breakpoint
CREATE POLICY "brand_images_add" ON "brand_images" FOR INSERT WITH CHECK (kt_rls_allows(tenant_id));--> statement-breakpoint
CREATE POLICY "brand_images_change" ON "brand_images" FOR UPDATE USING (kt_rls_allows(tenant_id)) WITH CHECK (kt_rls_allows(tenant_id));--> statement-breakpoint
CREATE POLICY "brand_images_remove" ON "brand_images" FOR DELETE USING (kt_rls_allows(tenant_id));
--> statement-breakpoint
ALTER TABLE "brands" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "brands" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "brands_read" ON "brands" FOR SELECT USING (kt_rls_allows(tenant_id));--> statement-breakpoint
CREATE POLICY "brands_add" ON "brands" FOR INSERT WITH CHECK (kt_rls_allows(tenant_id));--> statement-breakpoint
CREATE POLICY "brands_change" ON "brands" FOR UPDATE USING (kt_rls_allows(tenant_id)) WITH CHECK (kt_rls_allows(tenant_id));--> statement-breakpoint
CREATE POLICY "brands_remove" ON "brands" FOR DELETE USING (kt_rls_allows(tenant_id));
--> statement-breakpoint
ALTER TABLE "certificates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "certificates" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "certificates_read" ON "certificates" FOR SELECT USING (kt_rls_allows(tenant_id));--> statement-breakpoint
CREATE POLICY "certificates_add" ON "certificates" FOR INSERT WITH CHECK (kt_rls_allows(tenant_id));--> statement-breakpoint
CREATE POLICY "certificates_change" ON "certificates" FOR UPDATE USING (kt_rls_allows(tenant_id)) WITH CHECK (kt_rls_allows(tenant_id));--> statement-breakpoint
CREATE POLICY "certificates_remove" ON "certificates" FOR DELETE USING (kt_rls_allows(tenant_id));
--> statement-breakpoint
ALTER TABLE "customers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "customers" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "customers_read" ON "customers" FOR SELECT USING (kt_rls_allows(tenant_id));--> statement-breakpoint
CREATE POLICY "customers_add" ON "customers" FOR INSERT WITH CHECK (kt_rls_allows(tenant_id));--> statement-breakpoint
CREATE POLICY "customers_change" ON "customers" FOR UPDATE USING (kt_rls_allows(tenant_id)) WITH CHECK (kt_rls_allows(tenant_id));--> statement-breakpoint
CREATE POLICY "customers_remove" ON "customers" FOR DELETE USING (kt_rls_allows(tenant_id));
--> statement-breakpoint
ALTER TABLE "gps_platform_accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "gps_platform_accounts" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "gps_platform_accounts_read" ON "gps_platform_accounts" FOR SELECT USING (kt_rls_allows(tenant_id));--> statement-breakpoint
CREATE POLICY "gps_platform_accounts_add" ON "gps_platform_accounts" FOR INSERT WITH CHECK (kt_rls_allows(tenant_id));--> statement-breakpoint
CREATE POLICY "gps_platform_accounts_change" ON "gps_platform_accounts" FOR UPDATE USING (kt_rls_allows(tenant_id)) WITH CHECK (kt_rls_allows(tenant_id));--> statement-breakpoint
CREATE POLICY "gps_platform_accounts_remove" ON "gps_platform_accounts" FOR DELETE USING (kt_rls_allows(tenant_id));
--> statement-breakpoint
ALTER TABLE "invoice_lines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "invoice_lines" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "invoice_lines_read" ON "invoice_lines" FOR SELECT USING (kt_rls_allows(tenant_id));--> statement-breakpoint
CREATE POLICY "invoice_lines_add" ON "invoice_lines" FOR INSERT WITH CHECK (kt_rls_allows(tenant_id));--> statement-breakpoint
CREATE POLICY "invoice_lines_change" ON "invoice_lines" FOR UPDATE USING (kt_rls_allows(tenant_id)) WITH CHECK (kt_rls_allows(tenant_id));--> statement-breakpoint
CREATE POLICY "invoice_lines_remove" ON "invoice_lines" FOR DELETE USING (kt_rls_allows(tenant_id));
--> statement-breakpoint
ALTER TABLE "invoices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "invoices" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "invoices_read" ON "invoices" FOR SELECT USING (kt_rls_allows(tenant_id));--> statement-breakpoint
CREATE POLICY "invoices_add" ON "invoices" FOR INSERT WITH CHECK (kt_rls_allows(tenant_id));--> statement-breakpoint
CREATE POLICY "invoices_change" ON "invoices" FOR UPDATE USING (kt_rls_allows(tenant_id)) WITH CHECK (kt_rls_allows(tenant_id));--> statement-breakpoint
CREATE POLICY "invoices_remove" ON "invoices" FOR DELETE USING (kt_rls_allows(tenant_id));
--> statement-breakpoint
ALTER TABLE "iot_sim_bills" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "iot_sim_bills" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "iot_sim_bills_read" ON "iot_sim_bills" FOR SELECT USING (kt_rls_allows(tenant_id));--> statement-breakpoint
CREATE POLICY "iot_sim_bills_add" ON "iot_sim_bills" FOR INSERT WITH CHECK (kt_rls_allows(tenant_id));--> statement-breakpoint
CREATE POLICY "iot_sim_bills_change" ON "iot_sim_bills" FOR UPDATE USING (kt_rls_allows(tenant_id)) WITH CHECK (kt_rls_allows(tenant_id));--> statement-breakpoint
CREATE POLICY "iot_sim_bills_remove" ON "iot_sim_bills" FOR DELETE USING (kt_rls_allows(tenant_id));
--> statement-breakpoint
ALTER TABLE "iot_sim_groups" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "iot_sim_groups" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "iot_sim_groups_read" ON "iot_sim_groups" FOR SELECT USING (kt_rls_allows(tenant_id));--> statement-breakpoint
CREATE POLICY "iot_sim_groups_add" ON "iot_sim_groups" FOR INSERT WITH CHECK (kt_rls_allows(tenant_id));--> statement-breakpoint
CREATE POLICY "iot_sim_groups_change" ON "iot_sim_groups" FOR UPDATE USING (kt_rls_allows(tenant_id)) WITH CHECK (kt_rls_allows(tenant_id));--> statement-breakpoint
CREATE POLICY "iot_sim_groups_remove" ON "iot_sim_groups" FOR DELETE USING (kt_rls_allows(tenant_id));
--> statement-breakpoint
ALTER TABLE "iot_sim_renewals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "iot_sim_renewals" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "iot_sim_renewals_read" ON "iot_sim_renewals" FOR SELECT USING (kt_rls_allows(tenant_id));--> statement-breakpoint
CREATE POLICY "iot_sim_renewals_add" ON "iot_sim_renewals" FOR INSERT WITH CHECK (kt_rls_allows(tenant_id));--> statement-breakpoint
CREATE POLICY "iot_sim_renewals_change" ON "iot_sim_renewals" FOR UPDATE USING (kt_rls_allows(tenant_id)) WITH CHECK (kt_rls_allows(tenant_id));--> statement-breakpoint
CREATE POLICY "iot_sim_renewals_remove" ON "iot_sim_renewals" FOR DELETE USING (kt_rls_allows(tenant_id));
--> statement-breakpoint
ALTER TABLE "iot_sims" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "iot_sims" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "iot_sims_read" ON "iot_sims" FOR SELECT USING (kt_rls_allows(tenant_id));--> statement-breakpoint
CREATE POLICY "iot_sims_add" ON "iot_sims" FOR INSERT WITH CHECK (kt_rls_allows(tenant_id));--> statement-breakpoint
CREATE POLICY "iot_sims_change" ON "iot_sims" FOR UPDATE USING (kt_rls_allows(tenant_id)) WITH CHECK (kt_rls_allows(tenant_id));--> statement-breakpoint
CREATE POLICY "iot_sims_remove" ON "iot_sims" FOR DELETE USING (kt_rls_allows(tenant_id));
--> statement-breakpoint
ALTER TABLE "platforms" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "platforms" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "platforms_read" ON "platforms" FOR SELECT USING (kt_rls_allows(tenant_id));--> statement-breakpoint
CREATE POLICY "platforms_add" ON "platforms" FOR INSERT WITH CHECK (kt_rls_allows(tenant_id));--> statement-breakpoint
CREATE POLICY "platforms_change" ON "platforms" FOR UPDATE USING (kt_rls_allows(tenant_id)) WITH CHECK (kt_rls_allows(tenant_id));--> statement-breakpoint
CREATE POLICY "platforms_remove" ON "platforms" FOR DELETE USING (kt_rls_allows(tenant_id));
--> statement-breakpoint
ALTER TABLE "product_categories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "product_categories" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "product_categories_read" ON "product_categories" FOR SELECT USING (kt_rls_allows(tenant_id));--> statement-breakpoint
CREATE POLICY "product_categories_add" ON "product_categories" FOR INSERT WITH CHECK (kt_rls_allows(tenant_id));--> statement-breakpoint
CREATE POLICY "product_categories_change" ON "product_categories" FOR UPDATE USING (kt_rls_allows(tenant_id)) WITH CHECK (kt_rls_allows(tenant_id));--> statement-breakpoint
CREATE POLICY "product_categories_remove" ON "product_categories" FOR DELETE USING (kt_rls_allows(tenant_id));
--> statement-breakpoint
ALTER TABLE "products" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "products" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "products_read" ON "products" FOR SELECT USING (kt_rls_allows(tenant_id));--> statement-breakpoint
CREATE POLICY "products_add" ON "products" FOR INSERT WITH CHECK (kt_rls_allows(tenant_id));--> statement-breakpoint
CREATE POLICY "products_change" ON "products" FOR UPDATE USING (kt_rls_allows(tenant_id)) WITH CHECK (kt_rls_allows(tenant_id));--> statement-breakpoint
CREATE POLICY "products_remove" ON "products" FOR DELETE USING (kt_rls_allows(tenant_id));
--> statement-breakpoint
ALTER TABLE "purchases" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "purchases" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "purchases_read" ON "purchases" FOR SELECT USING (kt_rls_allows(tenant_id));--> statement-breakpoint
CREATE POLICY "purchases_add" ON "purchases" FOR INSERT WITH CHECK (kt_rls_allows(tenant_id));--> statement-breakpoint
CREATE POLICY "purchases_change" ON "purchases" FOR UPDATE USING (kt_rls_allows(tenant_id)) WITH CHECK (kt_rls_allows(tenant_id));--> statement-breakpoint
CREATE POLICY "purchases_remove" ON "purchases" FOR DELETE USING (kt_rls_allows(tenant_id));
--> statement-breakpoint
ALTER TABLE "sale_packages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sale_packages" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "sale_packages_read" ON "sale_packages" FOR SELECT USING (kt_rls_allows(tenant_id));--> statement-breakpoint
CREATE POLICY "sale_packages_add" ON "sale_packages" FOR INSERT WITH CHECK (kt_rls_allows(tenant_id));--> statement-breakpoint
CREATE POLICY "sale_packages_change" ON "sale_packages" FOR UPDATE USING (kt_rls_allows(tenant_id)) WITH CHECK (kt_rls_allows(tenant_id));--> statement-breakpoint
CREATE POLICY "sale_packages_remove" ON "sale_packages" FOR DELETE USING (kt_rls_allows(tenant_id));
--> statement-breakpoint
ALTER TABLE "sale_payments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sale_payments" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "sale_payments_read" ON "sale_payments" FOR SELECT USING (kt_rls_allows(tenant_id));--> statement-breakpoint
CREATE POLICY "sale_payments_add" ON "sale_payments" FOR INSERT WITH CHECK (kt_rls_allows(tenant_id));--> statement-breakpoint
CREATE POLICY "sale_payments_change" ON "sale_payments" FOR UPDATE USING (kt_rls_allows(tenant_id)) WITH CHECK (kt_rls_allows(tenant_id));--> statement-breakpoint
CREATE POLICY "sale_payments_remove" ON "sale_payments" FOR DELETE USING (kt_rls_allows(tenant_id));
--> statement-breakpoint
ALTER TABLE "sale_service_changes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sale_service_changes" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "sale_service_changes_read" ON "sale_service_changes" FOR SELECT USING (kt_rls_allows(tenant_id));--> statement-breakpoint
CREATE POLICY "sale_service_changes_add" ON "sale_service_changes" FOR INSERT WITH CHECK (kt_rls_allows(tenant_id));--> statement-breakpoint
CREATE POLICY "sale_service_changes_change" ON "sale_service_changes" FOR UPDATE USING (kt_rls_allows(tenant_id)) WITH CHECK (kt_rls_allows(tenant_id));--> statement-breakpoint
CREATE POLICY "sale_service_changes_remove" ON "sale_service_changes" FOR DELETE USING (kt_rls_allows(tenant_id));
--> statement-breakpoint
ALTER TABLE "sales" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sales" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "sales_read" ON "sales" FOR SELECT USING (kt_rls_allows(tenant_id));--> statement-breakpoint
CREATE POLICY "sales_add" ON "sales" FOR INSERT WITH CHECK (kt_rls_allows(tenant_id));--> statement-breakpoint
CREATE POLICY "sales_change" ON "sales" FOR UPDATE USING (kt_rls_allows(tenant_id)) WITH CHECK (kt_rls_allows(tenant_id));--> statement-breakpoint
CREATE POLICY "sales_remove" ON "sales" FOR DELETE USING (kt_rls_allows(tenant_id));
--> statement-breakpoint
ALTER TABLE "sim_cards" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sim_cards" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "sim_cards_read" ON "sim_cards" FOR SELECT USING (kt_rls_allows(tenant_id));--> statement-breakpoint
CREATE POLICY "sim_cards_add" ON "sim_cards" FOR INSERT WITH CHECK (kt_rls_allows(tenant_id));--> statement-breakpoint
CREATE POLICY "sim_cards_change" ON "sim_cards" FOR UPDATE USING (kt_rls_allows(tenant_id)) WITH CHECK (kt_rls_allows(tenant_id));--> statement-breakpoint
CREATE POLICY "sim_cards_remove" ON "sim_cards" FOR DELETE USING (kt_rls_allows(tenant_id));
--> statement-breakpoint
ALTER TABLE "sms_batches" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sms_batches" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "sms_batches_read" ON "sms_batches" FOR SELECT USING (kt_rls_allows(tenant_id));--> statement-breakpoint
CREATE POLICY "sms_batches_add" ON "sms_batches" FOR INSERT WITH CHECK (kt_rls_allows(tenant_id));--> statement-breakpoint
CREATE POLICY "sms_batches_change" ON "sms_batches" FOR UPDATE USING (kt_rls_allows(tenant_id)) WITH CHECK (kt_rls_allows(tenant_id));--> statement-breakpoint
CREATE POLICY "sms_batches_remove" ON "sms_batches" FOR DELETE USING (kt_rls_allows(tenant_id));
--> statement-breakpoint
ALTER TABLE "sms_messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sms_messages" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "sms_messages_read" ON "sms_messages" FOR SELECT USING (kt_rls_allows(tenant_id));--> statement-breakpoint
CREATE POLICY "sms_messages_add" ON "sms_messages" FOR INSERT WITH CHECK (kt_rls_allows(tenant_id));--> statement-breakpoint
CREATE POLICY "sms_messages_change" ON "sms_messages" FOR UPDATE USING (kt_rls_allows(tenant_id)) WITH CHECK (kt_rls_allows(tenant_id));--> statement-breakpoint
CREATE POLICY "sms_messages_remove" ON "sms_messages" FOR DELETE USING (kt_rls_allows(tenant_id));
--> statement-breakpoint
ALTER TABLE "sms_reminder_blocks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sms_reminder_blocks" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "sms_reminder_blocks_read" ON "sms_reminder_blocks" FOR SELECT USING (kt_rls_allows(tenant_id));--> statement-breakpoint
CREATE POLICY "sms_reminder_blocks_add" ON "sms_reminder_blocks" FOR INSERT WITH CHECK (kt_rls_allows(tenant_id));--> statement-breakpoint
CREATE POLICY "sms_reminder_blocks_change" ON "sms_reminder_blocks" FOR UPDATE USING (kt_rls_allows(tenant_id)) WITH CHECK (kt_rls_allows(tenant_id));--> statement-breakpoint
CREATE POLICY "sms_reminder_blocks_remove" ON "sms_reminder_blocks" FOR DELETE USING (kt_rls_allows(tenant_id));
--> statement-breakpoint
ALTER TABLE "sms_reminder_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sms_reminder_settings" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "sms_reminder_settings_read" ON "sms_reminder_settings" FOR SELECT USING (kt_rls_allows(tenant_id));--> statement-breakpoint
CREATE POLICY "sms_reminder_settings_add" ON "sms_reminder_settings" FOR INSERT WITH CHECK (kt_rls_allows(tenant_id));--> statement-breakpoint
CREATE POLICY "sms_reminder_settings_change" ON "sms_reminder_settings" FOR UPDATE USING (kt_rls_allows(tenant_id)) WITH CHECK (kt_rls_allows(tenant_id));--> statement-breakpoint
CREATE POLICY "sms_reminder_settings_remove" ON "sms_reminder_settings" FOR DELETE USING (kt_rls_allows(tenant_id));
--> statement-breakpoint
ALTER TABLE "sms_templates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sms_templates" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "sms_templates_read" ON "sms_templates" FOR SELECT USING (kt_rls_allows(tenant_id));--> statement-breakpoint
CREATE POLICY "sms_templates_add" ON "sms_templates" FOR INSERT WITH CHECK (kt_rls_allows(tenant_id));--> statement-breakpoint
CREATE POLICY "sms_templates_change" ON "sms_templates" FOR UPDATE USING (kt_rls_allows(tenant_id)) WITH CHECK (kt_rls_allows(tenant_id));--> statement-breakpoint
CREATE POLICY "sms_templates_remove" ON "sms_templates" FOR DELETE USING (kt_rls_allows(tenant_id));
--> statement-breakpoint
ALTER TABLE "stock_adjustments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "stock_adjustments" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "stock_adjustments_read" ON "stock_adjustments" FOR SELECT USING (kt_rls_allows(tenant_id));--> statement-breakpoint
CREATE POLICY "stock_adjustments_add" ON "stock_adjustments" FOR INSERT WITH CHECK (kt_rls_allows(tenant_id));--> statement-breakpoint
CREATE POLICY "stock_adjustments_change" ON "stock_adjustments" FOR UPDATE USING (kt_rls_allows(tenant_id)) WITH CHECK (kt_rls_allows(tenant_id));--> statement-breakpoint
CREATE POLICY "stock_adjustments_remove" ON "stock_adjustments" FOR DELETE USING (kt_rls_allows(tenant_id));
--> statement-breakpoint
ALTER TABLE "suppliers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "suppliers" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "suppliers_read" ON "suppliers" FOR SELECT USING (kt_rls_allows(tenant_id));--> statement-breakpoint
CREATE POLICY "suppliers_add" ON "suppliers" FOR INSERT WITH CHECK (kt_rls_allows(tenant_id));--> statement-breakpoint
CREATE POLICY "suppliers_change" ON "suppliers" FOR UPDATE USING (kt_rls_allows(tenant_id)) WITH CHECK (kt_rls_allows(tenant_id));--> statement-breakpoint
CREATE POLICY "suppliers_remove" ON "suppliers" FOR DELETE USING (kt_rls_allows(tenant_id));
--> statement-breakpoint
ALTER TABLE "technicians" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "technicians" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "technicians_read" ON "technicians" FOR SELECT USING (kt_rls_allows(tenant_id));--> statement-breakpoint
CREATE POLICY "technicians_add" ON "technicians" FOR INSERT WITH CHECK (kt_rls_allows(tenant_id));--> statement-breakpoint
CREATE POLICY "technicians_change" ON "technicians" FOR UPDATE USING (kt_rls_allows(tenant_id)) WITH CHECK (kt_rls_allows(tenant_id));--> statement-breakpoint
CREATE POLICY "technicians_remove" ON "technicians" FOR DELETE USING (kt_rls_allows(tenant_id));
--> statement-breakpoint
-- package_sales has no tenant_id: it belongs to the company of its sale (whose own rule applies inside the check; the list of the company's
-- parents is built once per query, which keeps big lists fast).
ALTER TABLE "package_sales" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "package_sales" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "package_sales_read" ON "package_sales" FOR SELECT USING (sale_id IN (SELECT p.id FROM "sales" p));--> statement-breakpoint
CREATE POLICY "package_sales_add" ON "package_sales" FOR INSERT WITH CHECK (sale_id IN (SELECT p.id FROM "sales" p));--> statement-breakpoint
CREATE POLICY "package_sales_change" ON "package_sales" FOR UPDATE USING (sale_id IN (SELECT p.id FROM "sales" p)) WITH CHECK (sale_id IN (SELECT p.id FROM "sales" p));--> statement-breakpoint
CREATE POLICY "package_sales_remove" ON "package_sales" FOR DELETE USING (sale_id IN (SELECT p.id FROM "sales" p));
--> statement-breakpoint
-- package_sale_expenses has no tenant_id: it belongs to the company of its sale (whose own rule applies inside the check; the list of the company's
-- parents is built once per query, which keeps big lists fast).
ALTER TABLE "package_sale_expenses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "package_sale_expenses" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "package_sale_expenses_read" ON "package_sale_expenses" FOR SELECT USING (sale_id IN (SELECT p.id FROM "sales" p));--> statement-breakpoint
CREATE POLICY "package_sale_expenses_add" ON "package_sale_expenses" FOR INSERT WITH CHECK (sale_id IN (SELECT p.id FROM "sales" p));--> statement-breakpoint
CREATE POLICY "package_sale_expenses_change" ON "package_sale_expenses" FOR UPDATE USING (sale_id IN (SELECT p.id FROM "sales" p)) WITH CHECK (sale_id IN (SELECT p.id FROM "sales" p));--> statement-breakpoint
CREATE POLICY "package_sale_expenses_remove" ON "package_sale_expenses" FOR DELETE USING (sale_id IN (SELECT p.id FROM "sales" p));
--> statement-breakpoint
-- retailer_product_lines has no tenant_id: it belongs to the company of its sale (whose own rule applies inside the check; the list of the company's
-- parents is built once per query, which keeps big lists fast).
ALTER TABLE "retailer_product_lines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "retailer_product_lines" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "retailer_product_lines_read" ON "retailer_product_lines" FOR SELECT USING (sale_id IN (SELECT p.id FROM "sales" p));--> statement-breakpoint
CREATE POLICY "retailer_product_lines_add" ON "retailer_product_lines" FOR INSERT WITH CHECK (sale_id IN (SELECT p.id FROM "sales" p));--> statement-breakpoint
CREATE POLICY "retailer_product_lines_change" ON "retailer_product_lines" FOR UPDATE USING (sale_id IN (SELECT p.id FROM "sales" p)) WITH CHECK (sale_id IN (SELECT p.id FROM "sales" p));--> statement-breakpoint
CREATE POLICY "retailer_product_lines_remove" ON "retailer_product_lines" FOR DELETE USING (sale_id IN (SELECT p.id FROM "sales" p));
--> statement-breakpoint
-- retailer_card_lines has no tenant_id: it belongs to the company of its sale (whose own rule applies inside the check; the list of the company's
-- parents is built once per query, which keeps big lists fast).
ALTER TABLE "retailer_card_lines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "retailer_card_lines" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "retailer_card_lines_read" ON "retailer_card_lines" FOR SELECT USING (sale_id IN (SELECT p.id FROM "sales" p));--> statement-breakpoint
CREATE POLICY "retailer_card_lines_add" ON "retailer_card_lines" FOR INSERT WITH CHECK (sale_id IN (SELECT p.id FROM "sales" p));--> statement-breakpoint
CREATE POLICY "retailer_card_lines_change" ON "retailer_card_lines" FOR UPDATE USING (sale_id IN (SELECT p.id FROM "sales" p)) WITH CHECK (sale_id IN (SELECT p.id FROM "sales" p));--> statement-breakpoint
CREATE POLICY "retailer_card_lines_remove" ON "retailer_card_lines" FOR DELETE USING (sale_id IN (SELECT p.id FROM "sales" p));
--> statement-breakpoint
-- purchase_items has no tenant_id: it belongs to the company of its purchase (whose own rule applies inside the check; the list of the company's
-- parents is built once per query, which keeps big lists fast).
ALTER TABLE "purchase_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "purchase_items" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "purchase_items_read" ON "purchase_items" FOR SELECT USING (purchase_id IN (SELECT p.id FROM "purchases" p));--> statement-breakpoint
CREATE POLICY "purchase_items_add" ON "purchase_items" FOR INSERT WITH CHECK (purchase_id IN (SELECT p.id FROM "purchases" p));--> statement-breakpoint
CREATE POLICY "purchase_items_change" ON "purchase_items" FOR UPDATE USING (purchase_id IN (SELECT p.id FROM "purchases" p)) WITH CHECK (purchase_id IN (SELECT p.id FROM "purchases" p));--> statement-breakpoint
CREATE POLICY "purchase_items_remove" ON "purchase_items" FOR DELETE USING (purchase_id IN (SELECT p.id FROM "purchases" p));
