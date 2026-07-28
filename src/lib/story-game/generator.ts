import type { Story } from "@/types";
import type { StoryGameJson, StoryGameTile } from "./schema";
import { STORY_GAME_TILE } from "./schema";

const MAP_WIDTH = 20;
const MAP_HEIGHT = 15;

type Point = { x: number; y: number };

type StoryGameBiome = {
  key: string;
  worldSuffix: string;
  guideName: string;
  helperName: string;
  itemName: string;
  searchHint: string;
  returnHint: string;
  colors: {
    guide: number;
    helper: number;
  };
  style: NonNullable<StoryGameJson["world"]["style"]>;
  patterns: Point[][];
};

const PLAYER_STARTS: Point[] = [
  { x: 2, y: 3 },
  { x: 3, y: 11 },
  { x: 16, y: 3 },
  { x: 4, y: 7 },
];

const GUIDE_SPOTS: Point[] = [
  { x: 9, y: 3 },
  { x: 5, y: 5 },
  { x: 14, y: 4 },
  { x: 8, y: 10 },
];

const HELPER_SPOTS: Point[] = [
  { x: 12, y: 8 },
  { x: 15, y: 10 },
  { x: 6, y: 9 },
  { x: 13, y: 6 },
];

const ITEM_SPOTS: Point[] = [
  { x: 17, y: 12 },
  { x: 16, y: 2 },
  { x: 3, y: 12 },
  { x: 15, y: 11 },
];

const BIOMES: StoryGameBiome[] = [
  {
    key: "moon",
    worldSuffix: "Moonlit Glade",
    guideName: "Moon Keeper",
    helperName: "Lantern Friend",
    itemName: "Moonbeam",
    searchHint: "I saw a soft glow beside the moonlit path.",
    returnHint: "Bring the moonbeam back to the Moon Keeper.",
    colors: { guide: 0x6d5bd0, helper: 0xffc857 },
    style: {
      biome: "moon",
      groundColor: 0x586a8f,
      skyColor: 0x22345f,
      fogColor: 0x22345f,
      wallColor: 0x6c6f93,
      trunkColor: 0x41304f,
      foliageColors: [0x324b75, 0x4b5f96, 0x697bbb],
      itemColor: 0xf8f0a8,
      itemGlowColor: 0xc8d8ff,
      itemShape: "crystal",
    },
    patterns: [
      [
        { x: 5, y: 1 },
        { x: 12, y: 2 },
        { x: 16, y: 4 },
        { x: 4, y: 6 },
        { x: 11, y: 7 },
        { x: 17, y: 9 },
        { x: 6, y: 11 },
        { x: 13, y: 12 },
      ],
      [
        { x: 3, y: 2 },
        { x: 8, y: 2 },
        { x: 14, y: 3 },
        { x: 6, y: 6 },
        { x: 15, y: 7 },
        { x: 4, y: 10 },
        { x: 10, y: 11 },
        { x: 17, y: 12 },
      ],
    ],
  },
  {
    key: "sea",
    worldSuffix: "Tidepool Trail",
    guideName: "Shell Guide",
    helperName: "Harbour Helper",
    itemName: "Pearl",
    searchHint: "The pearl is near the quiet edge of the tidepool trail.",
    returnHint: "Bring the pearl back to the Shell Guide.",
    colors: { guide: 0x168aad, helper: 0xff9f1c },
    style: {
      biome: "sea",
      groundColor: 0x5aa8a2,
      skyColor: 0x8ed1e6,
      fogColor: 0x8ed1e6,
      wallColor: 0xb49763,
      trunkColor: 0x7a5a36,
      foliageColors: [0x2f8f83, 0x46b3a6, 0x78d1c6],
      itemColor: 0xfaf6e8,
      itemGlowColor: 0x84f1ff,
      itemShape: "pearl",
    },
    patterns: [
      [
        { x: 4, y: 2 },
        { x: 9, y: 2 },
        { x: 15, y: 3 },
        { x: 3, y: 6 },
        { x: 8, y: 7 },
        { x: 14, y: 8 },
        { x: 5, y: 11 },
        { x: 16, y: 12 },
      ],
      [
        { x: 6, y: 1 },
        { x: 13, y: 2 },
        { x: 17, y: 5 },
        { x: 5, y: 6 },
        { x: 11, y: 8 },
        { x: 3, y: 10 },
        { x: 9, y: 12 },
        { x: 15, y: 13 },
      ],
    ],
  },
  {
    key: "forest",
    worldSuffix: "Whispering Woods",
    guideName: "Old Oak",
    helperName: "Mossy Friend",
    itemName: "Acorn Charm",
    searchHint: "The acorn charm rests where the trees open into a path.",
    returnHint: "Bring the charm back to Old Oak.",
    colors: { guide: 0x7a4f2a, helper: 0x4caf50 },
    style: {
      biome: "forest",
      groundColor: 0x5f9b5f,
      skyColor: 0x9ec8e8,
      fogColor: 0x9ec8e8,
      wallColor: 0x7a6640,
      trunkColor: 0x6b4226,
      foliageColors: [0x2d6e1a, 0x228b22, 0x34a821],
      itemColor: 0xffd166,
      itemGlowColor: 0xffaa00,
      itemShape: "charm",
    },
    patterns: [
      [
        { x: 2, y: 2 },
        { x: 5, y: 2 },
        { x: 12, y: 2 },
        { x: 17, y: 3 },
        { x: 4, y: 5 },
        { x: 15, y: 6 },
        { x: 7, y: 8 },
        { x: 12, y: 9 },
        { x: 3, y: 12 },
        { x: 9, y: 12 },
        { x: 16, y: 12 },
      ],
      [
        { x: 4, y: 1 },
        { x: 10, y: 2 },
        { x: 15, y: 2 },
        { x: 2, y: 5 },
        { x: 7, y: 6 },
        { x: 13, y: 6 },
        { x: 17, y: 8 },
        { x: 5, y: 10 },
        { x: 11, y: 11 },
        { x: 15, y: 13 },
      ],
    ],
  },
  {
    key: "sky",
    worldSuffix: "Cloud Path",
    guideName: "Star Pilot",
    helperName: "Cloud Friend",
    itemName: "Sky Crystal",
    searchHint: "The sky crystal sparkles near the highest clearing.",
    returnHint: "Bring the crystal back to the Star Pilot.",
    colors: { guide: 0x3a86ff, helper: 0xff70a6 },
    style: {
      biome: "sky",
      groundColor: 0x9bb9e8,
      skyColor: 0xc7e8ff,
      fogColor: 0xc7e8ff,
      wallColor: 0xddd7ff,
      trunkColor: 0x7c6fa8,
      foliageColors: [0xbfd7ff, 0xa9c5ff, 0xd6e4ff],
      itemColor: 0x95f2ff,
      itemGlowColor: 0xffffff,
      itemShape: "crystal",
    },
    patterns: [
      [
        { x: 6, y: 2 },
        { x: 12, y: 3 },
        { x: 17, y: 4 },
        { x: 3, y: 5 },
        { x: 9, y: 6 },
        { x: 15, y: 8 },
        { x: 5, y: 10 },
        { x: 11, y: 12 },
      ],
      [
        { x: 3, y: 3 },
        { x: 8, y: 1 },
        { x: 14, y: 2 },
        { x: 17, y: 6 },
        { x: 6, y: 7 },
        { x: 12, y: 8 },
        { x: 4, y: 11 },
        { x: 15, y: 12 },
      ],
    ],
  },
];

const FALLBACK_BIOME = BIOMES[2] as StoryGameBiome;

function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function sentenceFromPage(text: string, fallback: string): string {
  const normalized = cleanText(text);
  const firstSentence = normalized.match(/[^.!?]+[.!?]/)?.[0];
  return cleanText(firstSentence ?? normalized).slice(0, 180) || fallback;
}

function stripTrailingPunctuation(value: string): string {
  return cleanText(value).replace(/[.!?]+$/, "");
}

function hashText(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function keywordScore(value: string, words: string[]): number {
  return words.reduce((score, word) => {
    return value.includes(word) ? score + 1 : score;
  }, 0);
}

function pickBiome(story: Story): StoryGameBiome {
  const text = cleanText(
    `${story.title} ${story.theme} ${story.notes ?? ""} ${story.pages
      .map((page) => page.text)
      .join(" ")}`
  ).toLowerCase();

  const scores = [
    {
      biome: BIOMES[0] ?? FALLBACK_BIOME,
      score: keywordScore(text, [
        "moon",
        "star",
        "night",
        "dream",
        "glow",
        "lantern",
        "silver",
      ]),
    },
    {
      biome: BIOMES[1] ?? FALLBACK_BIOME,
      score: keywordScore(text, [
        "sea",
        "ocean",
        "river",
        "boat",
        "fish",
        "shell",
        "wave",
        "water",
      ]),
    },
    {
      biome: BIOMES[3] ?? FALLBACK_BIOME,
      score: keywordScore(text, [
        "sky",
        "cloud",
        "kite",
        "bird",
        "wind",
        "fly",
        "rainbow",
      ]),
    },
  ];

  const best = scores.reduce((currentBest, candidate) => {
    return candidate.score > currentBest.score ? candidate : currentBest;
  });

  return best.score > 0 ? best.biome : FALLBACK_BIOME;
}

function pointKey(point: Point): string {
  return `${point.x},${point.y}`;
}

function shiftPoint(point: Point, seed: number): Point {
  const dx = (seed % 3) - 1;
  const dy = (Math.floor(seed / 3) % 3) - 1;
  return {
    x: Math.min(MAP_WIDTH - 2, Math.max(1, point.x + dx)),
    y: Math.min(MAP_HEIGHT - 2, Math.max(1, point.y + dy)),
  };
}

function buildMap({
  biome,
  seed,
  reserved,
}: {
  biome: StoryGameBiome;
  seed: number;
  reserved: Set<string>;
}): StoryGameTile[][] {
  const map = Array.from({ length: MAP_HEIGHT }, (_row, rowIndex) =>
    Array.from({ length: MAP_WIDTH }, (_col, colIndex): StoryGameTile => {
      const isBorder =
        rowIndex === 0 ||
        rowIndex === MAP_HEIGHT - 1 ||
        colIndex === 0 ||
        colIndex === MAP_WIDTH - 1;
      return isBorder ? STORY_GAME_TILE.wall : STORY_GAME_TILE.grass;
    })
  );

  const pattern = biome.patterns[seed % biome.patterns.length] ?? [];
  pattern.forEach((point, index) => {
    const shifted = shiftPoint(point, seed + index);
    if (!reserved.has(pointKey(shifted))) {
      map[shifted.y]![shifted.x] = STORY_GAME_TILE.tree;
    }
  });

  return map;
}

function pickPoint(points: Point[], seed: number): Point {
  return points[seed % points.length] ?? points[0] ?? { x: 1, y: 1 };
}

function itemNameForStory(_story: Story, biome: StoryGameBiome): string {
  return biome.itemName;
}

function lowerFirst(value: string): string {
  const cleaned = cleanText(value);
  return `${cleaned.charAt(0).toLowerCase()}${cleaned.slice(1)}`;
}

export function buildStoryGameJson(story: Story): StoryGameJson {
  const pages = story.pages.length > 0 ? story.pages : [];
  const leadPage = pages[0];
  const finalPage = pages[pages.length - 1];
  const childName = story.profileName || "Pip";
  const leadSentence = sentenceFromPage(
    leadPage?.text ?? "",
    `${childName}'s adventure has just begun.`
  );
  const finalSentence = sentenceFromPage(
    finalPage?.text ?? "",
    `${childName}'s story ended gently and happily.`
  );
  const seed = hashText(
    `${story.id}:${story.title}:${story.theme}:${pages
      .map((page) => page.text)
      .join("|")}`
  );
  const biome = pickBiome(story);
  const biomeOffset = Math.max(
    0,
    BIOMES.findIndex((item) => item === biome)
  );
  const placementOffset = biomeOffset * 2;
  const playerStart = pickPoint(PLAYER_STARTS, seed + placementOffset);
  const guide = pickPoint(GUIDE_SPOTS, (seed >> 2) + placementOffset);
  const helper = pickPoint(HELPER_SPOTS, (seed >> 4) + placementOffset);
  const questItemBase = pickPoint(ITEM_SPOTS, (seed >> 6) + placementOffset);
  const questItem = {
    x: Math.min(MAP_WIDTH - 2, Math.max(1, questItemBase.x - biomeOffset)),
    y: Math.min(MAP_HEIGHT - 2, Math.max(1, questItemBase.y + biomeOffset)),
  };
  const reserved = new Set([
    pointKey(playerStart),
    pointKey(guide),
    pointKey(helper),
    pointKey(questItem),
  ]);
  const worldName = `${childName}'s ${biome.worldSuffix}`;
  const questItemName = itemNameForStory(story, biome);
  const questItemLower = lowerFirst(questItemName);

  return {
    title: story.title,
    world: {
      name: worldName,
      map: buildMap({ biome, seed, reserved }),
      style: biome.style,
    },
    player: {
      name: childName,
      startX: playerStart.x,
      startY: playerStart.y,
    },
    npcs: [
      {
        id: "guide",
        name: biome.guideName,
        x: guide.x,
        y: guide.y,
        color: biome.colors.guide,
        dialogue: [
          `Hi ${childName}. This place is built from your story, ${story.title}.`,
          `It begins here: "${stripTrailingPunctuation(leadSentence)}."`,
          `Please find the ${questItemLower}. It belongs in the heart of this story.`,
        ],
      },
      {
        id: "helper",
        name: biome.helperName,
        x: helper.x,
        y: helper.y,
        color: biome.colors.helper,
        dialogue: [
          `I am looking for clues from ${story.title}.`,
          biome.searchHint,
        ],
      },
    ],
    items: [
      {
        id: "story-spark",
        name: questItemName,
        x: questItem.x,
        y: questItem.y,
        onCollect: `You found the ${questItemLower}.`,
      },
    ],
    quest: {
      objective: `Find the ${questItemLower}`,
      completeTrigger: { type: "collect", itemId: "story-spark" },
      completeNpcId: "guide",
      returnObjective: biome.returnHint,
      completeTitle: "Quest Complete",
      completeMessage: `${childName} returned the ${questItemLower} and brought ${story.title} safely home.`,
      completeDialogue: [
        `You found the ${questItemLower}, ${childName}.`,
        `The story ends with this moment: "${stripTrailingPunctuation(finalSentence)}."`,
        "The world feels complete again.",
      ],
    },
  };
}
