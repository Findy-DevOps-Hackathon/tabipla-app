CREATE TABLE "coupons" (
	"id" text PRIMARY KEY NOT NULL,
	"spot_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"discount_percent" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_spot_id_spots_id_fk" FOREIGN KEY ("spot_id") REFERENCES "public"."spots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "coupons_spot_id_idx" ON "coupons" USING btree ("spot_id");
