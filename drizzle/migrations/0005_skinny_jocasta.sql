CREATE TABLE "public_story_moderation_events" (
	"id" text PRIMARY KEY NOT NULL,
	"story_id" text NOT NULL,
	"actor_user_id" text,
	"actor_label" text NOT NULL,
	"action" text NOT NULL,
	"note" text,
	"metadata" jsonb,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX "public_story_moderation_events_story_idx" ON "public_story_moderation_events" USING btree ("story_id");--> statement-breakpoint
CREATE INDEX "public_story_moderation_events_created_idx" ON "public_story_moderation_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "public_story_moderation_events_action_idx" ON "public_story_moderation_events" USING btree ("action");