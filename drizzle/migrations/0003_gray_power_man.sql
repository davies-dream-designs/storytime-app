ALTER TABLE "stories" ADD COLUMN "visibility" text DEFAULT 'private' NOT NULL;--> statement-breakpoint
ALTER TABLE "stories" ADD COLUMN "public_review_status" text DEFAULT 'not_submitted' NOT NULL;--> statement-breakpoint
ALTER TABLE "stories" ADD COLUMN "public_submitted_at" text;--> statement-breakpoint
ALTER TABLE "stories" ADD COLUMN "public_reviewed_at" text;--> statement-breakpoint
ALTER TABLE "stories" ADD COLUMN "public_reviewed_by" text;--> statement-breakpoint
ALTER TABLE "stories" ADD COLUMN "public_rejection_reason" text;--> statement-breakpoint
ALTER TABLE "stories" ADD COLUMN "public_author_name" text;--> statement-breakpoint
ALTER TABLE "stories" ADD COLUMN "public_terms_accepted_at" text;--> statement-breakpoint
CREATE INDEX "stories_public_review_status_idx" ON "stories" USING btree ("public_review_status");--> statement-breakpoint
CREATE INDEX "stories_public_gallery_idx" ON "stories" USING btree ("visibility","public_review_status");