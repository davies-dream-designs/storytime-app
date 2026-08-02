import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { sql } from "drizzle-orm";
import { getAdminIdentity } from "@/lib/adminAuth";
import { getClient } from "@/lib/db/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONFIRMATION = "RUN_PENDING_MIGRATIONS";

type MigrationCountRow = {
  count: number | string;
};

type AppliedMigrationRow = {
  created_at: number | string | null;
};

function makeStatementIdempotent(statement: string) {
  return statement
    .trim()
    .replace(/^CREATE TABLE\s+/i, "CREATE TABLE IF NOT EXISTS ")
    .replace(
      /^CREATE UNIQUE INDEX\s+/i,
      "CREATE UNIQUE INDEX IF NOT EXISTS "
    )
    .replace(/^CREATE INDEX\s+/i, "CREATE INDEX IF NOT EXISTS ")
    .replace(/\bADD COLUMN\s+/i, "ADD COLUMN IF NOT EXISTS ");
}

async function ensureMigrationLedger(client: ReturnType<typeof getClient>) {
  await client.execute(sql`CREATE SCHEMA IF NOT EXISTS drizzle`);
  await client.execute(sql`
    CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )
  `);
}

async function getMigrationCount(client: ReturnType<typeof getClient>) {
  const tableResult = await client.execute<{ table_name: string | null }>(
    sql`select to_regclass('drizzle.__drizzle_migrations')::text as table_name`
  );
  const tableName = tableResult.rows[0]?.table_name;

  if (!tableName) return 0;

  const result = await client.execute<MigrationCountRow>(
    sql`select count(*)::int as count from drizzle.__drizzle_migrations`
  );
  return Number(result.rows[0]?.count ?? 0);
}

async function getAppliedMigrationMillis(client: ReturnType<typeof getClient>) {
  const result = await client.execute<AppliedMigrationRow>(
    sql`select created_at from drizzle.__drizzle_migrations`
  );
  return new Set(
    result.rows
      .map((row) => row.created_at)
      .filter((value): value is number | string => value != null)
      .map((value) => Number(value))
  );
}

function getActiveDatabaseEnv() {
  if (process.env.storycot_DATABASE_URL) return "storycot_DATABASE_URL";
  if (process.env.DATABASE_URL) return "DATABASE_URL";
  return null;
}

export async function POST(request: NextRequest) {
  const admin = await getAdminIdentity();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as {
    confirm?: string;
  } | null;

  if (body?.confirm !== CONFIRMATION) {
    return NextResponse.json(
      {
        ok: false,
        error: `Confirmation must be ${CONFIRMATION}.`,
      },
      { status: 400 }
    );
  }

  const activeDatabaseEnv = getActiveDatabaseEnv();
  if (!activeDatabaseEnv) {
    return NextResponse.json(
      {
        ok: false,
        activeDatabaseEnv: null,
        error: "No database URL environment variable is configured.",
      },
      { status: 500 }
    );
  }

  const client = getClient();
  const migrationsFolder = path.join(process.cwd(), "drizzle", "migrations");

  try {
    await ensureMigrationLedger(client);
    const beforeCount = await getMigrationCount(client);
    const appliedMillis = await getAppliedMigrationMillis(client);
    const migrations = readMigrationFiles({ migrationsFolder });
    const applied: number[] = [];

    for (const migration of migrations) {
      if (appliedMillis.has(migration.folderMillis)) continue;

      for (const statement of migration.sql) {
        const idempotentStatement = makeStatementIdempotent(statement);
        if (idempotentStatement) {
          await client.execute(sql.raw(idempotentStatement));
        }
      }

      await client.execute(sql`
        insert into drizzle.__drizzle_migrations (hash, created_at)
        select ${migration.hash}, ${migration.folderMillis}
        where not exists (
          select 1
          from drizzle.__drizzle_migrations
          where created_at = ${migration.folderMillis}
        )
      `);
      applied.push(migration.folderMillis);
    }

    const afterCount = await getMigrationCount(client);

    return NextResponse.json({
      ok: true,
      activeDatabaseEnv,
      migrationsFolder,
      beforeCount,
      afterCount,
      appliedCount: applied.length,
      applied,
      runBy: admin.label,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        activeDatabaseEnv,
        migrationsFolder,
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
