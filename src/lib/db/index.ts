import { eq, and, inArray, desc, isNull, isNotNull } from "drizzle-orm";
import { getClient } from "./client";
import * as schema from "./schema";
import type { ChildProfile, Story, Character } from "@/types";
import type { BookBuildJob, BookProject, PrintBookOrder } from "@/types/printBook";
import { deleteBookProjectAssets } from "@/lib/print-books/storage";

// ── Row ↔ type converters ─────────────────────────────────────────────────────

type ProfileRow = typeof schema.profiles.$inferSelect;
type StoryRow = typeof schema.stories.$inferSelect;
type CharacterRow = typeof schema.characters.$inferSelect;
type BookProjectRow = typeof schema.bookProjects.$inferSelect;
type BookBuildJobRow = typeof schema.bookBuildJobs.$inferSelect;

function rowToProfile(row: ProfileRow): ChildProfile {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    age: row.age,
    dateOfBirth: row.dateOfBirth ?? undefined,
    appearance: row.appearance ?? undefined,
    favouriteCharacters: row.favouriteCharacters ?? [],
    favouriteActivities: row.favouriteActivities ?? [],
    favouriteAnimals: row.favouriteAnimals ?? [],
    favouritePlaces: row.favouritePlaces ?? [],
    lessons: row.lessons ?? [],
    createdAt: row.createdAt,
  };
}

function profileToRow(p: ChildProfile) {
  return {
    id: p.id,
    userId: p.userId,
    name: p.name,
    age: p.age,
    dateOfBirth: p.dateOfBirth ?? null,
    appearance: p.appearance ?? null,
    favouriteCharacters: p.favouriteCharacters,
    favouriteActivities: p.favouriteActivities,
    favouriteAnimals: p.favouriteAnimals,
    favouritePlaces: p.favouritePlaces,
    lessons: p.lessons,
    createdAt: p.createdAt,
  };
}

function rowToStory(row: StoryRow): Story {
  return {
    id: row.id,
    userId: row.userId,
    title: row.title,
    profileId: row.profileId,
    profileName: row.profileName,
    pages: (row.pages as Story["pages"]) ?? [],
    wordCount: row.wordCount,
    theme: row.theme,
    premise: row.premise ?? undefined,
    notes: row.notes,
    storyPreset: row.storyPreset ?? undefined,
    ipPolicy: row.ipPolicy ?? undefined,
    createdAt: row.createdAt,
    status: row.status ?? undefined,
    generationError: row.generationError ?? undefined,
    shareToken: row.shareToken ?? undefined,
  };
}

function storyToRow(s: Story) {
  return {
    id: s.id,
    userId: s.userId,
    title: s.title,
    profileId: s.profileId,
    profileName: s.profileName,
    pages: s.pages,
    wordCount: s.wordCount,
    theme: s.theme,
    premise: s.premise ?? null,
    notes: s.notes,
    storyPreset: s.storyPreset ?? null,
    ipPolicy: s.ipPolicy ?? null,
    createdAt: s.createdAt,
    status: s.status ?? null,
    generationError: s.generationError ?? null,
    shareToken: s.shareToken ?? null,
  };
}

function rowToCharacter(row: CharacterRow): Character {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    description: row.description,
    personality: row.personality,
    appearance: row.appearance,
    profileId: row.profileId,
    createdAt: row.createdAt,
  };
}

function characterToRow(c: Character) {
  return {
    id: c.id,
    userId: c.userId,
    name: c.name,
    description: c.description,
    personality: c.personality,
    appearance: c.appearance,
    profileId: c.profileId,
    createdAt: c.createdAt,
  };
}

function rowToBookProject(row: BookProjectRow): BookProject {
  return {
    id: row.id,
    userId: row.userId,
    sourceStoryId: row.sourceStoryId,
    profileId: row.profileId,
    ageBand: row.ageBand,
    status: row.status,
    trimSize: row.trimSize,
    pageCount: row.pageCount,
    spreadCount: row.spreadCount,
    completedSpreads: row.completedSpreads,
    totalSpreads: row.totalSpreads,
    currentStageLabel: row.currentStageLabel,
    characterBible: row.characterBible ?? undefined,
    beats: (row.beats as BookProject["beats"]) ?? [],
    spreads: (row.spreads as BookProject["spreads"]) ?? [],
    assets: row.assets as BookProject["assets"],
    billing: row.billing ? (row.billing as BookProject["billing"]) : undefined,
    printOrder: row.printOrder
      ? (row.printOrder as BookProject["printOrder"])
      : undefined,
    errorCode: row.errorCode ?? undefined,
    errorMessage: row.errorMessage ?? undefined,
    rawError: row.rawError ?? undefined,
    retryCount: row.retryCount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    readyAt: row.readyAt ?? undefined,
  };
}

function bookProjectToRow(p: BookProject) {
  return {
    id: p.id,
    userId: p.userId,
    sourceStoryId: p.sourceStoryId,
    profileId: p.profileId,
    ageBand: p.ageBand,
    status: p.status,
    trimSize: p.trimSize,
    pageCount: p.pageCount,
    spreadCount: p.spreadCount,
    completedSpreads: p.completedSpreads,
    totalSpreads: p.totalSpreads,
    currentStageLabel: p.currentStageLabel,
    characterBible: p.characterBible ?? null,
    beats: p.beats,
    spreads: p.spreads,
    assets: p.assets,
    billing: p.billing ?? null,
    printOrder: p.printOrder ?? null,
    errorCode: p.errorCode ?? null,
    errorMessage: p.errorMessage ?? null,
    rawError: p.rawError ?? null,
    retryCount: p.retryCount,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    readyAt: p.readyAt ?? null,
  };
}

function rowToBookBuildJob(row: BookBuildJobRow): BookBuildJob {
  return {
    id: row.id,
    projectId: row.projectId,
    userId: row.userId,
    mode: row.mode,
    status: row.status,
    step: row.step,
    totalSteps: row.totalSteps ?? undefined,
    token: row.token,
    baseUrl: row.baseUrl,
    currentStepLabel: row.currentStepLabel ?? undefined,
    errorMessage: row.errorMessage ?? undefined,
    startedAt: row.startedAt ?? undefined,
    completedAt: row.completedAt ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function bookBuildJobToRow(j: BookBuildJob) {
  return {
    id: j.id,
    projectId: j.projectId,
    userId: j.userId,
    mode: j.mode,
    status: j.status,
    step: j.step,
    totalSteps: j.totalSteps ?? null,
    token: j.token,
    baseUrl: j.baseUrl,
    currentStepLabel: j.currentStepLabel ?? null,
    errorMessage: j.errorMessage ?? null,
    startedAt: j.startedAt ?? null,
    completedAt: j.completedAt ?? null,
    createdAt: j.createdAt,
    updatedAt: j.updatedAt,
  };
}

// ── db object ─────────────────────────────────────────────────────────────────

export const db = {
  profiles: {
    async getAll(): Promise<ChildProfile[]> {
      const rows = await getClient().select().from(schema.profiles);
      return rows.map(rowToProfile);
    },
    async getByUserId(userId: string): Promise<ChildProfile[]> {
      const rows = await getClient()
        .select()
        .from(schema.profiles)
        .where(eq(schema.profiles.userId, userId));
      return rows.map(rowToProfile);
    },
    async getById(id: string): Promise<ChildProfile | undefined> {
      const rows = await getClient()
        .select()
        .from(schema.profiles)
        .where(eq(schema.profiles.id, id));
      return rows[0] ? rowToProfile(rows[0]) : undefined;
    },
    async create(profile: ChildProfile): Promise<void> {
      await getClient().insert(schema.profiles).values(profileToRow(profile));
    },
    async update(
      id: string,
      updates: Partial<ChildProfile>
    ): Promise<ChildProfile | undefined> {
      const current = await this.getById(id);
      if (!current) return undefined;
      const next = { ...current, ...updates };
      await getClient()
        .update(schema.profiles)
        .set(profileToRow(next))
        .where(eq(schema.profiles.id, id));
      return next;
    },
    async delete(id: string): Promise<boolean> {
      const result = await getClient()
        .delete(schema.profiles)
        .where(eq(schema.profiles.id, id))
        .returning({ id: schema.profiles.id });
      return result.length > 0;
    },
  },

  stories: {
    async getAll(): Promise<Story[]> {
      const rows = await getClient().select().from(schema.stories);
      return rows.map(rowToStory);
    },
    async getByUserId(userId: string): Promise<Story[]> {
      const rows = await getClient()
        .select()
        .from(schema.stories)
        .where(eq(schema.stories.userId, userId));
      return rows.map(rowToStory);
    },
    async getById(id: string): Promise<Story | undefined> {
      const rows = await getClient()
        .select()
        .from(schema.stories)
        .where(eq(schema.stories.id, id));
      return rows[0] ? rowToStory(rows[0]) : undefined;
    },
    async getByProfileId(profileId: string): Promise<Story[]> {
      const rows = await getClient()
        .select()
        .from(schema.stories)
        .where(eq(schema.stories.profileId, profileId));
      return rows.map(rowToStory);
    },
    async getByShareToken(token: string): Promise<Story | undefined> {
      const rows = await getClient()
        .select()
        .from(schema.stories)
        .where(eq(schema.stories.shareToken, token));
      return rows[0] ? rowToStory(rows[0]) : undefined;
    },
    async create(story: Story): Promise<void> {
      await getClient().insert(schema.stories).values(storyToRow(story));
    },
    async update(
      id: string,
      updates: Partial<Story>
    ): Promise<Story | undefined> {
      const current = await this.getById(id);
      if (!current) return undefined;
      const next = { ...current, ...updates };
      await getClient()
        .update(schema.stories)
        .set(storyToRow(next))
        .where(eq(schema.stories.id, id));
      return next;
    },
    async setShareToken(id: string, token: string): Promise<void> {
      await getClient()
        .update(schema.stories)
        .set({ shareToken: token })
        .where(eq(schema.stories.id, id));
    },
    async delete(id: string): Promise<boolean> {
      const story = await this.getById(id);
      if (!story) return false;
      const books = await db.bookProjects.getByStoryId(id);
      await Promise.all(books.map((book) => db.bookProjects.delete(book.id)));
      await getClient()
        .delete(schema.stories)
        .where(eq(schema.stories.id, id));
      return true;
    },
  },

  characters: {
    async getAll(): Promise<Character[]> {
      const rows = await getClient().select().from(schema.characters);
      return rows.map(rowToCharacter);
    },
    async getByUserId(userId: string): Promise<Character[]> {
      const rows = await getClient()
        .select()
        .from(schema.characters)
        .where(eq(schema.characters.userId, userId));
      return rows.map(rowToCharacter);
    },
    async getByProfileId(profileId: string): Promise<Character[]> {
      const rows = await getClient()
        .select()
        .from(schema.characters)
        .where(eq(schema.characters.profileId, profileId));
      return rows.map(rowToCharacter);
    },
    async getById(id: string): Promise<Character | undefined> {
      const rows = await getClient()
        .select()
        .from(schema.characters)
        .where(eq(schema.characters.id, id));
      return rows[0] ? rowToCharacter(rows[0]) : undefined;
    },
    async create(character: Character): Promise<void> {
      await getClient().insert(schema.characters).values(characterToRow(character));
    },
    async update(
      id: string,
      updates: Partial<Character>
    ): Promise<Character | undefined> {
      const current = await this.getById(id);
      if (!current) return undefined;
      const next = { ...current, ...updates };
      await getClient()
        .update(schema.characters)
        .set(characterToRow(next))
        .where(eq(schema.characters.id, id));
      return next;
    },
    async delete(id: string): Promise<boolean> {
      const result = await getClient()
        .delete(schema.characters)
        .where(eq(schema.characters.id, id))
        .returning({ id: schema.characters.id });
      return result.length > 0;
    },
  },

  bookProjects: {
    async getById(id: string): Promise<BookProject | undefined> {
      const rows = await getClient()
        .select()
        .from(schema.bookProjects)
        .where(eq(schema.bookProjects.id, id));
      return rows[0] ? rowToBookProject(rows[0]) : undefined;
    },
    async getByStoryId(sourceStoryId: string): Promise<BookProject[]> {
      const rows = await getClient()
        .select()
        .from(schema.bookProjects)
        .where(eq(schema.bookProjects.sourceStoryId, sourceStoryId));
      return rows.map(rowToBookProject);
    },
    async getByUserId(userId: string): Promise<BookProject[]> {
      const rows = await getClient()
        .select()
        .from(schema.bookProjects)
        .where(eq(schema.bookProjects.userId, userId));
      return rows.map(rowToBookProject);
    },
    async create(project: BookProject): Promise<void> {
      await getClient()
        .insert(schema.bookProjects)
        .values(bookProjectToRow(project));
    },
    async replace(id: string, project: BookProject): Promise<void> {
      await getClient()
        .update(schema.bookProjects)
        .set(bookProjectToRow(project))
        .where(eq(schema.bookProjects.id, id));
    },
    async update(
      id: string,
      updates: Partial<BookProject>
    ): Promise<BookProject | undefined> {
      const current = await this.getById(id);
      if (!current) return undefined;
      const next: BookProject = {
        ...current,
        ...updates,
        updatedAt: updates.updatedAt ?? new Date().toISOString(),
      };
      await getClient()
        .update(schema.bookProjects)
        .set(bookProjectToRow(next))
        .where(eq(schema.bookProjects.id, id));
      return next;
    },
    async claimReadyEmail(
      id: string,
      sentAt: string
    ): Promise<BookProject | undefined> {
      // Atomic: only succeeds if book_ready_email_sent_at is currently NULL
      const claimed = await getClient()
        .update(schema.bookProjects)
        .set({ bookReadyEmailSentAt: sentAt })
        .where(
          and(
            eq(schema.bookProjects.id, id),
            isNull(schema.bookProjects.bookReadyEmailSentAt)
          )
        )
        .returning();
      if (claimed.length === 0) return undefined;

      // Mirror into assets.bookReadyEmailSentAt so callers see a consistent BookProject
      const base = rowToBookProject(claimed[0]);
      const next: BookProject = {
        ...base,
        assets: { ...base.assets, bookReadyEmailSentAt: sentAt },
      };
      await getClient()
        .update(schema.bookProjects)
        .set({ assets: next.assets })
        .where(eq(schema.bookProjects.id, id));
      return next;
    },
    async addToFailedIndex(_id: string): Promise<void> {
      // No-op: failed books are queried by status in getFailedIndex
    },
    async getFailedIndex(): Promise<string[]> {
      const rows = await getClient()
        .select({ id: schema.bookProjects.id })
        .from(schema.bookProjects)
        .where(eq(schema.bookProjects.status, "failed"))
        .orderBy(desc(schema.bookProjects.updatedAt))
        .limit(200);
      return rows.map((r) => r.id);
    },
    async delete(id: string): Promise<boolean> {
      const project = await this.getById(id);
      if (!project) return false;
      await deleteBookProjectAssets(project);
      await getClient()
        .delete(schema.bookBuildJobs)
        .where(eq(schema.bookBuildJobs.projectId, id));
      await getClient()
        .delete(schema.bookProjects)
        .where(eq(schema.bookProjects.id, id));
      return true;
    },
    async getPrintOrders(): Promise<
      {
        id: string;
        userId: string;
        sourceStoryId: string;
        printOrder: PrintBookOrder;
        updatedAt: string;
      }[]
    > {
      const rows = await getClient()
        .select({
          id: schema.bookProjects.id,
          userId: schema.bookProjects.userId,
          sourceStoryId: schema.bookProjects.sourceStoryId,
          printOrder: schema.bookProjects.printOrder,
          updatedAt: schema.bookProjects.updatedAt,
        })
        .from(schema.bookProjects)
        .where(isNotNull(schema.bookProjects.printOrder))
        .orderBy(desc(schema.bookProjects.updatedAt))
        .limit(100);
      return rows.map((r) => ({
        id: r.id,
        userId: r.userId,
        sourceStoryId: r.sourceStoryId,
        printOrder: r.printOrder as PrintBookOrder,
        updatedAt: r.updatedAt,
      }));
    },
  },

  bookBuildJobs: {
    async getById(id: string): Promise<BookBuildJob | undefined> {
      const rows = await getClient()
        .select()
        .from(schema.bookBuildJobs)
        .where(eq(schema.bookBuildJobs.id, id));
      return rows[0] ? rowToBookBuildJob(rows[0]) : undefined;
    },
    async getCurrentByProjectId(
      projectId: string
    ): Promise<BookBuildJob | undefined> {
      const rows = await getClient()
        .select()
        .from(schema.bookBuildJobs)
        .where(
          and(
            eq(schema.bookBuildJobs.projectId, projectId),
            inArray(schema.bookBuildJobs.status, ["queued", "running"])
          )
        )
        .orderBy(desc(schema.bookBuildJobs.createdAt))
        .limit(1);
      return rows[0] ? rowToBookBuildJob(rows[0]) : undefined;
    },
    async create(job: BookBuildJob): Promise<void> {
      await getClient()
        .insert(schema.bookBuildJobs)
        .values(bookBuildJobToRow(job));
    },
    async replace(id: string, job: BookBuildJob): Promise<void> {
      await getClient()
        .update(schema.bookBuildJobs)
        .set(bookBuildJobToRow(job))
        .where(eq(schema.bookBuildJobs.id, id));
    },
    async update(
      id: string,
      updates: Partial<BookBuildJob>
    ): Promise<BookBuildJob | undefined> {
      const current = await this.getById(id);
      if (!current) return undefined;
      const next: BookBuildJob = {
        ...current,
        ...updates,
        updatedAt: updates.updatedAt ?? new Date().toISOString(),
      };
      await getClient()
        .update(schema.bookBuildJobs)
        .set(bookBuildJobToRow(next))
        .where(eq(schema.bookBuildJobs.id, id));
      return next;
    },
  },
};
