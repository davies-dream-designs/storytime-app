import type { Story } from "@/types";
import type { StoryGameJson, StoryGameTile } from "./schema";
import { STORY_GAME_TILE } from "./schema";

const MAP_WIDTH = 20;
const MAP_HEIGHT = 15;

const PLAYER_START = { x: 2, y: 3 };
const GUIDE = { x: 10, y: 3 };
const HELPER = { x: 10, y: 7 };
const QUEST_ITEM = { x: 17, y: 13 };
const TREE_POSITIONS = new Set([
  "5,1",
  "2,2",
  "13,1",
  "1,5",
  "18,5",
  "5,7",
  "15,7",
  "2,9",
  "17,10",
  "2,12",
  "7,12",
  "13,12",
  "18,13",
]);

function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function sentenceFromPage(text: string, fallback: string): string {
  const normalized = cleanText(text);
  const firstSentence = normalized.match(/[^.!?]+[.!?]/)?.[0];
  return cleanText(firstSentence ?? normalized).slice(0, 180) || fallback;
}

function buildMap(): StoryGameTile[][] {
  return Array.from({ length: MAP_HEIGHT }, (_row, rowIndex) =>
    Array.from({ length: MAP_WIDTH }, (_col, colIndex): StoryGameTile => {
      const isBorder =
        rowIndex === 0 ||
        rowIndex === MAP_HEIGHT - 1 ||
        colIndex === 0 ||
        colIndex === MAP_WIDTH - 1;
      return isBorder ? STORY_GAME_TILE.wall : STORY_GAME_TILE.grass;
    })
  ).map((row, rowIndex) =>
    row.map((tile, colIndex): StoryGameTile => {
      return TREE_POSITIONS.has(`${colIndex},${rowIndex}`)
        ? STORY_GAME_TILE.tree
        : tile;
    })
  );
}

export function buildStoryGameJson(story: Story): StoryGameJson {
  const pages = story.pages.length > 0 ? story.pages : [];
  const leadPage = pages[0];
  const middlePage = pages[Math.floor(pages.length / 2)];
  const finalPage = pages[pages.length - 1];
  const childName = story.profileName || "Pip";
  const worldName = `${childName}'s Story World`;
  const questItemName = `${story.theme || "Story"} Spark`;

  return {
    title: story.title,
    world: {
      name: worldName,
      map: buildMap(),
    },
    player: {
      name: childName,
      startX: PLAYER_START.x,
      startY: PLAYER_START.y,
    },
    npcs: [
      {
        id: "guide",
        name: "Story Guide",
        x: GUIDE.x,
        y: GUIDE.y,
        color: 9127187,
        dialogue: [
          `Welcome, ${childName}.`,
          sentenceFromPage(
            leadPage?.text ?? "",
            "This story world needs a little help."
          ),
          `Can you find the ${questItemName} and bring its magic back?`,
        ],
      },
      {
        id: "helper",
        name: "Helpful Friend",
        x: HELPER.x,
        y: HELPER.y,
        color: 16738740,
        dialogue: [
          sentenceFromPage(
            middlePage?.text ?? "",
            "I saw something glowing near the far trees."
          ),
          "Try looking toward the south-east corner.",
        ],
      },
    ],
    items: [
      {
        id: "story-spark",
        name: questItemName,
        x: QUEST_ITEM.x,
        y: QUEST_ITEM.y,
        onCollect: `You found the ${questItemName}. It glows with the heart of ${story.title}.`,
      },
    ],
    quest: {
      objective: `Find the ${questItemName}`,
      completeTrigger: { type: "collect", itemId: "story-spark" },
      completeNpcId: "guide",
      returnObjective: "Talk to the Story Guide!",
      completeTitle: "Quest Complete",
      completeMessage: `${childName} brought the ${questItemName} home and finished ${story.title}.`,
      completeDialogue: [
        `You found it, ${childName}!`,
        sentenceFromPage(
          finalPage?.text ?? "",
          "The story world feels peaceful again."
        ),
        "This adventure is complete.",
      ],
    },
  };
}
