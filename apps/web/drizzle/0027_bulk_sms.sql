CREATE TABLE "sms_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"client_key" text NOT NULL,
	"kind" text NOT NULL,
	"message" text NOT NULL,
	"template_name" text,
	"recipients" integer NOT NULL,
	"scheduled_for" timestamp with time zone,
	"error" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sms_batches_kind" CHECK ("sms_batches"."kind" IN ('Customers', 'AirtimeReminder', 'ExpiryReminder', 'OneOff', 'System')),
	CONSTRAINT "sms_batches_recipients" CHECK ("sms_batches"."recipients" BETWEEN 1 AND 1000)
);
--> statement-breakpoint
CREATE TABLE "sms_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seq" bigint GENERATED ALWAYS AS IDENTITY (sequence name "sms_messages_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"tenant_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"customer_id" uuid,
	"sale_id" uuid,
	"phone" text NOT NULL,
	"message" text NOT NULL,
	"parts" integer NOT NULL,
	"status" text NOT NULL,
	"message_id" text,
	"error" text,
	"dlr" text,
	"dlr_checked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sms_messages_status" CHECK ("sms_messages"."status" IN ('Pending', 'Scheduled', 'Sent', 'Delivered', 'Failed', 'Unknown')),
	CONSTRAINT "sms_messages_parts" CHECK ("sms_messages"."parts" BETWEEN 1 AND 6)
);
--> statement-breakpoint
CREATE TABLE "sms_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"body" text NOT NULL,
	"audience" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sms_templates_audience" CHECK ("sms_templates"."audience" IN ('Customers', 'AirtimeReminder', 'ExpiryReminder', 'OneOff'))
);
--> statement-breakpoint
ALTER TABLE "sms_batches" ADD CONSTRAINT "sms_batches_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_messages" ADD CONSTRAINT "sms_messages_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_messages" ADD CONSTRAINT "sms_messages_batch_id_sms_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."sms_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_messages" ADD CONSTRAINT "sms_messages_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_messages" ADD CONSTRAINT "sms_messages_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_templates" ADD CONSTRAINT "sms_templates_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sms_batches_tenant_client_key_uq" ON "sms_batches" USING btree ("tenant_id","client_key");--> statement-breakpoint
CREATE INDEX "sms_batches_tenant_created_idx" ON "sms_batches" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "sms_messages_batch_idx" ON "sms_messages" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "sms_messages_tenant_sale_idx" ON "sms_messages" USING btree ("tenant_id","sale_id","created_at");--> statement-breakpoint
CREATE INDEX "sms_messages_tenant_customer_idx" ON "sms_messages" USING btree ("tenant_id","customer_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sms_templates_tenant_name_uq" ON "sms_templates" USING btree ("tenant_id",lower("name"));