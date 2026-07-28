import { describe, expect, it } from "vitest";
import { buildStoryGameJson } from "@/lib/story-game/generator";
import { validateStoryGamePlan } from "@/lib/story-game/ai-planner";
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
    expect(game.world.style).toMatchObject({
      biome: "moon",
      groundColor: 0x586a8f,
      itemShape: "crystal",
    });
    expect(game.world.map).toHaveLength(15);
    expect(game.world.map[0]).toHaveLength(20);
    expect(game.player.name).toBe("Mila");
    expect(tileAt(game, game.player.startX, game.player.startY)).toBe(0);
    expect(game.npcs).toHaveLength(2);
    expect(game.npcs[0]?.name).toBe("Moon Keeper");
    expect(game.items[0]?.name).toBe("Moonbeam");
    expect(tileAt(game, game.items[0]!.x, game.items[0]!.y)).toBe(0);
    expect(game.quest.completeTrigger).toEqual({
      type: "collect",
      itemId: "story-spark",
    });
    expect(game.quest.completeNpcId).toBe("guide");
    expect(game.quest.completeMessage).toBe(
      "Mila returned the moonbeam and brought Mila and the Moon Kite safely home."
    );
  });

  it("uses story pages in clean guide, helper, and completion dialogue", () => {
    const game = buildStoryGameJson(story);

    expect(game.npcs[0]?.dialogue).toEqual([
      "Hi Mila. This place is built from your story, Mila and the Moon Kite.",
      'It begins here: "Mila found a silver kite beside the sleepy garden."',
      "Please find the moonbeam. It belongs in the heart of this story.",
    ]);
    expect(game.npcs[1]?.dialogue).toEqual([
      "I am looking for clues from Mila and the Moon Kite.",
      "I saw a soft glow beside the moonlit path.",
    ]);
    expect(game.quest.completeDialogue).toEqual([
      "You found the moonbeam, Mila.",
      'The story ends with this moment: "Mila tucked the moon kite safely home and smiled at the stars."',
      "The world feels complete again.",
    ]);
  });

  it("does not build awkward theme-prefixed item names", () => {
    const game = buildStoryGameJson(story);

    expect(game.items[0]?.name).not.toContain("Moon Courage");
    expect(game.quest.objective).toBe("Talk to the Moon Keeper");
    expect(game.quest.steps).toHaveLength(5);
    expect(game.items[0]?.onCollect).toBe("You found the moonbeam.");
    expect(game.quest.returnObjective).toBe(
      "Bring the moonbeam back to the Moon Keeper."
    );
  });

  it("varies the world, quest, actors, and map from story content", () => {
    const moonGame = buildStoryGameJson(story);
    const seaGame = buildStoryGameJson(seaStory);

    expect(seaGame.world.name).toBe("Noah's Tidepool Trail");
    expect(seaGame.world.style).toMatchObject({
      biome: "sea",
      groundColor: 0x5aa8a2,
      itemShape: "pearl",
    });
    expect(seaGame.npcs[0]?.name).toBe("Shell Guide");
    expect(seaGame.npcs[1]?.name).toBe("Harbour Helper");
    expect(seaGame.items[0]?.name).toBe("Pearl");
    expect(seaGame.quest.objective).toBe("Talk to the Shell Guide");
    expect(seaGame.quest.steps).toHaveLength(5);
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

  it("builds a longer multi-step game from a validated AI plan", () => {
    const plan = validateStoryGamePlan({
      biome: "sea",
      worldName: "Noah's Pearl Harbour",
      guideName: "Shell Guide",
      helperName: "Reef Friend",
      itemNames: ["Blue Sail", "Pearl", "Harbour Bell"],
      npcDialogue: {
        guide: ["The harbour needs your help."],
        helper: ["I saw a clue beside the reef."],
      },
      questSteps: [
        {
          type: "talk",
          objective: "Talk to the Shell Guide",
          npc: "guide",
          dialogue: ["The boat is missing its blue sail."],
        },
        {
          type: "collect",
          objective: "Find the blue sail",
          itemName: "Blue Sail",
          onComplete: "You found the blue sail.",
        },
        {
          type: "talk",
          objective: "Ask Reef Friend about the pearl",
          npc: "helper",
          dialogue: ["The pearl rolled near the tidepool."],
        },
        {
          type: "collect",
          objective: "Find the pearl",
          itemName: "Pearl",
          onComplete: "You found the pearl.",
        },
        {
          type: "collect",
          objective: "Ring the harbour bell",
          itemName: "Harbour Bell",
          onComplete: "The harbour bell rings softly.",
        },
      ],
      completeTitle: "Harbour Restored",
      completeMessage: "Noah helped the harbour glow again.",
      completeDialogue: ["The story feels calm again."],
    });

    const game = buildStoryGameJson(seaStory, plan);

    expect(game.world.name).toBe("Noah's Pearl Harbour");
    expect(game.npcs[0]?.name).toBe("Shell Guide");
    expect(game.npcs[0]?.roamRadius).toBe(2);
    expect(game.items.map((item) => item.name)).toEqual([
      "Blue Sail",
      "Pearl",
      "Harbour Bell",
    ]);
    expect(game.quest.steps).toHaveLength(5);
    expect(game.quest.steps?.[0]).toMatchObject({
      type: "talk",
      objective: "Talk to the Shell Guide",
      npcId: "guide",
    });
    expect(game.quest.steps?.[1]).toMatchObject({
      type: "collect",
      objective: "Find the blue sail",
      itemId: "story-spark",
    });
    expect(game.quest.completeTitle).toBe("Harbour Restored");
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
