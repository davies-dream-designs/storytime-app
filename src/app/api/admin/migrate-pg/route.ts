/**
 * One-off migration route: KV → Postgres.
 * Admin-only. DELETE THIS FILE after the migration is confirmed.
 *
 * POST /api/admin/migrate-pg
 */
import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { kv } from "@vercel/kv";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "@/lib/db/schema";
import type { ChildProfile, Story, Character } from "@/types";
import type { BookProject, BookBuildJob } from "@/types/printBook";

export async function POST() {
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  if (user.privateMetadata.isAdmin !== true)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const dbUrl = process.env.storycot_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!dbUrl)
    return NextResponse.json({ error: "DATABASE_URL not set" }, { status: 500 });

  const sql = neon(dbUrl);
  const pg = drizzle(sql, { schema });

  const results: Record<string, number> = {};

  // ── Profiles ──────────────────────────────────────────────────────────────
  const profiles = (await kv.get<ChildProfile[]>("profiles")) ?? [];
  if (profiles.length > 0) {
    await pg.insert(schema.profiles).values(
      profiles.map((p) => ({
        id: p.id,
        userId: p.userId,
        name: p.name,
        age: p.age,
        dateOfBirth: p.dateOfBirth ?? null,
        appearance: p.appearance ?? null,
        favouriteCharacters: p.favouriteCharacters ?? [],
        favouriteActivities: p.favouriteActivities ?? [],
        favouriteAnimals: p.favouriteAnimals ?? [],
        favouritePlaces: p.favouritePlaces ?? [],
        lessons: p.lessons ?? [],
        createdAt: p.createdAt,
      }))
    ).onConflictDoNothing();
  }
  results.profiles = profiles.length;

  // ── Stories ───────────────────────────────────────────────────────────────
  const stories = (await kv.get<Story[]>("stories")) ?? [];
  if (stories.length > 0) {
    await pg.insert(schema.stories).values(
      stories.map((s) => ({
        id: s.id,
        userId: s.userId,
        title: s.title,
        profileId: s.profileId,
        profileName: s.profileName,
        pages: s.pages,
        wordCount: s.wordCount,
        theme: s.theme,
        premise: s.premise ?? null,
        notes: s.notes ?? "",
        storyPreset: s.storyPreset ?? null,
        ipPolicy: s.ipPolicy ?? null,
        createdAt: s.createdAt,
        status: s.status ?? null,
        generationError: s.generationError ?? null,
        shareToken: s.shareToken ?? null,
      }))
    ).onConflictDoNothing();
  }
  results.stories = stories.length;

  // ── Characters ────────────────────────────────────────────────────────────
  const characters = (await kv.get<Character[]>("characters")) ?? [];
  if (characters.length > 0) {
    await pg.insert(schema.characters).values(
      characters.map((c) => ({
        id: c.id,
        userId: c.userId,
        name: c.name,
        description: c.description,
        personality: c.personality,
        appearance: c.appearance,
        profileId: c.profileId,
        createdAt: c.createdAt,
      }))
    ).onConflictDoNothing();
  }
  results.characters = characters.length;

  // ── Book projects ─────────────────────────────────────────────────────────
  const projectIds = new Set<string>();
  for (const profile of profiles) {
    const ids = (await kv.get<string[]>(`bookProjectByUser:${profile.userId}`)) ?? [];
    for (const id of ids) projectIds.add(id);
  }
  for (const story of stories) {
    const ids = (await kv.get<string[]>(`bookProjectByStory:${story.id}`)) ?? [];
    for (const id of ids) projectIds.add(id);
  }

  let projectCount = 0;
  let jobCount = 0;
  for (const id of projectIds) {
    const project = await kv.get<BookProject>(`bookProject:${id}`);
    if (!project) continue;
    await pg.insert(schema.bookProjects).values({
      id: project.id,
      userId: project.userId,
      sourceStoryId: project.sourceStoryId,
      profileId: project.profileId,
      ageBand: project.ageBand,
      status: project.status,
      trimSize: project.trimSize,
      pageCount: project.pageCount,
      spreadCount: project.spreadCount,
      completedSpreads: project.completedSpreads,
      totalSpreads: project.totalSpreads,
      currentStageLabel: project.currentStageLabel,
      characterBible: project.characterBible ?? null,
      beats: project.beats,
      spreads: project.spreads,
      assets: project.assets,
      billing: project.billing ?? null,
      printOrder: project.printOrder ?? null,
      errorCode: project.errorCode ?? null,
      errorMessage: project.errorMessage ?? null,
      rawError: project.rawError ?? null,
      retryCount: project.retryCount,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      readyAt: project.readyAt ?? null,
      bookReadyEmailSentAt: project.assets.bookReadyEmailSentAt ?? null,
    }).onConflictDoNothing();
    projectCount++;

    // Migrate active build job for this project
    const jobId = await kv.get<string>(`bookBuildJobByProject:${id}`);
    if (jobId) {
      const job = await kv.get<BookBuildJob>(`bookBuildJob:${jobId}`);
      if (job) {
        await pg.insert(schema.bookBuildJobs).values({
          id: job.id,
          projectId: job.projectId,
          userId: job.userId,
          mode: job.mode,
          status: job.status,
          step: job.step,
          totalSteps: job.totalSteps ?? null,
          token: job.token,
          baseUrl: job.baseUrl,
          currentStepLabel: job.currentStepLabel ?? null,
          errorMessage: job.errorMessage ?? null,
          startedAt: job.startedAt ?? null,
          completedAt: job.completedAt ?? null,
          createdAt: job.createdAt,
          updatedAt: job.updatedAt,
        }).onConflictDoNothing();
        jobCount++;
      }
    }
  }
  results.bookProjects = projectCount;
  results.bookBuildJobs = jobCount;

  return NextResponse.json({ ok: true, migrated: results });
}
