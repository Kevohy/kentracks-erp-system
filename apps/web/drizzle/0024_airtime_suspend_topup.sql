ALTER TABLE "airtime_batches" DROP CONSTRAINT "airtime_batches_kind";--> statement-breakpoint
ALTER TABLE "airtime_plans" ADD COLUMN "suspended" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "airtime_plans" ADD COLUMN "suspended_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "airtime_batches" ADD CONSTRAINT "airtime_batches_kind" CHECK ("airtime_batches"."kind" IN ('Manual', 'Monthly', 'TopUp'));