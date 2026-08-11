ALTER TABLE "profiles" ADD COLUMN "avatar_trait_hash" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "avatar_generated_at" text;--> statement-breakpoint
ALTER TABLE "story_people" ADD COLUMN "avatar_trait_hash" text;--> statement-breakpoint
ALTER TABLE "story_people" ADD COLUMN "avatar_generated_at" text;
