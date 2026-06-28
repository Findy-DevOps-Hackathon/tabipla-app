CREATE TABLE "coupons" (
	"id" text PRIMARY KEY NOT NULL,
	"spot_id" text,
	"title" text NOT NULL,
	"description" text,
	"discount" text NOT NULL,
	"conditions" text,
	"valid_until" date
);
--> statement-breakpoint
CREATE TABLE "municipalities" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"api_key_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "unchiku_facts" (
	"id" text PRIMARY KEY NOT NULL,
	"spot_id" text,
	"label" text NOT NULL,
	"text" text NOT NULL,
	"source" text
);
--> statement-breakpoint
ALTER TABLE "spots" ADD COLUMN "municipality_id" text;--> statement-breakpoint
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_spot_id_spots_id_fk" FOREIGN KEY ("spot_id") REFERENCES "public"."spots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unchiku_facts" ADD CONSTRAINT "unchiku_facts_spot_id_spots_id_fk" FOREIGN KEY ("spot_id") REFERENCES "public"."spots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spots" ADD CONSTRAINT "spots_municipality_id_municipalities_id_fk" FOREIGN KEY ("municipality_id") REFERENCES "public"."municipalities"("id") ON DELETE no action ON UPDATE no action;