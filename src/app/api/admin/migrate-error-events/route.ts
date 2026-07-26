import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getClient } from "@/lib/db/client";
import { getAdminIdentity } from "@/lib/adminAuth";

// Idempotent creation of the `error_events` table + indexes. Mirrors
// drizzle/migrations/0001_error_events.sql, but written with IF NOT EXISTS so
// it's safe to run (and re-run) from the admin panel — same pattern as the
// original KV→Postgres schema button.
const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS "error_events" (
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
  )`,
  `CREATE INDEX IF NOT EXISTS "error_events_created_at_idx" ON "error_events" USING btree ("created_at")`,
  `CREATE INDEX IF NOT EXISTS "error_events_domain_idx" ON "error_events" USING btree ("domain")`,
  `CREATE INDEX IF NOT EXISTS "error_events_severity_idx" ON "error_events" USING btree ("severity")`,
  `CREATE INDEX IF NOT EXISTS "error_events_user_id_idx" ON "error_events" USING btree ("user_id")`,
  `CREATE INDEX IF NOT EXISTS "error_events_entity_id_idx" ON "error_events" USING btree ("entity_id")`,
  `CREATE INDEX IF NOT EXISTS "error_events_resolved_at_idx" ON "error_events" USING btree ("resolved_at")`,
];

export async function POST() {
  if (!(await getAdminIdentity())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const client = getClient();
  const applied: string[] = [];
  try {
    for (const statement of STATEMENTS) {
      await client.execute(sql.raw(statement));
      applied.push(statement.split("\n")[0]!.trim());
    }
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        applied,
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    message: "error_events table ready.",
    applied,
  });
}
