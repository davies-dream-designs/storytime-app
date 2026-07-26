import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAdminIdentity } from "@/lib/adminAuth";

/** Mark an event resolved (with an optional note) or reopen it. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminIdentity();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    resolved?: boolean;
    note?: string;
  };

  const event =
    body.resolved === false
      ? await db.errorEvents.reopen(id)
      : await db.errorEvents.resolve(id, admin.label, body.note?.trim() || undefined);

  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  return NextResponse.json({ event });
}
