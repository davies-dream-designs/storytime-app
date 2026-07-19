import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const isAdmin = user.privateMetadata.isAdmin === true;

  if (process.env.VERCEL_ENV === "production" && !isAdmin) {
    return NextResponse.json(
      { error: "Not available in production" },
      { status: 403 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as { amount?: number };
  const amount = Math.min(
    Math.max(parseInt(String(body.amount ?? 10), 10), 1),
    100
  );

  const current = (user.privateMetadata.credits as number | undefined) ?? 0;
  await client.users.updateUserMetadata(userId, {
    privateMetadata: { credits: current + amount },
  });

  return NextResponse.json({ added: amount, total: current + amount });
}
