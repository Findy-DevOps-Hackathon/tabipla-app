ALTER TABLE "spots" ADD COLUMN "highlights" text[];--> statement-breakpoint
ALTER TABLE "spots" ADD COLUMN "image_url" text;--> statement-breakpoint
ALTER TABLE "spots" ADD COLUMN "cluster_id" integer;--> statement-breakpoint
ALTER TABLE "spots" ADD COLUMN "sensory_scores" jsonb;