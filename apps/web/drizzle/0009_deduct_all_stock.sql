ALTER TABLE "stock_adjustments" ALTER COLUMN "quantity" SET DATA TYPE numeric(12, 1);--> statement-breakpoint
-- Sales made before this change: take out the SIM card that was not deducted ...
INSERT INTO "stock_adjustments" ("tenant_id", "sale_id", "item_type", "sim_card_id", "quantity")
SELECT s."tenant_id", ps."sale_id", 'SIM Card', ps."sim_card_id", 1
FROM "package_sales" ps JOIN "sales" s ON s."id" = ps."sale_id"
WHERE ps."sim_deducted" = false;--> statement-breakpoint
UPDATE "package_sales" SET "sim_deducted" = true WHERE "sim_deducted" = false;--> statement-breakpoint
-- ... the platform licence deduction ...
INSERT INTO "stock_adjustments" ("tenant_id", "sale_id", "item_type", "platform_id", "quantity")
SELECT s."tenant_id", ps."sale_id", 'Platform', ps."platform_id", ps."deduction"
FROM "package_sales" ps JOIN "sales" s ON s."id" = ps."sale_id"
WHERE ps."deduction" > 0
  AND NOT EXISTS (SELECT 1 FROM "stock_adjustments" a WHERE a."sale_id" = ps."sale_id" AND a."item_type" = 'Platform');--> statement-breakpoint
-- ... and retailer platform cards.
INSERT INTO "stock_adjustments" ("tenant_id", "sale_id", "item_type", "platform_id", "quantity")
SELECT s."tenant_id", l."sale_id", 'Platform', l."platform_id", l."quantity"
FROM "retailer_card_lines" l JOIN "sales" s ON s."id" = l."sale_id"
WHERE NOT EXISTS (SELECT 1 FROM "stock_adjustments" a WHERE a."sale_id" = l."sale_id" AND a."item_type" = 'Platform');
--> statement-breakpoint
-- Trackers and retailer products sold before sales took stock.
INSERT INTO "stock_adjustments" ("tenant_id", "sale_id", "item_type", "product_id", "quantity")
SELECT s."tenant_id", ps."sale_id", 'Product', ps."tracker_product_id", 1
FROM "package_sales" ps JOIN "sales" s ON s."id" = ps."sale_id"
WHERE ps."tracker_product_id" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "stock_adjustments" a WHERE a."sale_id" = ps."sale_id" AND a."item_type" = 'Product');--> statement-breakpoint
INSERT INTO "stock_adjustments" ("tenant_id", "sale_id", "item_type", "product_id", "quantity")
SELECT s."tenant_id", l."sale_id", 'Product', l."product_id", l."quantity"
FROM "retailer_product_lines" l JOIN "sales" s ON s."id" = l."sale_id"
WHERE NOT EXISTS (SELECT 1 FROM "stock_adjustments" a WHERE a."sale_id" = l."sale_id" AND a."item_type" = 'Product');
