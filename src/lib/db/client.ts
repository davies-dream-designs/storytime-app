import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

// Lazily initialised so the module can be imported at build time
// without DATABASE_URL being set (Next.js evaluates route modules during build)
let _client: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getClient() {
  if (!_client) {
    const url = process.env.storycot_DATABASE_URL ?? process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    _client = drizzle(neon(url), { schema });
  }
  return _client;
}

export type PgClient = ReturnType<typeof getClient>;
