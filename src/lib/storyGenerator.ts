import Anthropic from "@anthropic-ai/sdk";
import type {
  ChildProfile,
  Character,
  StoryPage,
  StorySuggestion,
} from "@/types";
import {
  buildChildAppearanceDoNotChange,
  buildChildAppearanceSummary,
  getAge,
} from "@/types";

const client = new Anthropic();

function pickRandom<T>(arr: T[], max: number): T[] {
  if (arr.length <= max) return arr;
  return [...arr].sort(() => Math.random() - 0.5).slice(0, max);
}

const LOCALE_LANGUAGE: Record<string, string> = {
  en: "English",
  es: "Spanish",
  fr: "French",
  zh: "Mandarin Chinese",
  ja: "Japanese",
  ru: "Russian",
  id: "Indonesian",
  tr: "Turkish",
  pl: "Polish",
};

interface GenerateStoryInput {
  profile: ChildProfile;
  characters: Character[];
  theme: string;
  premise?: string;
  notes: string;
  recentTitles?: string[];
  locale?: string;
}

interface GeneratedStory {
  title: string;
  pages: StoryPage[];
}

function buildStoryPrompt(input: GenerateStoryInput): string {
  const { profile, characters, theme, premise, notes, recentTitles, locale } =
    input;
  const language = LOCALE_LANGUAGE[locale ?? "en"] ?? "English";

  // Pick a random subset of profile elements each time for variety
  const chars = pickRandom(profile.favouriteCharacters, 2);
  const activities = pickRandom(profile.favouriteActivities, 2);
  const animals = pickRandom(profile.favouriteAnimals, 1);
  const places = pickRandom(profile.favouritePlaces, 1);

  const characterSection =
    characters.length > 0
      ? `\n\nEstablished characters (use these exactly as described):
${characters.map((c) => `- ${c.name}: ${c.description}. Personality: ${c.personality}. Appearance: ${c.appearance}.`).join("\n")}`
      : "";

  const premiseSection = premise
    ? `\n\nStory premise (this is the spine — follow it closely):
${premise}`
    : "";

  const notesSection = notes ? `\n\nExtra details to include: ${notes}` : "";

  const avoidSection =
    recentTitles && recentTitles.length > 0
      ? `\n\nRecent story titles for this child (avoid similar plots):
${recentTitles.map((t) => `- ${t}`).join("\n")}`
      : "";

  return `You are a magical storyteller creating a personalised bedtime story for a child.

Child: ${profile.name}, age ${getAge(profile)}
Visual identity:
- Appearance: ${buildChildAppearanceSummary(profile.appearance) || "No structured appearance details provided."}
- Do not change: ${buildChildAppearanceDoNotChange(profile.appearance).join(", ") || "none"}
Selected favourites for THIS story (others exist but vary each time):
- Characters/toys: ${chars.join(", ") || "none"}
- Activities: ${activities.join(", ") || "none"}
- Animals: ${animals.join(", ") || "none"}
- Favourite place: ${places.join(", ") || "home"}
- Theme/lesson: ${theme || "a gentle adventure"}
${characterSection}${premiseSection}${notesSection}${avoidSection}

Write the story in ${language}. Write a warm, age-appropriate bedtime story that:
1. Features ${profile.name} as the main character
2. Follows this 5-part structure: introduction → adventure/problem → character growth → resolution → calm bedtime ending
3. Uses simple vocabulary appropriate for age ${getAge(profile)}
4. Is approximately 700–900 words total
5. Has a positive, cosy tone ending with ${profile.name} settling down to sleep
6. Naturally weaves in the theme: ${theme || "a gentle adventure"}
7. Feels FRESH and DIFFERENT from typical stories — surprise us with the opening
8. Uses some warm repetition suitable for young children

Respond ONLY with valid JSON — no markdown, no extra text:
{
  "title": "A short magical title",
  "pages": [
    {
      "pageNumber": 1,
      "text": "2–4 sentences of story text",
      "illustrationPrompt": "Brief description for a warm watercolour children's illustration"
    }
  ]
}

Split into 10–14 pages. Each page: 2–4 sentences.`;
}

export async function generateStory(
  input: GenerateStoryInput
): Promise<GeneratedStory> {
  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    messages: [{ role: "user", content: buildStoryPrompt(input) }],
  });

  const content = message.content[0];
  if (content.type !== "text")
    throw new Error("Unexpected response type from AI");

  const raw = content.text.trim();
  try {
    return JSON.parse(raw) as GeneratedStory;
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Could not parse story from AI response");
    return JSON.parse(match[0]) as GeneratedStory;
  }
}

function parseGeneratedStory(raw: string): GeneratedStory {
  try {
    return JSON.parse(raw) as GeneratedStory;
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Could not parse story from AI response");
    return JSON.parse(match[0]) as GeneratedStory;
  }
}

function unescapePartialJsonString(value: string): string {
  try {
    return JSON.parse(`"${value.replace(/\\$/g, "")}"`) as string;
  } catch {
    return value
      .replace(/\\"/g, '"')
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\r")
      .replace(/\\t/g, "\t")
      .replace(/\\\\/g, "\\");
  }
}

export function extractStoryTextSnapshot(raw: string): string[] {
  const pages: string[] = [];
  const completeTextPattern = /"text"\s*:\s*"((?:\\.|[^"\\])*)"/g;
  let match: RegExpExecArray | null;

  while ((match = completeTextPattern.exec(raw))) {
    pages.push(unescapePartialJsonString(match[1]));
  }

  const lastTextKey = raw.lastIndexOf('"text"');
  if (lastTextKey === -1) return pages;

  const afterKey = raw.slice(lastTextKey).match(/"text"\s*:\s*"([\s\S]*)$/);
  if (!afterKey) return pages;

  let partial = afterKey[1];
  let escaped = false;
  let endIndex = -1;
  for (let i = 0; i < partial.length; i += 1) {
    const char = partial[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === '"') {
      endIndex = i;
      break;
    }
  }

  if (endIndex !== -1) return pages;
  partial = partial.trimEnd();
  const visiblePartial = unescapePartialJsonString(partial);
  if (!visiblePartial) return pages;

  if (pages.length > 0 && raw.slice(lastTextKey).startsWith('"text"')) {
    return [...pages, visiblePartial];
  }
  return pages;
}

export async function streamStory(
  input: GenerateStoryInput,
  onSnapshot: (pages: string[]) => void
): Promise<GeneratedStory> {
  const stream = client.messages.stream({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    messages: [{ role: "user", content: buildStoryPrompt(input) }],
  });

  let lastSnapshot = "";
  stream.on("text", (_delta, snapshot) => {
    const pages = extractStoryTextSnapshot(snapshot);
    const serialized = JSON.stringify(pages);
    if (serialized !== lastSnapshot) {
      lastSnapshot = serialized;
      onSnapshot(pages);
    }
  });

  const raw = await stream.finalText();
  return parseGeneratedStory(raw.trim());
}

export async function generateSuggestions(
  profile: ChildProfile,
  recentTitles: string[],
  locale?: string
): Promise<StorySuggestion[]> {
  const language = LOCALE_LANGUAGE[locale ?? "en"] ?? "English";

  const avoidSection =
    recentTitles.length > 0
      ? `\nDon't suggest stories similar to these recent ones: ${recentTitles.join(", ")}`
      : "";

  const prompt = `You are a creative children's story idea generator.

Child profile:
- Name: ${profile.name}, age ${getAge(profile)}
- Appearance: ${buildChildAppearanceSummary(profile.appearance) || "No structured appearance details provided."}
- Favourite characters/toys: ${profile.favouriteCharacters.join(", ") || "none"}
- Favourite activities: ${profile.favouriteActivities.join(", ") || "none"}
- Favourite animals: ${profile.favouriteAnimals.join(", ") || "none"}
- Favourite places: ${profile.favouritePlaces.join(", ") || "none"}
- Themes they like: ${profile.lessons.join(", ") || "adventure, kindness"}
${avoidSection}

Generate exactly 3 unique, imaginative bedtime story ideas for ${profile.name}.
Each should:
- Use DIFFERENT elements from their profile (don't repeat the same toys/places across all 3)
- Have a fresh, specific premise — not generic ("goes on an adventure")
- Be warm and cosy, suitable for bedtime
- Feel genuinely different from each other in setting, tone, and focus

Write the title and premise in ${language}.
The "theme" field must always be a single English word (e.g. bravery, kindness, curiosity) — this is used as a database key.

Respond ONLY with valid JSON — no markdown, no extra text:
[
  {
    "title": "Short catchy title",
    "premise": "One or two sentences describing the specific story. Make it vivid and specific.",
    "theme": "one word theme in English e.g. bravery, kindness, curiosity"
  }
]`;

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });

  const content = message.content[0];
  if (content.type !== "text") throw new Error("Unexpected response type");

  const raw = content.text.trim();
  try {
    return JSON.parse(raw) as StorySuggestion[];
  } catch {
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) throw new Error("Could not parse suggestions");
    return JSON.parse(match[0]) as StorySuggestion[];
  }
}
