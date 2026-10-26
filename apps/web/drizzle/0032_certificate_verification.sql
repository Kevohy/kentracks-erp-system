ALTER TABLE "certificates" ADD COLUMN "customer_email" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "certificates" ADD COLUMN "customer_location" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "certificates" ADD COLUMN "verify_code" text;--> statement-breakpoint
ALTER TABLE "certificates" ADD COLUMN "platform_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "certificates" ADD COLUMN "sim_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
-- Certificates issued before this change get a verification code and the extra details from their sale and customer.
UPDATE "certificates" c SET
  "verify_code" = upper(substr(translate(encode(sha256((c.id::text || c.number || random()::text)::bytea), 'base64'), '+/=0O1Il', ''), 1, 10)),
  "customer_email" = COALESCE(cu.email, ''),
  "customer_location" = COALESCE(cu.location, ''),
  "platform_name" = COALESCE(ps.platform_name, ''),
  "sim_name" = COALESCE(ps.sim_name, '')
FROM "customers" cu, "package_sales" ps
WHERE cu.id = c.customer_id AND ps.sale_id = c.sale_id;--> statement-breakpoint
UPDATE "certificates" SET "verify_code" = upper(substr(md5(id::text || random()::text), 1, 10)) WHERE "verify_code" IS NULL;--> statement-breakpoint
ALTER TABLE "certificates" ALTER COLUMN "verify_code" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "certificates_verify_code_uq" ON "certificates" USING btree ("verify_code");--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_verify_code" CHECK ("certificates"."verify_code" ~ '^[A-Z0-9]{10}$');
