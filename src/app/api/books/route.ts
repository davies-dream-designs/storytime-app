import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { createEmptyBookProject } from "@/lib/print-books/composer";
import { inferBookAgeBand } from "@/lib/print-books/ageBand";

export async function GET() {
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const projects = await db.bookProjects.getByUserId(userId);
  const sorted = [...projects].sort((a, b) =>
    a.createdAt > b.createdAt ? -1 : 1
  );
  return NextResponse.json(sorted);
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { sourceStoryId } = (await req.json()) as { sourceStoryId?: string };
  if (!sourceStoryId) {
    return NextResponse.json(
      { error: "sourceStoryId is required" },
      { status: 400 }
    );
  }

  const story = await db.stories.getById(sourceStoryId);
  if (!story || story.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const profile = await db.profiles.getById(story.profileId);
  if (!profile || profile.userId !== userId) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const existingProjects = (await db.bookProjects.getByStoryId(story.id))
    .filter((project) => project.userId === userId)
    .sort((a, b) => (a.updatedAt > b.updatedAt ? -1 : 1));

  const existingProject =
    existingProjects.find((project) => project.status !== "failed") ??
    existingProjects[0];

  if (existingProject) {
    return NextResponse.json(existingProject, { status: 200 });
  }

  const project = createEmptyBookProject({
    id: randomUUID(),
    userId,
    sourceStoryId: story.id,
    profileId: profile.id,
    ageBand: inferBookAgeBand({ profile, storyPreset: story.storyPreset }),
  });

  await db.bookProjects.create(project);
  return NextResponse.json(project, { status: 201 });
}
