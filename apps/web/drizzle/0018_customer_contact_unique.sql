ALTER TABLE "customers" DROP CONSTRAINT "customers_phone_e164";--> statement-breakpoint
ALTER TABLE "customers" DROP CONSTRAINT "customers_email_format";--> statement-breakpoint
-- One customer per phone number per company. Existing data is never changed: if two customers already share a phone,
-- the index is left out (the app still refuses new duplicates) and a notice names how many; fix them and run
-- the CREATE UNIQUE INDEX below by hand.
DO $$
DECLARE dupes int;
BEGIN
  SELECT count(*) INTO dupes FROM (SELECT 1 FROM "customers" WHERE "phone" <> '' GROUP BY "tenant_id", "phone" HAVING count(*) > 1) d;
  IF dupes = 0 THEN
    CREATE UNIQUE INDEX "customers_tenant_phone_uq" ON "customers" USING btree ("tenant_id","phone") WHERE "customers"."phone" <> '';
  ELSE
    RAISE NOTICE 'customers_tenant_phone_uq not created: % phone number(s) are shared by more than one customer', dupes;
  END IF;
END $$;--> statement-breakpoint
-- One customer per email per company (case does not matter). Same rule as above.
DO $$
DECLARE dupes int;
BEGIN
  SELECT count(*) INTO dupes FROM (SELECT 1 FROM "customers" WHERE "email" <> '' GROUP BY "tenant_id", lower("email") HAVING count(*) > 1) d;
  IF dupes = 0 THEN
    CREATE UNIQUE INDEX "customers_tenant_email_uq" ON "customers" USING btree ("tenant_id",lower("email")) WHERE "customers"."email" <> '';
  ELSE
    RAISE NOTICE 'customers_tenant_email_uq not created: % email(s) are shared by more than one customer', dupes;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_phone_or_email" CHECK ("customers"."phone" <> '' OR "customers"."email" <> '');--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_phone_e164" CHECK ("customers"."phone" = '' OR "customers"."phone" ~ '^[+][1-9][0-9]{6,14}$');--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_email_format" CHECK ("customers"."email" = '' OR ("customers"."email" ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]{2,}$' AND char_length("customers"."email") <= 254));