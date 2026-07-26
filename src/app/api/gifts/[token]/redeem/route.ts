import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { adjustUserCredits } from "@/lib/credits";
import { db } from "@/lib/db";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { token } = await params;
  if (!token || !/^[A-Za-z0-9_-]{16,80}$/.test(token)) {
    return NextResponse.json({ error: "Invalid gift link" }, { status: 400 });
  }

  const gift = await db.giftOrders.claimRedeemed(
    token,
    userId,
    new Date().toISOString()
  );
  if (!gift) {
    const existing = await db.giftOrders.getByToken(token);
    if (!existing) {
      return NextResponse.json({ error: "Gift not found" }, { status: 404 });
    }
    if (existing.status === "checkout_started") {
      return NextResponse.json(
        { error: "This gift has not been paid for yet." },
        { status: 409 }
      );
    }
    if (existing.status === "redeemed") {
      return NextResponse.json(
        { error: "This gift has already been redeemed." },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: "This gift is no longer available." },
      { status: 409 }
    );
  }

  try {
    const credits = await adjustUserCredits(userId, gift.credits);
    return NextResponse.json({ success: true, credits, added: gift.credits });
  } catch (err) {
    await db.giftOrders.update(gift.id, {
      status: "paid",
      redeemedByUserId: undefined,
      redeemedAt: undefined,
    });
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Could not add credits. Please try again.",
      },
      { status: 500 }
    );
  }
}
