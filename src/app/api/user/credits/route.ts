import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getUserCredits } from "@/lib/credits";

export async function GET() {
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = await getUserCredits(userId);
  return NextResponse.json(result);
}
