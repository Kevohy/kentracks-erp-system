ALTER TABLE "package_sales" ADD COLUMN "sms_reminder" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "package_sales" ADD COLUMN "auto_recharge" boolean DEFAULT false NOT NULL;