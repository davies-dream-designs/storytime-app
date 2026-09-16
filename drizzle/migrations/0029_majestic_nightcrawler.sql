CREATE TABLE "trade_book_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" text NOT NULL,
	"lease_token" text,
	"lease_expires_at" text,
	"last_error" text,
	"started_at" text,
	"completed_at" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	CONSTRAINT "trade_book_jobs_dedupe_key_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
CREATE INDEX "trade_book_jobs_claim_idx" ON "trade_book_jobs" USING btree ("status","available_at");--> statement-breakpoint
CREATE INDEX "trade_book_jobs_lease_idx" ON "trade_book_jobs" USING btree ("status","lease_expires_at");