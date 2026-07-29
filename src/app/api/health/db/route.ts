import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

export const dynamic = "force-dynamic";

export async function GET() {
  const storycotUrl = process.env.storycot_DATABASE_URL;
  const databaseUrl = process.env.DATABASE_URL;
  const url = storycotUrl ?? databaseUrl;

  if (!url) {
    return NextResponse.json(
      {
        status: "error",
        hasStorycotDatabaseUrl: false,
        hasDatabaseUrl: false,
        error: "DATABASE_URL is not set",
      },
      { status: 500 }
    );
  }

  try {
    const sql = neon(url);
    const [migrations, publicTables, storyPublicColumns, printOrderColumns] =
      await Promise.all([
        sql`select count(*)::int as count from drizzle.__drizzle_migrations`,
        sql`
          select table_name
          from information_schema.tables
          where table_schema = 'public'
            and table_name in (
              'print_orders',
              'public_story_votes',
              'public_story_reports',
              'public_story_moderation_events'
            )
          order by table_name
        `,
        sql`
          select count(*)::int as count
          from information_schema.columns
          where table_schema = 'public'
            and table_name = 'stories'
            and column_name in (
              'visibility',
              'public_review_status',
              'public_submitted_at',
              'public_reviewed_at',
              'public_reviewed_by',
              'public_rejection_reason',
              'public_author_name',
              'public_terms_accepted_at'
            )
        `,
        sql`
          select count(*)::int as count
          from information_schema.columns
          where table_schema = 'public'
            and table_name = 'print_orders'
        `,
      ]);

    return NextResponse.json({
      status: "ok",
      activeDatabaseEnv: storycotUrl ? "storycot_DATABASE_URL" : "DATABASE_URL",
      hasStorycotDatabaseUrl: Boolean(storycotUrl),
      hasDatabaseUrl: Boolean(databaseUrl),
      migrationCount: migrations[0]?.count ?? 0,
      publicTables: publicTables.map((row) => row.table_name),
      storyPublicColumnCount: storyPublicColumns[0]?.count ?? 0,
      printOrderColumnCount: printOrderColumns[0]?.count ?? 0,
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        activeDatabaseEnv: storycotUrl ? "storycot_DATABASE_URL" : "DATABASE_URL",
        hasStorycotDatabaseUrl: Boolean(storycotUrl),
        hasDatabaseUrl: Boolean(databaseUrl),
        error: error instanceof Error ? error.message : "Unknown DB error",
      },
      { status: 500 }
    );
  }
}
