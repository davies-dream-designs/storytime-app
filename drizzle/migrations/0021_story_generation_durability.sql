ALTER TABLE "stories" ADD COLUMN IF NOT EXISTS "generation_job_id" text;--> statement-breakpoint
ALTER TABLE "stories" ADD COLUMN IF NOT EXISTS "generation_claimed_at" text;--> statement-breakpoint
ALTER TABLE "stories" ADD COLUMN IF NOT EXISTS "credit_charged_at" text;