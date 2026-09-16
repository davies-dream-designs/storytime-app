import { NextRequest, NextResponse } from "next/server";
import { getAdminIdentity } from "@/lib/adminAuth";
import { db } from "@/lib/db";

type ActionBody = {
  decision?: unknown;
  note?: unknown;
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminIdentity();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const title = await db.tradeTitles.getById(id);
  if (!title) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (title.status !== "draft") {
    return NextResponse.json(
      { error: "Only generated drafts can be reviewed." },
      { status: 400 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as ActionBody;
  if (body.decision !== "approved" && body.decision !== "rejected") {
    return NextResponse.json(
      { error: "Invalid review decision." },
      { status: 400 }
    );
  }
  if (body.note !== undefined && typeof body.note !== "string") {
    return NextResponse.json(
      { error: "Invalid review note." },
      { status: 400 }
    );
  }
  const reviewNote = typeof body.note === "string" ? body.note.trim() : "";
  if (reviewNote.length > 4000) {
    return NextResponse.json(
      { error: "Review notes must be 4,000 characters or fewer." },
      { status: 400 }
    );
  }

  const updated = await db.tradeTitles.update(id, {
    status: body.decision,
    reviewedAt: new Date().toISOString(),
    reviewedBy: admin.label,
    reviewNote,
  });
  return NextResponse.json({ title: updated });
}
