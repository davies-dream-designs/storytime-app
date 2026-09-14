CREATE TABLE IF NOT EXISTS "user_credits" (
        "user_id" text PRIMARY KEY NOT NULL,
        "credits" integer DEFAULT 0 NOT NULL,
        "updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "credit_ledger" (
        "id" text PRIMARY KEY NOT NULL,
        "user_id" text NOT NULL,
        "delta" integer NOT NULL,
        "reason" text NOT NULL,
        "dedupe_key" text NOT NULL,
        "balance_after" integer NOT NULL,
        "created_at" text NOT NULL,
        CONSTRAINT "credit_ledger_dedupe_key_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credit_ledger_user_id_idx" ON "credit_ledger" ("user_id");
