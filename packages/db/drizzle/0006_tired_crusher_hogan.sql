CREATE TABLE "spot_feedbacks" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"spot_id" text NOT NULL,
	"rating" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trip_feedbacks" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"rating" integer NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trip_plans" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"origin" text NOT NULL,
	"time_budget" text NOT NULL,
	"final_spots" text[] NOT NULL,
	"summary" text NOT NULL,
	"debate_log" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_preferences" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"category_score" jsonb,
	"tag_score" jsonb,
	"preferred_price_max" integer,
	"liked_ids" text[],
	"noped_ids" text[],
	"feedback_notes" text DEFAULT '' NOT NULL,
	"intro_style" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_preferences_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "spot_feedbacks" ADD CONSTRAINT "spot_feedbacks_spot_id_spots_id_fk" FOREIGN KEY ("spot_id") REFERENCES "public"."spots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "spot_feedbacks_user_id_idx" ON "spot_feedbacks" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "spot_feedbacks_spot_id_idx" ON "spot_feedbacks" USING btree ("spot_id");--> statement-breakpoint
CREATE INDEX "trip_feedbacks_user_id_idx" ON "trip_feedbacks" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "trip_plans_user_id_idx" ON "trip_plans" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_preferences_user_id_idx" ON "user_preferences" USING btree ("user_id");