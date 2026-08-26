ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "avatar_generation_status" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "avatar_generation_error" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "avatar_generation_job_id" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "avatar_generation_attempt_key" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "avatar_generation_updated_at" text;--> statement-breakpoint
ALTER TABLE "story_people" ADD COLUMN IF NOT EXISTS "avatar_generation_status" text;--> statement-breakpoint
ALTER TABLE "story_people" ADD COLUMN IF NOT EXISTS "avatar_generation_error" text;--> statement-breakpoint
ALTER TABLE "story_people" ADD COLUMN IF NOT EXISTS "avatar_generation_job_id" text;--> statement-breakpoint
ALTER TABLE "story_people" ADD COLUMN IF NOT EXISTS "avatar_generation_attempt_key" text;--> statement-breakpoint
ALTER TABLE "story_people" ADD COLUMN IF NOT EXISTS "avatar_generation_updated_at" text;