import { describe, expect, it } from "vitest";
import { buildStoryGameJson } from "@/lib/story-game/generator";
import { buildStoryGamePlayUrl } from "@/lib/story-game/play-url";
import type { Story } from "@/types";

const story: Story = {
  id: "story-1",
  userId: "user-1",
  title: "Mila and the Moon Kite",
  profileId: "profile-1",
  profileName: "Mila",
  pages: [
    {
      pageNumber: 1,
      text: "Mila found a silver kite beside the sleepy garden. It hummed softly.",
      illustrationPrompt: "Mila in a garden",
    },
    {
      pageNumber: 2,
      text: "A friendly lantern showed Mila a path between the moonflowers.",
      illustrationPrompt: "Lantern path",
    },
    {
      pageNumber: 3,
      text: "Mila tucked the moon kite safely home and smiled at the stars.",
      illustrationPrompt: "Kite home",
    },
  ],
  wordCount: 30,
  theme: "moon courage",
  notes: "",
  createdAt: "2026-07-28T00:00:00.000Z",
  status: "ready",
};

describe("buildStoryGameJson", () => {
  it("builds a playable story game JSON object from an existing story", () => {
    const game = buildStoryGameJson(story);

    expect(game.title).toBe("Mila and the Moon Kite");
    expect(game.world.name).toBe("Mila's Story World");
    expect(game.world.map).toHaveLength(15);
    expect(game.world.map[0]).toHaveLength(20);
    expect(game.player).toEqual({ name: "Mila", startX: 2, startY: 3 });
    expect(game.npcs).toHaveLength(2);
    expect(game.items).toEqual([
      {
        id: "story-spark",
        name: "moon courage Spark",
        x: 17,
        y: 13,
        onCollect:
          "You found the moon courage Spark. It glows with the heart of Mila and the Moon Kite.",
      },
    ]);
    expect(game.quest.completeTrigger).toEqual({
      type: "collect",
      itemId: "story-spark",
    });
    expect(game.quest.completeNpcId).toBe("guide");
    expect(game.quest.completeMessage).toContain("Mila brought");
  });

  it("uses story pages for guide, helper, and completion dialogue", () => {
    const game = buildStoryGameJson(story);

    expect(game.npcs[0]?.dialogue).toContain(
      "Mila found a silver kite beside the sleepy garden."
    );
    expect(game.npcs[1]?.dialogue).toContain(
      "A friendly lantern showed Mila a path between the moonflowers."
    );
    expect(game.quest.completeDialogue).toContain(
      "Mila tucked the moon kite safely home and smiled at the stars."
    );
  });

  it("builds a game engine URL with an inline story payload", async () => {
    const game = buildStoryGameJson(story);
    const playUrl = buildStoryGamePlayUrl({
      engineUrl: "https://game.example/play/",
      game,
    });

    const url = new URL(playUrl);
    const storyParam = url.searchParams.get("story");
    expect(url.origin).toBe("https://game.example");
    expect(storyParam).toMatch(/^data:application\/json;charset=utf-8,/);
    expect(await fetch(storyParam as string).then((res) => res.json())).toEqual(
      game
    );
  });
});
