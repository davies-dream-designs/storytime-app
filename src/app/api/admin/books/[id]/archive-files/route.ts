import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { archiveBookDownloadableFiles } from "@/lib/print-books/retention";

async function requireAdmin() {
  const { userId } = await auth();
  if (!userId) return false;

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  return user.privateMetadata.isAdmin === true;
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const project = await db.bookProjects.getById(id);
  if (!project) {
    return NextResponse.json({ error: "Book not found" }, { status: 404 });
  }

  const result = await archiveBookDownloadableFiles({
    project,
    reason: "manual",
  });

  return NextResponse.json({
    id: result.project.id,
    deletedAssetCount: result.deletedAssetCount,
    assets: result.project.assets,
  });
}
