CREATE TABLE "trade_titles" (
	"id" text PRIMARY KEY NOT NULL,
	"status" text NOT NULL,
	"seed_brief" jsonb NOT NULL,
	"profile_id" text,
	"story_id" text,
	"book_project_id" text,
	"model_metadata" jsonb,
	"gate_results" jsonb,
	"generation_error" text,
	"reviewed_at" text,
	"reviewed_by" text,
	"review_note" text,
	"published_at" text,
	"store_url" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX "trade_titles_status_updated_at_idx" ON "trade_titles" USING btree ("status","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "trade_titles_profile_id_unique" ON "trade_titles" USING btree ("profile_id") WHERE "trade_titles"."profile_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "trade_titles_story_id_unique" ON "trade_titles" USING btree ("story_id") WHERE "trade_titles"."story_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "trade_titles_book_project_id_unique" ON "trade_titles" USING btree ("book_project_id") WHERE "trade_titles"."book_project_id" IS NOT NULL;