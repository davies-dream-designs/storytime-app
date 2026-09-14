ALTER TABLE "processed_webhook_events" ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT 'done';--> statement-breakpoint
ALTER TABLE "processed_webhook_events" ADD COLUMN IF NOT EXISTS "lease_expires_at" text;
