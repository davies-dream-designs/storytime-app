CREATE TABLE "print_orders" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"project_id" text NOT NULL,
	"story_id" text NOT NULL,
	"owner_user_id" text NOT NULL,
	"buyer_user_id" text,
	"buyer_email" text,
	"product_key" text NOT NULL,
	"product_label" text NOT NULL,
	"provider" text NOT NULL,
	"format" text NOT NULL,
	"status" text NOT NULL,
	"amount_aud_cents" integer NOT NULL,
	"subtotal_aud_cents" integer NOT NULL,
	"shipping_aud_cents" integer NOT NULL,
	"lulu_cost_aud_cents" integer,
	"margin_aud_cents" integer,
	"page_count" integer NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"checkout_session_id" text,
	"payment_intent_id" text,
	"billing_country" text,
	"shipping" jsonb,
	"fulfillment" jsonb,
	"checkout_started_at" text,
	"paid_at" text,
	"refunded_at" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX "print_orders_project_id_idx" ON "print_orders" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "print_orders_story_id_idx" ON "print_orders" USING btree ("story_id");--> statement-breakpoint
CREATE INDEX "print_orders_owner_user_id_idx" ON "print_orders" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "print_orders_buyer_user_id_idx" ON "print_orders" USING btree ("buyer_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "print_orders_checkout_session_id_idx" ON "print_orders" USING btree ("checkout_session_id");--> statement-breakpoint
CREATE INDEX "print_orders_status_idx" ON "print_orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "print_orders_created_at_idx" ON "print_orders" USING btree ("created_at");