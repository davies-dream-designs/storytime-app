CREATE TABLE "gift_orders" (
	"id" text PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"purchaser_user_id" text NOT NULL,
	"purchaser_email" text,
	"recipient_email" text NOT NULL,
	"recipient_name" text,
	"message" text,
	"pack_id" text NOT NULL,
	"credits" integer NOT NULL,
	"amount_aud_cents" integer NOT NULL,
	"status" text NOT NULL,
	"checkout_session_id" text,
	"payment_intent_id" text,
	"referral_referrer_user_id" text,
	"referral_granted_at" text,
	"paid_at" text,
	"redeemed_by_user_id" text,
	"redeemed_at" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "gift_orders_token_idx" ON "gift_orders" USING btree ("token");--> statement-breakpoint
CREATE INDEX "gift_orders_purchaser_user_id_idx" ON "gift_orders" USING btree ("purchaser_user_id");--> statement-breakpoint
CREATE INDEX "gift_orders_recipient_email_idx" ON "gift_orders" USING btree ("recipient_email");--> statement-breakpoint
CREATE INDEX "gift_orders_checkout_session_id_idx" ON "gift_orders" USING btree ("checkout_session_id");--> statement-breakpoint
CREATE INDEX "gift_orders_status_idx" ON "gift_orders" USING btree ("status");