CREATE TABLE "brand_images" (
	"brand_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"mime" text NOT NULL,
	"bytes" integer NOT NULL,
	"data" "bytea" NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brand_images_brand_id_kind_pk" PRIMARY KEY("brand_id","kind"),
	CONSTRAINT "brand_images_kind" CHECK ("brand_images"."kind" IN ('logo', 'signature')),
	CONSTRAINT "brand_images_mime" CHECK ("brand_images"."mime" IN ('image/png', 'image/jpeg', 'image/webp')),
	CONSTRAINT "brand_images_size" CHECK ("brand_images"."bytes" BETWEEN 1 AND 512000 AND octet_length("brand_images"."data") = "brand_images"."bytes")
);
--> statement-breakpoint
ALTER TABLE "brands" ADD COLUMN "tagline" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "brands" ADD COLUMN "phone" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "brands" ADD COLUMN "email" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "brands" ADD COLUMN "website" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "brands" ADD COLUMN "location" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "brands" ADD COLUMN "director_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "brands" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "brand_images" ADD CONSTRAINT "brand_images_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_images" ADD CONSTRAINT "brand_images_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brands" ADD CONSTRAINT "brands_profile_len" CHECK (char_length("brands"."tagline") <= 120 AND char_length("brands"."website") <= 200 AND char_length("brands"."location") <= 200 AND char_length("brands"."director_name") <= 80);--> statement-breakpoint
ALTER TABLE "brands" ADD CONSTRAINT "brands_phone" CHECK ("brands"."phone" = '' OR "brands"."phone" ~ '^[+][1-9][0-9]{6,14}$');--> statement-breakpoint
ALTER TABLE "brands" ADD CONSTRAINT "brands_email" CHECK ("brands"."email" = '' OR (char_length("brands"."email") <= 254 AND "brands"."email" ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]{2,}$'));--> statement-breakpoint
ALTER TABLE "brands" ADD CONSTRAINT "brands_website" CHECK ("brands"."website" = '' OR "brands"."website" ~ '^https?://[^[:space:]]+$');