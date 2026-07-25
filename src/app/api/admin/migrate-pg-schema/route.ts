/**
 * One-off migration route: applies the Drizzle schema to Neon.
 * Admin-only. DELETE THIS FILE after the schema is confirmed.
 *
 * POST /api/admin/migrate-pg-schema
 */
import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { Pool } from "@neondatabase/serverless";

const DDL = `
CREATE TABLE IF NOT EXISTS "profiles" (
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

CREATE TABLE IF NOT EXISTS "stories" (
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

CREATE TABLE IF NOT EXISTS "characters" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "name" text NOT NULL,
  "description" text NOT NULL,
  "personality" text NOT NULL,
  "appearance" text NOT NULL,
  "profile_id" text NOT NULL,
  "created_at" text NOT NULL
);

CREATE TABLE IF NOT EXISTS "book_projects" (
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

CREATE TABLE IF NOT EXISTS "book_build_jobs" (
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

CREATE INDEX IF NOT EXISTS "profiles_user_id_idx" ON "profiles" ("user_id");
CREATE INDEX IF NOT EXISTS "stories_user_id_idx" ON "stories" ("user_id");
CREATE INDEX IF NOT EXISTS "stories_profile_id_idx" ON "stories" ("profile_id");
CREATE UNIQUE INDEX IF NOT EXISTS "stories_share_token_idx" ON "stories" ("share_token");
CREATE INDEX IF NOT EXISTS "characters_user_id_idx" ON "characters" ("user_id");
CREATE INDEX IF NOT EXISTS "characters_profile_id_idx" ON "characters" ("profile_id");
CREATE INDEX IF NOT EXISTS "book_projects_user_id_idx" ON "book_projects" ("user_id");
CREATE INDEX IF NOT EXISTS "book_projects_source_story_id_idx" ON "book_projects" ("source_story_id");
CREATE INDEX IF NOT EXISTS "book_build_jobs_project_id_idx" ON "book_build_jobs" ("project_id");
`;

export async function POST() {
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  if (user.privateMetadata.isAdmin !== true)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const dbUrl = process.env.storycot_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!dbUrl)
    return NextResponse.json({ error: "DATABASE_URL not set" }, { status: 500 });

  const pool = new Pool({ connectionString: dbUrl });
  try {
    // Execute each statement individually (pool.query supports raw strings)
    const statements = DDL.split(/;\s*\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    for (const stmt of statements) {
      await pool.query(stmt);
    }
  } finally {
    await pool.end();
  }

  return NextResponse.json({ ok: true, message: "Schema applied" });
}
