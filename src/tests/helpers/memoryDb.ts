import type { ChildProfile, Story, Character } from "@/types";
import type {
  BookBuildJob,
  BookProject,
  PrintOrderRecord,
} from "@/types/printBook";

export function createMemoryDb() {
  const profileMap = new Map<string, ChildProfile>();
  const storyMap = new Map<string, Story>();
  const characterMap = new Map<string, Character>();
  const bookProjectMap = new Map<string, BookProject>();
  const bookBuildJobMap = new Map<string, BookBuildJob>();
  const printOrderMap = new Map<string, PrintOrderRecord>();
  const emailClaimSet = new Set<string>();

  const db = {
    _reset() {
      profileMap.clear();
      storyMap.clear();
      characterMap.clear();
      bookProjectMap.clear();
      bookBuildJobMap.clear();
      printOrderMap.clear();
      emailClaimSet.clear();
    },

    profiles: {
      async getAll(): Promise<ChildProfile[]> {
        return [...profileMap.values()];
      },
      async getByUserId(userId: string): Promise<ChildProfile[]> {
        return [...profileMap.values()].filter((p) => p.userId === userId);
      },
      async getById(id: string): Promise<ChildProfile | undefined> {
        return profileMap.get(id);
      },
      async create(profile: ChildProfile): Promise<void> {
        profileMap.set(profile.id, profile);
      },
      async update(
        id: string,
        updates: Partial<ChildProfile>
      ): Promise<ChildProfile | undefined> {
        const current = profileMap.get(id);
        if (!current) return undefined;
        const next = { ...current, ...updates };
        profileMap.set(id, next);
        return next;
      },
      async delete(id: string): Promise<boolean> {
        return profileMap.delete(id);
      },
    },

    stories: {
      async getAll(): Promise<Story[]> {
        return [...storyMap.values()];
      },
      async getByUserId(userId: string): Promise<Story[]> {
        return [...storyMap.values()].filter((s) => s.userId === userId);
      },
      async getById(id: string): Promise<Story | undefined> {
        return storyMap.get(id);
      },
      async getByProfileId(profileId: string): Promise<Story[]> {
        return [...storyMap.values()].filter((s) => s.profileId === profileId);
      },
      async getByShareToken(token: string): Promise<Story | undefined> {
        return [...storyMap.values()].find((s) => s.shareToken === token);
      },
      async create(story: Story): Promise<void> {
        storyMap.set(story.id, story);
      },
      async update(
        id: string,
        updates: Partial<Story>
      ): Promise<Story | undefined> {
        const current = storyMap.get(id);
        if (!current) return undefined;
        const next = { ...current, ...updates };
        storyMap.set(id, next);
        return next;
      },
      async setShareToken(id: string, token: string): Promise<void> {
        const current = storyMap.get(id);
        if (current) storyMap.set(id, { ...current, shareToken: token });
      },
      async delete(id: string): Promise<boolean> {
        if (!storyMap.has(id)) return false;
        const books = [...bookProjectMap.values()].filter(
          (b) => b.sourceStoryId === id
        );
        for (const book of books) {
          await db.bookProjects.delete(book.id);
        }
        return storyMap.delete(id);
      },
    },

    characters: {
      async getAll(): Promise<Character[]> {
        return [...characterMap.values()];
      },
      async getByUserId(userId: string): Promise<Character[]> {
        return [...characterMap.values()].filter((c) => c.userId === userId);
      },
      async getByProfileId(profileId: string): Promise<Character[]> {
        return [...characterMap.values()].filter(
          (c) => c.profileId === profileId
        );
      },
      async getById(id: string): Promise<Character | undefined> {
        return characterMap.get(id);
      },
      async create(character: Character): Promise<void> {
        characterMap.set(character.id, character);
      },
      async update(
        id: string,
        updates: Partial<Character>
      ): Promise<Character | undefined> {
        const current = characterMap.get(id);
        if (!current) return undefined;
        const next = { ...current, ...updates };
        characterMap.set(id, next);
        return next;
      },
      async delete(id: string): Promise<boolean> {
        return characterMap.delete(id);
      },
    },

    bookProjects: {
      async getById(id: string): Promise<BookProject | undefined> {
        return bookProjectMap.get(id);
      },
      async getByStoryId(sourceStoryId: string): Promise<BookProject[]> {
        return [...bookProjectMap.values()].filter(
          (p) => p.sourceStoryId === sourceStoryId
        );
      },
      async getByUserId(userId: string): Promise<BookProject[]> {
        return [...bookProjectMap.values()].filter((p) => p.userId === userId);
      },
      async create(project: BookProject): Promise<void> {
        bookProjectMap.set(project.id, project);
      },
      async replace(id: string, project: BookProject): Promise<void> {
        bookProjectMap.set(id, project);
      },
      async update(
        id: string,
        updates: Partial<BookProject>
      ): Promise<BookProject | undefined> {
        const current = bookProjectMap.get(id);
        if (!current) return undefined;
        const next: BookProject = {
          ...current,
          ...updates,
          updatedAt: updates.updatedAt ?? new Date().toISOString(),
        };
        bookProjectMap.set(id, next);
        return next;
      },
      async claimReadyEmail(
        id: string,
        sentAt: string
      ): Promise<BookProject | undefined> {
        if (emailClaimSet.has(id)) return undefined;
        emailClaimSet.add(id);
        const current = bookProjectMap.get(id);
        if (!current) return undefined;
        const next: BookProject = {
          ...current,
          assets: { ...current.assets, bookReadyEmailSentAt: sentAt },
        };
        bookProjectMap.set(id, next);
        return next;
      },
      async addToFailedIndex(_id: string): Promise<void> {},
      async getFailedIndex(): Promise<string[]> {
        return [...bookProjectMap.values()]
          .filter((p) => p.status === "failed")
          .sort(
            (a, b) =>
              new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
          )
          .slice(0, 200)
          .map((p) => p.id);
      },
      async delete(id: string): Promise<boolean> {
        if (!bookProjectMap.has(id)) return false;
        for (const [jobId, job] of bookBuildJobMap) {
          if (job.projectId === id) bookBuildJobMap.delete(jobId);
        }
        bookProjectMap.delete(id);
        return true;
      },
    },

    printOrders: {
      async getById(id: string): Promise<PrintOrderRecord | undefined> {
        return printOrderMap.get(id);
      },
      async getByCheckoutSessionId(
        checkoutSessionId: string
      ): Promise<PrintOrderRecord | undefined> {
        return [...printOrderMap.values()].find(
          (order) => order.checkoutSessionId === checkoutSessionId
        );
      },
      async getByProjectId(projectId: string): Promise<PrintOrderRecord[]> {
        return [...printOrderMap.values()]
          .filter((order) => order.projectId === projectId)
          .sort(
            (a, b) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
      },
      async getByStoryId(storyId: string): Promise<PrintOrderRecord[]> {
        return [...printOrderMap.values()]
          .filter((order) => order.storyId === storyId)
          .sort(
            (a, b) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
      },
      async getByOwnerUserId(ownerUserId: string): Promise<PrintOrderRecord[]> {
        return [...printOrderMap.values()]
          .filter((order) => order.ownerUserId === ownerUserId)
          .sort(
            (a, b) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          )
          .slice(0, 100);
      },
      async getByBuyerUserId(buyerUserId: string): Promise<PrintOrderRecord[]> {
        return [...printOrderMap.values()]
          .filter((order) => order.buyerUserId === buyerUserId)
          .sort(
            (a, b) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          )
          .slice(0, 100);
      },
      async listRecent(limit = 100): Promise<PrintOrderRecord[]> {
        return [...printOrderMap.values()]
          .sort(
            (a, b) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          )
          .slice(0, Math.min(limit, 500));
      },
      async create(order: PrintOrderRecord): Promise<void> {
        printOrderMap.set(order.id, order);
      },
      async update(
        id: string,
        updates: Partial<PrintOrderRecord>
      ): Promise<PrintOrderRecord | undefined> {
        const current = printOrderMap.get(id);
        if (!current) return undefined;
        const next: PrintOrderRecord = {
          ...current,
          ...updates,
          updatedAt: updates.updatedAt ?? new Date().toISOString(),
        };
        printOrderMap.set(id, next);
        return next;
      },
    },

    bookBuildJobs: {
      async getById(id: string): Promise<BookBuildJob | undefined> {
        return bookBuildJobMap.get(id);
      },
      async getCurrentByProjectId(
        projectId: string
      ): Promise<BookBuildJob | undefined> {
        return [...bookBuildJobMap.values()].find(
          (j) =>
            j.projectId === projectId &&
            (j.status === "queued" || j.status === "running")
        );
      },
      async create(job: BookBuildJob): Promise<void> {
        bookBuildJobMap.set(job.id, job);
      },
      async replace(id: string, job: BookBuildJob): Promise<void> {
        bookBuildJobMap.set(id, job);
      },
      async update(
        id: string,
        updates: Partial<BookBuildJob>
      ): Promise<BookBuildJob | undefined> {
        const current = bookBuildJobMap.get(id);
        if (!current) return undefined;
        const next: BookBuildJob = {
          ...current,
          ...updates,
          updatedAt: updates.updatedAt ?? new Date().toISOString(),
        };
        bookBuildJobMap.set(id, next);
        return next;
      },
    },
  };

  return db;
}
