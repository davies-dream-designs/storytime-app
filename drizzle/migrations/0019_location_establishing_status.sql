ALTER TABLE "location_fixtures" ADD COLUMN IF NOT EXISTS "establishing_image_status" text;--> statement-breakpoint
ALTER TABLE "location_fixtures" ADD COLUMN IF NOT EXISTS "establishing_image_error" text;--> statement-breakpoint
ALTER TABLE "location_fixtures" ADD COLUMN IF NOT EXISTS "establishing_image_job_id" text;
