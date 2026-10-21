ALTER TABLE "package_sales" ADD COLUMN "iot_billing" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Sales made before this change with an IoT SIM are flagged too, so Billing → IoT SIM starts complete.
UPDATE "package_sales" SET "iot_billing" = true FROM "sim_cards" WHERE "sim_cards"."id" = "package_sales"."sim_card_id" AND "sim_cards"."type" IN ('Local IoT', 'International IoT');
