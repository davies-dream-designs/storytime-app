/**
 * One-off script: migrate all data from Vercel KV to Neon Postgres.
 *
 * Run after `drizzle-kit migrate` has applied the schema to Neon:
 *
 *   DATABASE_URL=<neon-url> KV_REST_API_URL=<upstash-url> KV_REST_API_TOKEN=<token> \
 *     npx tsx scripts/migrate-kv-to-pg.ts
 */

import { kv } from "@vercel/kv";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "../src/lib/db/schema";
import type { ChildProfile, Story, Character } from "../src/types";
import type { BookProject, BookBuildJob } from "../src/types/printBook";

const sql = neon(process.env.DATABASE_URL!);
const pg = drizzle(sql, { schema });

async function main() {
  console.log("Starting KV → Postgres migration…");

  // ── Profiles ───────────────────────────────────────────────────────────────
  const profiles = (await kv.get<ChildProfile[]>("profiles")) ?? [];
  if (profiles.length > 0) {
    await pg
      .insert(schema.profiles)
      .values(
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
      )
      .onConflictDoNothing();
    console.log(`✓ Migrated ${profiles.length} profiles`);
  }

  // ── Stories ────────────────────────────────────────────────────────────────
  const stories = (await kv.get<Story[]>("stories")) ?? [];
  if (stories.length > 0) {
    await pg
      .insert(schema.stories)
      .values(
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
      )
      .onConflictDoNothing();
    console.log(`✓ Migrated ${stories.length} stories`);
  }

  // ── Characters ─────────────────────────────────────────────────────────────
  const characters = (await kv.get<Character[]>("characters")) ?? [];
  if (characters.length > 0) {
    await pg
      .insert(schema.characters)
      .values(
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
      )
      .onConflictDoNothing();
    console.log(`✓ Migrated ${characters.length} characters`);
  }

  // ── Book projects ──────────────────────────────────────────────────────────
  // KV stores book projects as individual keys, indexed by user and story
  // Scan user index keys to find all project IDs, then load each project
  const projectIds = new Set<string>();

  // Gather IDs from user index keys
  const userStoryIds =
    (await kv.get<string[]>("bookProjectsByUser")) ?? [];
  for (const id of userStoryIds) projectIds.add(id);

  // Also scan story indexes via stories list
  for (const story of stories) {
    const ids =
      (await kv.get<string[]>(`bookProjectByStory:${story.id}`)) ?? [];
    for (const id of ids) projectIds.add(id);
  }

  // Also scan story indexes via profiles → stories if stories list was partial
  for (const profile of profiles) {
    const ids =
      (await kv.get<string[]>(`bookProjectByUser:${profile.userId}`)) ?? [];
    for (const id of ids) projectIds.add(id);
  }

  let projectCount = 0;
  for (const id of projectIds) {
    const project = await kv.get<BookProject>(`bookProject:${id}`);
    if (!project) continue;
    await pg
      .insert(schema.bookProjects)
      .values({
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
      })
      .onConflictDoNothing();
    projectCount++;
  }
  if (projectCount > 0) {
    console.log(`✓ Migrated ${projectCount} book projects`);
  }

  // ── Book build jobs ────────────────────────────────────────────────────────
  // Build jobs are stored per-project. Migrate any that are still active.
  let jobCount = 0;
  for (const id of projectIds) {
    const jobId = await kv.get<string>(`bookBuildJobByProject:${id}`);
    if (!jobId) continue;
    const job = await kv.get<BookBuildJob>(`bookBuildJob:${jobId}`);
    if (!job) continue;
    await pg
      .insert(schema.bookBuildJobs)
      .values({
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
      })
      .onConflictDoNothing();
    jobCount++;
  }
  if (jobCount > 0) {
    console.log(`✓ Migrated ${jobCount} book build jobs`);
  }

  console.log("Migration complete.");
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
