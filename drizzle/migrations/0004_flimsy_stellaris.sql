CREATE TABLE "public_story_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"story_id" text NOT NULL,
	"user_id" text NOT NULL,
	"reason" text NOT NULL,
	"note" text,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" text NOT NULL,
	"reviewed_at" text,
	"reviewed_by" text
);
--> statement-breakpoint
CREATE TABLE "public_story_votes" (
	"id" text PRIMARY KEY NOT NULL,
	"story_id" text NOT NULL,
	"user_id" text NOT NULL,
	"vote_month" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "public_story_reports_story_user_idx" ON "public_story_reports" USING btree ("story_id","user_id");--> statement-breakpoint
CREATE INDEX "public_story_reports_story_status_idx" ON "public_story_reports" USING btree ("story_id","status");--> statement-breakpoint
CREATE INDEX "public_story_reports_status_idx" ON "public_story_reports" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "public_story_votes_story_user_month_idx" ON "public_story_votes" USING btree ("story_id","user_id","vote_month");--> statement-breakpoint
CREATE INDEX "public_story_votes_story_month_idx" ON "public_story_votes" USING btree ("story_id","vote_month");--> statement-breakpoint
CREATE INDEX "public_story_votes_user_month_idx" ON "public_story_votes" USING btree ("user_id","vote_month");