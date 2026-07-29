import { NextRequest, NextResponse } from "next/server";
import { getAdminIdentity } from "@/lib/adminAuth";
import { adjustUserCredits } from "@/lib/credits";
import { logEvent } from "@/lib/logEvent";

/**
 * Admin action: grant (or deduct) credits for a user.
 * Body: { delta: number, reason?: string }.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const admin = await getAdminIdentity();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { userId } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    delta?: unknown;
    reason?: unknown;
  };
  const delta = Number(body.delta);
  if (!Number.isFinite(delta) || delta === 0) {
    return NextResponse.json(
      { error: "Provide a non-zero numeric `delta`." },
      { status: 400 }
    );
  }
  const reason =
    typeof body.reason === "string" ? body.reason.trim().slice(0, 240) : "";

  try {
    const credits = await adjustUserCredits(userId, delta);
    await logEvent({
      code: "admin.credits_adjusted",
      severity: "info",
      domain: "credits",
      userId,
      entityType: "user",
      entityId: userId,
      message: `Admin adjusted credits by ${delta}.`,
      source: "admin/credits",
      context: { delta, by: admin.label, reason: reason || undefined },
    });
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
