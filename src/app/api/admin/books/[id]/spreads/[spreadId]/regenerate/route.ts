import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAdminIdentity } from "@/lib/adminAuth";
import { db } from "@/lib/db";
import { isTradeBookProject } from "@/lib/trade-books/imageProvider";

type RegenerateSpreadPayload = {
  side?: unknown;
  correctionNote?: unknown;
};

// Admin-only per-spread reroll for trade catalogue books. Trade projects are
// owned by the synthetic trade-system user, so the owner-scoped consumer
// route (/api/books/[id]/images/regenerate) can never reach them — this is
// the trade equivalent, queued for the local Cliproxy-only worker rather than
// run inline or dispatched through Inngest/consumer credits.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; spreadId: string }> }
) {
  const admin = await getAdminIdentity();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id, spreadId } = await params;
  const project = await db.bookProjects.getById(id);
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!isTradeBookProject(project)) {
    return NextResponse.json(
      { error: "This project is not a trade catalogue book." },
      { status: 400 }
    );
  }
  if (!project.spreads.some((spread) => spread.id === spreadId)) {
    return NextResponse.json({ error: "Spread not found" }, { status: 404 });
  }
  if (project.assets.activeJobStatus) {
    return NextResponse.json(
      { error: "A build is already running for this book." },
      { status: 409 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as RegenerateSpreadPayload;
  const side = body.side === "right" ? "right" : "left";
  const correctionNote =
    typeof body.correctionNote === "string"
      ? body.correctionNote.trim().slice(0, 500) || undefined
      : undefined;

  const job = await db.tradeBookJobs.enqueue({
    kind: "regenerate_trade_spread",
    dedupeKey: `trade-spread-regen:${id}:${spreadId}:${side}:${randomUUID()}`,
    payload: { bookProjectId: id, spreadId, side, correctionNote },
  });

  return NextResponse.json({ jobId: job?.id }, { status: 202 });
}
