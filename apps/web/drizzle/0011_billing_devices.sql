ALTER TABLE "package_sales" ADD COLUMN "gps_model" text;--> statement-breakpoint
ALTER TABLE "package_sales" ADD COLUMN "gps_status" text;--> statement-breakpoint
ALTER TABLE "package_sales" ADD COLUMN "gps_activation_date" text;--> statement-breakpoint
ALTER TABLE "package_sales" ADD COLUMN "gps_expiration_date" text;--> statement-breakpoint
ALTER TABLE "package_sales" ADD COLUMN "gps_synced_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "package_sales_imei_idx" ON "package_sales" USING btree ("imei");--> statement-breakpoint
CREATE OR REPLACE FUNCTION "kt_safe_date"(v text) RETURNS date LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF v IS NULL OR v !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' THEN RETURN NULL; END IF;
  RETURN substring(v from 1 for 10)::date;
EXCEPTION WHEN others THEN RETURN NULL;
END $$;
