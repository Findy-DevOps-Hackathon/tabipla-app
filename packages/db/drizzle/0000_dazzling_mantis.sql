CREATE TABLE "spots" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"category" text,
	"area" text,
	"prefecture" text,
	"address" text,
	"tags" text[],
	"lat" double precision,
	"lon" double precision,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "spots_category_idx" ON "spots" USING btree ("category");--> statement-breakpoint
CREATE INDEX "spots_prefecture_idx" ON "spots" USING btree ("prefecture");--> statement-breakpoint
CREATE INDEX "spots_updated_at_idx" ON "spots" USING btree ("updated_at");