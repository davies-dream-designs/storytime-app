import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAdminIdentity } from "@/lib/adminAuth";
import type {
  ErrorDomain,
  ErrorSeverity,
  ErrorEventFilters,
} from "@/lib/errors";

const DOMAINS = new Set<ErrorDomain>([
  "story",
  "book",
  "print",
  "payment",
  "credits",
  "webhook",
  "external",
  "system",
]);
const SEVERITIES = new Set<ErrorSeverity>(["info", "warning", "error", "critical"]);

/** Translate a "since" preset (24h / 7d / 30d) or ISO string into a timestamp. */
function resolveSince(raw: string | null): string | undefined {
  if (!raw || raw === "all") return undefined;
  const presets: Record<string, number> = {
    "24h": 24 * 60 * 60 * 1000,
    "7d": 7 * 24 * 60 * 60 * 1000,
    "30d": 30 * 24 * 60 * 60 * 1000,
  };
  if (raw in presets) return new Date(Date.now() - presets[raw]!).toISOString();
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? undefined : new Date(parsed).toISOString();
}

export async function GET(req: NextRequest) {
  if (!(await getAdminIdentity())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const domainParam = sp.get("domain");
  const severityParam = sp.get("minSeverity");
  const resolvedParam = sp.get("resolved"); // "true" | "false" | "all"

  const filters: ErrorEventFilters = {
    domain:
      domainParam && DOMAINS.has(domainParam as ErrorDomain)
        ? (domainParam as ErrorDomain)
        : undefined,
    code: sp.get("code") ?? undefined,
    minSeverity:
      severityParam && SEVERITIES.has(severityParam as ErrorSeverity)
        ? (severityParam as ErrorSeverity)
        : undefined,
    resolved:
      resolvedParam === "true"
        ? true
        : resolvedParam === "false"
          ? false
          : undefined,
    userId: sp.get("userId") ?? undefined,
    entityId: sp.get("entityId") ?? undefined,
    since: resolveSince(sp.get("since")),
    search: sp.get("search")?.trim() || undefined,
    limit: sp.get("limit") ? Number(sp.get("limit")) : undefined,
  };

  const [events, summary] = await Promise.all([
    db.errorEvents.list(filters),
    db.errorEvents.unresolvedSummary(),
  ]);

  return NextResponse.json({ events, summary });
}
