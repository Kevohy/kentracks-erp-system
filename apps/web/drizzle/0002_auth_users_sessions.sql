CREATE TABLE "login_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" text NOT NULL,
	"key_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "login_attempts_scope" CHECK ("login_attempts"."scope" IN ('account', 'ip'))
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"remember" boolean DEFAULT false NOT NULL,
	"user_agent" text,
	CONSTRAINT "sessions_hash_format" CHECK ("sessions"."token_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "sessions_ua_length" CHECK (char_length("sessions"."user_agent") <= 200)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"email" text NOT NULL,
	"full_name" text NOT NULL,
	"password_hash" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone,
	CONSTRAINT "users_email_format" CHECK ("users"."email" = lower("users"."email") AND "users"."email" ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]{2,}$' AND char_length("users"."email") <= 254),
	CONSTRAINT "users_name_length" CHECK (char_length("users"."full_name") BETWEEN 1 AND 120),
	CONSTRAINT "users_hash_format" CHECK ("users"."password_hash" LIKE 'scrypt$%')
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "login_attempts_lookup_idx" ON "login_attempts" USING btree ("scope","key_hash","created_at");--> statement-breakpoint
CREATE INDEX "login_attempts_created_idx" ON "login_attempts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uq" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "users_tenant_idx" ON "users" USING btree ("tenant_id");