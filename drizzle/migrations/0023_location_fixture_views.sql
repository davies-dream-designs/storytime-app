ALTER TABLE "location_fixtures" ADD COLUMN IF NOT EXISTS "views" jsonb DEFAULT '[]'::jsonb NOT NULL;
