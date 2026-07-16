import { beforeEach, describe, expect, it, vi } from "vitest";

const { store } = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
}));

vi.mock("@vercel/kv", () => ({
  kv: {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: unknown) => {
      store.set(key, value);
    }),
    del: vi.fn(async (key: string) => {
      store.delete(key);
    }),
  },
}));

describe("db delete cascades", () => {
  beforeEach(() => {
    vi.resetModules();
    store.clear();
  });

  it("deleting a story also removes its book projects and indexes", async () => {
    const { db } = await import("@/lib/db");
    store.set("stories", [
      {
        id: "story-1",
        userId: "user-1",
        shareToken: "share-1",
      },
    ]);
    store.set("share:share-1", "story-1");
    store.set("bookProjectByStory:story-1", ["book-1"]);
    store.set("bookProjectByUser:user-1", ["book-1"]);
    store.set("bookProject:book-1", {
      id: "book-1",
      userId: "user-1",
      sourceStoryId: "story-1",
    });

    await expect(db.stories.delete("story-1")).resolves.toBe(true);

    expect(store.get("stories")).toEqual([]);
    expect(store.has("share:share-1")).toBe(false);
    expect(store.has("bookProject:book-1")).toBe(false);
    expect(store.has("bookProjectByStory:story-1")).toBe(false);
    expect(store.has("bookProjectByUser:user-1")).toBe(false);
  });
});
