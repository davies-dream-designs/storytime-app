import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { db } from "@/lib/db";

export async function GET() {
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  if (user.privateMetadata.isAdmin !== true)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const failedIds = await db.bookProjects.getFailedIndex();
  const projects = (
    await Promise.all(failedIds.map((id) => db.bookProjects.getById(id)))
  ).filter(Boolean);

  return NextResponse.json(
    projects.map((p) => ({
      id: p!.id,
      userId: p!.userId,
      status: p!.status,
      errorCode: p!.errorCode,
      errorMessage: p!.errorMessage,
      rawError: p!.rawError,
      retryCount: p!.retryCount,
      updatedAt: p!.updatedAt,
    }))
  );
}
