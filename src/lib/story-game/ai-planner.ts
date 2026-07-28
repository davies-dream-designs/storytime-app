import Anthropic from "@anthropic-ai/sdk";
import type { Story } from "@/types";

export type StoryGamePlan = {
  biome: "moon" | "sea" | "forest" | "sky" | "garden" | "mountain" | "cave";
  worldName: string;
  guideName: string;
  helperName: string;
  itemNames: string[];
  npcDialogue: {
    guide: string[];
    helper: string[];
  };
  questSteps: Array<
    | {
        type: "collect";
        objective: string;
        itemName: string;
        onComplete: string;
      }
    | {
        type: "talk";
        objective: string;
        npc: "guide" | "helper";
        dialogue: string[];
      }
  >;
  completeTitle: string;
  completeMessage: string;
  completeDialogue: string[];
};

let client: Anthropic | null = null;

function getClient() {
  client ??= new Anthropic();
  return client;
}

function cleanLine(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function cleanLines(value: unknown, max = 4): string[] {
  return Array.isArray(value)
    ? value.map(cleanLine).filter(Boolean).slice(0, max)
    : [];
}

function extractJson(raw: string): unknown {
  const trimmed = raw.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("Claude returned no JSON");
  return JSON.parse(trimmed.slice(start, end + 1)) as unknown;
}

export function buildStoryGamePlanPrompt(story: Story): string {
  const storyText = story.pages
    .map((page) => `Page ${page.pageNumber}: ${page.text}`)
    .join("\n");

  return `You are designing a premium mini adventure game for Storycot.

Turn this completed children's bedtime story into a structured 5-10 minute game plan.

Requirements:
- Use the story as source material. Expand gently, but stay faithful to the theme and characters.
- Create 5 to 10 quest steps total.
- Include a mix of collect and talk steps.
- The game should not finish in under 30 seconds.
- NPC dialogue must be grammatically polished, short, and in character.
- Quote or closely reference 2-3 moments from the story, but do not dump long paragraphs.
- Avoid danger, weapons, fear, injury, bathrooms, bathing, undressing, copyrighted characters, brands, or unsafe child situations.
- Item names should be natural nouns, not awkward theme phrases.
- Objectives should be clear for a child, for example "Find the silver kite ribbon" or "Talk to the Moon Keeper".
- Valid biomes: moon, sea, forest, sky, garden, mountain, cave.

Story title: ${story.title}
Child/main character: ${story.profileName}
Theme: ${story.theme}

Story pages:
${storyText}

Respond ONLY with valid JSON:
{
  "biome": "moon",
  "worldName": "Mila's Moonlit Kite Meadow",
  "guideName": "Moon Keeper",
  "helperName": "Lantern Friend",
  "itemNames": ["Silver Ribbon", "Moonflower Seed", "Kite Tail"],
  "npcDialogue": {
    "guide": ["Short line 1", "Short line 2"],
    "helper": ["Short line 1", "Short line 2"]
  },
  "questSteps": [
    { "type": "talk", "objective": "Talk to the Moon Keeper", "npc": "guide", "dialogue": ["Short polished dialogue."] },
    { "type": "collect", "objective": "Find the silver ribbon", "itemName": "Silver Ribbon", "onComplete": "You found the silver ribbon." }
  ],
  "completeTitle": "Adventure Complete",
  "completeMessage": "One polished sentence.",
  "completeDialogue": ["Short line 1", "Short line 2"]
}`;
}

export function validateStoryGamePlan(value: unknown): StoryGamePlan {
  const source = value as Partial<StoryGamePlan>;
  const biome = cleanLine(source.biome);
  const validBiomes = new Set([
    "moon",
    "sea",
    "forest",
    "sky",
    "garden",
    "mountain",
    "cave",
  ]);
  if (!validBiomes.has(biome)) throw new Error("Invalid game plan biome");

  const worldName = cleanLine(source.worldName);
  const guideName = cleanLine(source.guideName);
  const helperName = cleanLine(source.helperName);
  const itemNames = cleanLines(source.itemNames, 8);
  const guideDialogue = cleanLines(source.npcDialogue?.guide, 4);
  const helperDialogue = cleanLines(source.npcDialogue?.helper, 4);
  const completeDialogue = cleanLines(source.completeDialogue, 4);
  const completeTitle = cleanLine(source.completeTitle);
  const completeMessage = cleanLine(source.completeMessage);
  if (
    !worldName ||
    !guideName ||
    !helperName ||
    itemNames.length < 3 ||
    guideDialogue.length === 0 ||
    helperDialogue.length === 0 ||
    !completeTitle ||
    !completeMessage ||
    completeDialogue.length === 0
  ) {
    throw new Error("Incomplete game plan");
  }

  const questSteps = Array.isArray(source.questSteps)
    ? source.questSteps
        .map((step) => {
          if (!step || typeof step !== "object") return null;
          const candidate = step as Record<string, unknown>;
          const type = cleanLine(candidate.type);
          const objective = cleanLine(candidate.objective);
          if (!objective) return null;
          if (type === "collect") {
            const itemName = cleanLine(candidate.itemName);
            const onComplete = cleanLine(candidate.onComplete);
            if (!itemName || !onComplete) return null;
            return { type, objective, itemName, onComplete } as const;
          }
          if (type === "talk") {
            const npc = cleanLine(candidate.npc);
            const dialogue = cleanLines(candidate.dialogue, 4);
            if ((npc !== "guide" && npc !== "helper") || dialogue.length === 0)
              return null;
            return { type, objective, npc, dialogue } as const;
          }
          return null;
        })
        .filter((step): step is NonNullable<typeof step> => Boolean(step))
        .slice(0, 10)
    : [];

  if (questSteps.length < 5) {
    throw new Error("Game plan needs at least 5 quest steps");
  }

  return {
    biome: biome as StoryGamePlan["biome"],
    worldName,
    guideName,
    helperName,
    itemNames,
    npcDialogue: { guide: guideDialogue, helper: helperDialogue },
    questSteps,
    completeTitle,
    completeMessage,
    completeDialogue,
  };
}

export async function generateStoryGamePlan(
  story: Story
): Promise<StoryGamePlan> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY not configured");
  }

  const message = await getClient().messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    messages: [{ role: "user", content: buildStoryGamePlanPrompt(story) }],
  });
  const content = message.content[0];
  if (content.type !== "text") {
    throw new Error("Unexpected response type from game planner");
  }

  return validateStoryGamePlan(extractJson(content.text));
}
