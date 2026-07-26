CREATE TABLE "error_events" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" text NOT NULL,
	"domain" text NOT NULL,
	"code" text NOT NULL,
	"severity" text NOT NULL,
	"user_id" text,
	"user_email" text,
	"entity_type" text,
	"entity_id" text,
	"message" text NOT NULL,
	"raw_error" text,
	"context" jsonb,
	"source" text,
	"resolved_at" text,
	"resolved_by" text,
	"note" text
);
--> statement-breakpoint
CREATE INDEX "error_events_created_at_idx" ON "error_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "error_events_domain_idx" ON "error_events" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "error_events_severity_idx" ON "error_events" USING btree ("severity");--> statement-breakpoint
CREATE INDEX "error_events_user_id_idx" ON "error_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "error_events_entity_id_idx" ON "error_events" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "error_events_resolved_at_idx" ON "error_events" USING btree ("resolved_at");