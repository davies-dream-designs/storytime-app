CREATE TABLE IF NOT EXISTS "processed_webhook_events" (
	"id" text PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "processed_webhook_events_source_idx" ON "processed_webhook_events" USING btree ("source");