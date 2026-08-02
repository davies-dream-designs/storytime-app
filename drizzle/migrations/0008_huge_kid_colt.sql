CREATE TABLE "story_people" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"relationship" text DEFAULT 'other' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"personality" text DEFAULT '' NOT NULL,
	"appearance" text DEFAULT '' NOT NULL,
	"pronouns" text,
	"avatar_image_url" text,
	"appearance_summary" text,
	"available_to_all_profiles" boolean DEFAULT false NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "story_person_profiles" (
	"story_person_id" text NOT NULL,
	"profile_id" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stories" ADD COLUMN "story_person_ids" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
CREATE INDEX "story_people_user_id_idx" ON "story_people" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "story_person_profiles_unique_idx" ON "story_person_profiles" USING btree ("story_person_id","profile_id");--> statement-breakpoint
CREATE INDEX "story_person_profiles_person_idx" ON "story_person_profiles" USING btree ("story_person_id");--> statement-breakpoint
CREATE INDEX "story_person_profiles_profile_idx" ON "story_person_profiles" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "story_person_profiles_user_idx" ON "story_person_profiles" USING btree ("user_id");--> statement-breakpoint
INSERT INTO "story_people" (
	"id",
	"user_id",
	"name",
	"relationship",
	"description",
	"personality",
	"appearance",
	"available_to_all_profiles",
	"created_at",
	"updated_at"
)
SELECT
	"id",
	"user_id",
	"name",
	'other',
	"description",
	"personality",
	"appearance",
	false,
	"created_at",
	"created_at"
FROM "characters"
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
INSERT INTO "story_person_profiles" (
	"story_person_id",
	"profile_id",
	"user_id",
	"created_at"
)
SELECT
	"id",
	"profile_id",
	"user_id",
	"created_at"
FROM "characters"
ON CONFLICT ("story_person_id", "profile_id") DO NOTHING;
