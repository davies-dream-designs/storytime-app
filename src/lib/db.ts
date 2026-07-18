import { kv } from "@vercel/kv";
import type { ChildProfile, Story, Character } from "@/types";
import type { BookBuildJob, BookProject } from "@/types/printBook";
import { deleteBookProjectAssets } from "@/lib/print-books/storage";

export const db = {
  profiles: {
    async getAll(): Promise<ChildProfile[]> {
      return (await kv.get<ChildProfile[]>("profiles")) ?? [];
    },
    async getByUserId(userId: string): Promise<ChildProfile[]> {
      return (await this.getAll()).filter((p) => p.userId === userId);
    },
    async getById(id: string): Promise<ChildProfile | undefined> {
      return (await this.getAll()).find((p) => p.id === id);
    },
    async create(profile: ChildProfile): Promise<void> {
      const all = await this.getAll();
      all.push(profile);
      await kv.set("profiles", all);
    },
    async update(
      id: string,
      updates: Partial<ChildProfile>
    ): Promise<ChildProfile | undefined> {
      const all = await this.getAll();
      const idx = all.findIndex((p) => p.id === id);
      if (idx === -1) return undefined;
      all[idx] = { ...all[idx], ...updates };
      await kv.set("profiles", all);
      return all[idx];
    },
    async delete(id: string): Promise<boolean> {
      const all = await this.getAll();
      const filtered = all.filter((p) => p.id !== id);
      if (filtered.length === all.length) return false;
      await kv.set("profiles", filtered);
      return true;
    },
  },

  stories: {
    async getAll(): Promise<Story[]> {
      return (await kv.get<Story[]>("stories")) ?? [];
    },
    async getByUserId(userId: string): Promise<Story[]> {
      return (await this.getAll()).filter((s) => s.userId === userId);
    },
    async getById(id: string): Promise<Story | undefined> {
      return (await this.getAll()).find((s) => s.id === id);
    },
    async getByProfileId(profileId: string): Promise<Story[]> {
      return (await this.getAll()).filter((s) => s.profileId === profileId);
    },
    async getByShareToken(token: string): Promise<Story | undefined> {
      const storyId = await kv.get<string>(`share:${token}`);
      if (!storyId) return undefined;
      return this.getById(storyId);
    },
    async create(story: Story): Promise<void> {
      const all = await this.getAll();
      all.push(story);
      await kv.set("stories", all);
    },
    async update(
      id: string,
      updates: Partial<Story>
    ): Promise<Story | undefined> {
      const all = await this.getAll();
      const idx = all.findIndex((s) => s.id === id);
      if (idx === -1) return undefined;
      all[idx] = { ...all[idx], ...updates };
      await kv.set("stories", all);
      return all[idx];
    },
    async setShareToken(id: string, token: string): Promise<void> {
      const all = await this.getAll();
      const idx = all.findIndex((s) => s.id === id);
      if (idx === -1) return;
      all[idx] = { ...all[idx], shareToken: token };
      await Promise.all([kv.set("stories", all), kv.set(`share:${token}`, id)]);
    },
    async delete(id: string): Promise<boolean> {
      const all = await this.getAll();
      const story = all.find((s) => s.id === id);
      const filtered = all.filter((s) => s.id !== id);
      if (filtered.length === all.length) return false;
      const books = await db.bookProjects.getByStoryId(id);
      const ops: Promise<unknown>[] = [
        kv.set("stories", filtered),
        ...books.map((book) => db.bookProjects.delete(book.id)),
      ];
      if (story?.shareToken) ops.push(kv.del(`share:${story.shareToken}`));
      await Promise.all(ops);
      return true;
    },
  },

  characters: {
    async getAll(): Promise<Character[]> {
      return (await kv.get<Character[]>("characters")) ?? [];
    },
    async getByUserId(userId: string): Promise<Character[]> {
      return (await this.getAll()).filter((c) => c.userId === userId);
    },
    async getByProfileId(profileId: string): Promise<Character[]> {
      return (await this.getAll()).filter((c) => c.profileId === profileId);
    },
    async getById(id: string): Promise<Character | undefined> {
      return (await this.getAll()).find((c) => c.id === id);
    },
    async create(character: Character): Promise<void> {
      const all = await this.getAll();
      all.push(character);
      await kv.set("characters", all);
    },
    async update(
      id: string,
      updates: Partial<Character>
    ): Promise<Character | undefined> {
      const all = await this.getAll();
      const idx = all.findIndex((c) => c.id === id);
      if (idx === -1) return undefined;
      all[idx] = { ...all[idx], ...updates };
      await kv.set("characters", all);
      return all[idx];
    },
    async delete(id: string): Promise<boolean> {
      const all = await this.getAll();
      const filtered = all.filter((c) => c.id !== id);
      if (filtered.length === all.length) return false;
      await kv.set("characters", filtered);
      return true;
    },
  },

  bookProjects: {
    projectKey(id: string): string {
      return `bookProject:${id}`;
    },
    storyIndexKey(sourceStoryId: string): string {
      return `bookProjectByStory:${sourceStoryId}`;
    },
    userIndexKey(userId: string): string {
      return `bookProjectByUser:${userId}`;
    },
    async getById(id: string): Promise<BookProject | undefined> {
      return (await kv.get<BookProject>(this.projectKey(id))) ?? undefined;
    },
    async getByStoryId(sourceStoryId: string): Promise<BookProject[]> {
      const ids =
        (await kv.get<string[]>(this.storyIndexKey(sourceStoryId))) ?? [];
      const projects = await Promise.all(ids.map((id) => this.getById(id)));
      return projects.filter((project): project is BookProject =>
        Boolean(project)
      );
    },
    async getByUserId(userId: string): Promise<BookProject[]> {
      const ids = (await kv.get<string[]>(this.userIndexKey(userId))) ?? [];
      const projects = await Promise.all(ids.map((id) => this.getById(id)));
      return projects.filter((project): project is BookProject =>
        Boolean(project)
      );
    },
    async create(project: BookProject): Promise<void> {
      const [storyIds, userIds] = await Promise.all([
        kv.get<string[]>(this.storyIndexKey(project.sourceStoryId)),
        kv.get<string[]>(this.userIndexKey(project.userId)),
      ]);

      const nextStoryIds = Array.from(
        new Set([...(storyIds ?? []), project.id])
      );
      const nextUserIds = Array.from(new Set([...(userIds ?? []), project.id]));

      await Promise.all([
        kv.set(this.projectKey(project.id), project),
        kv.set(this.storyIndexKey(project.sourceStoryId), nextStoryIds),
        kv.set(this.userIndexKey(project.userId), nextUserIds),
      ]);
    },
    async replace(id: string, project: BookProject): Promise<void> {
      await kv.set(this.projectKey(id), project);
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

      await this.replace(id, next);
      return next;
    },
    failedIndexKey(): string {
      return "bookProjectsFailed";
    },
    async addToFailedIndex(id: string): Promise<void> {
      const existing = (await kv.get<string[]>(this.failedIndexKey())) ?? [];
      const next = [id, ...existing.filter((i) => i !== id)].slice(0, 200);
      await kv.set(this.failedIndexKey(), next);
    },
    async getFailedIndex(): Promise<string[]> {
      return (await kv.get<string[]>(this.failedIndexKey())) ?? [];
    },
    async delete(id: string): Promise<boolean> {
      const project = await this.getById(id);
      if (!project) return false;
      await deleteBookProjectAssets(project);

      const [storyIds, userIds, currentJob] = await Promise.all([
        kv.get<string[]>(this.storyIndexKey(project.sourceStoryId)),
        kv.get<string[]>(this.userIndexKey(project.userId)),
        db.bookBuildJobs.getCurrentByProjectId(id),
      ]);

      const nextStoryIds = (storyIds ?? []).filter(
        (projectId) => projectId !== id
      );
      const nextUserIds = (userIds ?? []).filter(
        (projectId) => projectId !== id
      );

      const ops: Promise<unknown>[] = [
        kv.del(this.projectKey(id)),
        nextStoryIds.length > 0
          ? kv.set(this.storyIndexKey(project.sourceStoryId), nextStoryIds)
          : kv.del(this.storyIndexKey(project.sourceStoryId)),
        nextUserIds.length > 0
          ? kv.set(this.userIndexKey(project.userId), nextUserIds)
          : kv.del(this.userIndexKey(project.userId)),
        kv.del(db.bookBuildJobs.projectIndexKey(id)),
      ];

      if (currentJob) {
        ops.push(kv.del(db.bookBuildJobs.jobKey(currentJob.id)));
      }

      await Promise.all(ops);
      return true;
    },
  },

  bookBuildJobs: {
    jobKey(id: string): string {
      return `bookBuildJob:${id}`;
    },
    projectIndexKey(projectId: string): string {
      return `bookBuildJobByProject:${projectId}`;
    },
    async getById(id: string): Promise<BookBuildJob | undefined> {
      return (await kv.get<BookBuildJob>(this.jobKey(id))) ?? undefined;
    },
    async getCurrentByProjectId(
      projectId: string
    ): Promise<BookBuildJob | undefined> {
      const jobId = await kv.get<string>(this.projectIndexKey(projectId));
      if (!jobId) return undefined;
      const job = await this.getById(jobId);
      if (!job) {
        await kv.del(this.projectIndexKey(projectId));
        return undefined;
      }
      return job;
    },
    async create(job: BookBuildJob): Promise<void> {
      await Promise.all([
        kv.set(this.jobKey(job.id), job),
        kv.set(this.projectIndexKey(job.projectId), job.id),
      ]);
    },
    async replace(id: string, job: BookBuildJob): Promise<void> {
      await kv.set(this.jobKey(id), job);
      if (job.status === "queued" || job.status === "running") {
        await kv.set(this.projectIndexKey(job.projectId), job.id);
      }
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

      await this.replace(id, next);

      if (next.status === "completed" || next.status === "failed") {
        const indexedJobId = await kv.get<string>(
          this.projectIndexKey(next.projectId)
        );
        if (indexedJobId === id) {
          await kv.del(this.projectIndexKey(next.projectId));
        }
      }

      return next;
    },
  },
};
