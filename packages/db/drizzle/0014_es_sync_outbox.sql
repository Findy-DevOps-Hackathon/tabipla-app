CREATE TABLE IF NOT EXISTS "es_sync_outbox" (
	"id" text PRIMARY KEY NOT NULL,
	"spot_id" text NOT NULL,
	"operation" text NOT NULL,
	"payload" jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_retry_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "es_sync_outbox" ADD CONSTRAINT "es_sync_outbox_spot_id_spots_id_fk" FOREIGN KEY ("spot_id") REFERENCES "public"."spots"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "es_sync_outbox_pending_retry_idx" ON "es_sync_outbox" USING btree ("status","next_retry_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "es_sync_outbox_spot_id_idx" ON "es_sync_outbox" USING btree ("spot_id");
