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

const seaStory: Story = {
  ...story,
  id: "story-2",
  title: "Noah and the Little Blue Boat",
  profileName: "Noah",
  theme: "ocean kindness",
  pages: [
    {
      pageNumber: 1,
      text: "Noah sailed a little blue boat across a quiet ocean.",
      illustrationPrompt: "Noah in a boat",
    },
    {
      pageNumber: 2,
      text: "A silver fish showed Noah a shell path beside the reef.",
      illustrationPrompt: "Fish and shell path",
    },
    {
      pageNumber: 3,
      text: "Noah returned the bright pearl and the harbour sang softly.",
      illustrationPrompt: "Pearl at harbour",
    },
  ],
};

function tileAt(
  game: ReturnType<typeof buildStoryGameJson>,
  x: number,
  y: number
) {
  return game.world.map[y]?.[x];
}

describe("buildStoryGameJson", () => {
  it("builds a playable story game JSON object from an existing story", () => {
    const game = buildStoryGameJson(story);

    expect(game.title).toBe("Mila and the Moon Kite");
    expect(game.world.name).toBe("Mila's Moonlit Glade");
    expect(game.world.map).toHaveLength(15);
    expect(game.world.map[0]).toHaveLength(20);
    expect(game.player.name).toBe("Mila");
    expect(tileAt(game, game.player.startX, game.player.startY)).toBe(0);
    expect(game.npcs).toHaveLength(2);
    expect(game.npcs[0]?.name).toBe("Moon Keeper");
    expect(game.items[0]?.name).toBe("Moon Courage Moonbeam");
    expect(tileAt(game, game.items[0]!.x, game.items[0]!.y)).toBe(0);
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

  it("varies the world, quest, actors, and map from story content", () => {
    const moonGame = buildStoryGameJson(story);
    const seaGame = buildStoryGameJson(seaStory);

    expect(seaGame.world.name).toBe("Noah's Tidepool Trail");
    expect(seaGame.npcs[0]?.name).toBe("Shell Guide");
    expect(seaGame.npcs[1]?.name).toBe("Harbour Helper");
    expect(seaGame.items[0]?.name).toBe("Ocean Kindness Pearl");
    expect(seaGame.quest.objective).toBe("Find the Ocean Kindness Pearl");
    expect(seaGame.world.map).not.toEqual(moonGame.world.map);
    expect(seaGame.player).not.toEqual(moonGame.player);
    expect({
      x: seaGame.items[0]?.x,
      y: seaGame.items[0]?.y,
    }).not.toEqual({
      x: moonGame.items[0]?.x,
      y: moonGame.items[0]?.y,
    });
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
