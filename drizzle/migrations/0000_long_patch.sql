CREATE TABLE "book_build_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"user_id" text NOT NULL,
	"mode" text NOT NULL,
	"status" text NOT NULL,
	"step" integer DEFAULT 0 NOT NULL,
	"total_steps" integer,
	"token" text NOT NULL,
	"base_url" text NOT NULL,
	"current_step_label" text,
	"error_message" text,
	"started_at" text,
	"completed_at" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "book_projects" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"source_story_id" text NOT NULL,
	"profile_id" text NOT NULL,
	"age_band" text NOT NULL,
	"status" text NOT NULL,
	"trim_size" text NOT NULL,
	"page_count" integer NOT NULL,
	"spread_count" integer NOT NULL,
	"completed_spreads" integer DEFAULT 0 NOT NULL,
	"total_spreads" integer NOT NULL,
	"current_stage_label" text NOT NULL,
	"character_bible" jsonb,
	"beats" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"spreads" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"assets" jsonb NOT NULL,
	"billing" jsonb,
	"print_order" jsonb,
	"error_code" text,
	"error_message" text,
	"raw_error" text,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"ready_at" text,
	"book_ready_email_sent_at" text
);
--> statement-breakpoint
CREATE TABLE "characters" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"personality" text NOT NULL,
	"appearance" text NOT NULL,
	"profile_id" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"age" integer DEFAULT 0 NOT NULL,
	"date_of_birth" text,
	"appearance" jsonb,
	"favourite_characters" text[] DEFAULT '{}' NOT NULL,
	"favourite_activities" text[] DEFAULT '{}' NOT NULL,
	"favourite_animals" text[] DEFAULT '{}' NOT NULL,
	"favourite_places" text[] DEFAULT '{}' NOT NULL,
	"lessons" text[] DEFAULT '{}' NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stories" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"profile_id" text NOT NULL,
	"profile_name" text NOT NULL,
	"pages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"word_count" integer DEFAULT 0 NOT NULL,
	"theme" text NOT NULL,
	"premise" text,
	"notes" text DEFAULT '' NOT NULL,
	"story_preset" text,
	"ip_policy" jsonb,
	"created_at" text NOT NULL,
	"status" text,
	"generation_error" text,
	"share_token" text
);
--> statement-breakpoint
CREATE INDEX "book_build_jobs_project_id_idx" ON "book_build_jobs" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "book_projects_user_id_idx" ON "book_projects" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "book_projects_source_story_id_idx" ON "book_projects" USING btree ("source_story_id");--> statement-breakpoint
CREATE INDEX "characters_user_id_idx" ON "characters" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "characters_profile_id_idx" ON "characters" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "profiles_user_id_idx" ON "profiles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "stories_user_id_idx" ON "stories" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "stories_profile_id_idx" ON "stories" USING btree ("profile_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stories_share_token_idx" ON "stories" USING btree ("share_token");