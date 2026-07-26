import { NextRequest, NextResponse } from "next/server";
import { getAdminIdentity } from "@/lib/adminAuth";
import { adjustUserCredits } from "@/lib/credits";
import { logEvent } from "@/lib/logEvent";

/** Admin action: grant (or deduct) credits for a user. Body: { delta: number }. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const admin = await getAdminIdentity();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { userId } = await params;
  const body = (await req.json().catch(() => ({}))) as { delta?: unknown };
  const delta = Number(body.delta);
  if (!Number.isFinite(delta) || delta === 0) {
    return NextResponse.json(
      { error: "Provide a non-zero numeric `delta`." },
      { status: 400 }
    );
  }

  try {
    const credits = await adjustUserCredits(userId, delta);
    return NextResponse.json({ userId, credits, delta });
  } catch (err) {
    await logEvent({
      error: err,
      code: "system.unknown",
      userId,
      source: "admin/credits",
      context: { delta, by: admin.label },
    });
    return NextResponse.json(
      { error: "Couldn't update credits for that user." },
      { status: 502 }
    );
  }
}
