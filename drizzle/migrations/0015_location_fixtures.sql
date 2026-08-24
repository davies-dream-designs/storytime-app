CREATE TABLE "location_fixtures" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"place" text NOT NULL,
	"area" text,
	"summary" text,
	"notes" text,
	"reference_image_url" text,
	"fixed_elements" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"do_not_change" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"lighting" text,
	"palette" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX "location_fixtures_user_id_idx" ON "location_fixtures" USING btree ("user_id");