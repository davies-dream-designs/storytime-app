-- Baseline snapshot repair (no-op).
--
-- Migrations 0022-0026 were committed with their SQL but their drizzle meta
-- snapshots were never generated, so drizzle-kit generate kept re-emitting
-- those already-applied tables/columns as new drift. This migration carries no
-- schema statements; its only purpose is to advance the drizzle snapshot chain
-- so it matches src/lib/db/schema.ts. Applying it is a no-op on every database.
SELECT 1;
