CREATE TABLE IF NOT EXISTS "email_outbox" (
        "id" text PRIMARY KEY NOT NULL,
        "dedupe_key" text NOT NULL,
        "kind" text NOT NULL,
        "recipient" text NOT NULL,
        "status" text DEFAULT 'pending' NOT NULL,
        "attempts" integer DEFAULT 0 NOT NULL,
        "last_error" text,
        "created_at" text NOT NULL,
        "sent_at" text,
        CONSTRAINT "email_outbox_dedupe_key_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_outbox_status_idx" ON "email_outbox" ("status");
