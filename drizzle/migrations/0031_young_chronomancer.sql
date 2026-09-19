CREATE TABLE "lulu_price_cache" (
	"product_key" text PRIMARY KEY NOT NULL,
	"sample_low_page_count" integer NOT NULL,
	"sample_low_cost_aud_cents" integer NOT NULL,
	"sample_high_page_count" integer NOT NULL,
	"sample_high_cost_aud_cents" integer NOT NULL,
	"quoted_at" text NOT NULL,
	"raw_response" jsonb
);
