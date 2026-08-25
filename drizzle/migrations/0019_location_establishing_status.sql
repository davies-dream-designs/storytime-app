ALTER TABLE "location_fixtures" ADD COLUMN IF NOT EXISTS "establishing_image_status" text;
ALTER TABLE "location_fixtures" ADD COLUMN IF NOT EXISTS "establishing_image_error" text;
ALTER TABLE "location_fixtures" ADD COLUMN IF NOT EXISTS "establishing_image_job_id" text;
