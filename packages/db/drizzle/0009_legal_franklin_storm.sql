ALTER TABLE "spots" ADD COLUMN IF NOT EXISTS "highlights" text[];--> statement-breakpoint
ALTER TABLE "spots" ADD COLUMN IF NOT EXISTS "image_url" text;--> statement-breakpoint
ALTER TABLE "spots" ADD COLUMN IF NOT EXISTS "cluster_id" integer;--> statement-breakpoint
ALTER TABLE "spots" ADD COLUMN IF NOT EXISTS "sensory_scores" jsonb;
