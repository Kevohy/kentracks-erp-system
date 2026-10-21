ALTER TABLE "sales" DROP CONSTRAINT "sales_amounts";--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "old_sale" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_amounts" CHECK (("sales"."old_sale" AND "sales"."total_minor" = 0 AND "sales"."paid_minor" = 0 AND "sales"."profit_minor" = 0)
       OR (NOT "sales"."old_sale" AND "sales"."total_minor" > 0 AND "sales"."paid_minor" >= 0 AND "sales"."paid_minor" <= "sales"."total_minor"));