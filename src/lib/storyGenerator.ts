import Anthropic from "@anthropic-ai/sdk";
import type {
  ChildProfile,
  Character,
  StoryPage,
  StorySuggestion,
  StoryPreset,
} from "@/types";
import { getAge, buildChildAppearanceSummary } from "@/types";
import {
  assessStoryIdeaIp,
  buildIpSafeGenerationInstruction,
} from "@/lib/ipGuardrails";

const client = new Anthropic();

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

const STORY_PRESET_CONFIG = {
  "tiny-tales": { words: "150–250", pages: "4–6", sentencesPerPage: "1" },
  "moonlit-adventures": {
    words: "350–550",
    pages: "8–10",
    sentencesPerPage: "2–3",
  },
  "epic-sagas": { words: "600–900", pages: "10–14", sentencesPerPage: "3–4" },
} as const;

interface GenerateStoryInput {
  profile: ChildProfile;
  characters: Character[];
  theme: string;
  premise?: string;
  notes: string;
  storyPreset?: StoryPreset;
  recentTitles?: string[];
  locale?: string;
}

interface GeneratedStory {
  title: string;
  pages: StoryPage[];
}

function removeDashPunctuation(value: string): string {
  return value
    .replace(/[\u2013\u2014]/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeGeneratedStory(story: GeneratedStory): GeneratedStory {
  return {
    title: removeDashPunctuation(story.title),
    pages: story.pages.map((page) => ({
      ...page,
      text: removeDashPunctuation(page.text),
      illustrationPrompt: removeDashPunctuation(page.illustrationPrompt),
    })),
  };
}

export function buildStoryPrompt(input: GenerateStoryInput): string {
  const {
    profile,
    characters,
    theme,
    premise,
    notes,
    storyPreset,
    recentTitles,
    locale,
  } = input;
  const language = LOCALE_LANGUAGE[locale ?? "en"] ?? "English";
  const len = STORY_PRESET_CONFIG[storyPreset ?? "moonlit-adventures"];
  const originalCharacters = characters.filter((character) => {
    const policy = assessStoryIdeaIp({
      premise: `${character.name} ${character.description}`,
      notes: `${character.personality} ${character.appearance}`,
    });
    return policy.riskLevel === "clear";
  });

  const characterSection =
    originalCharacters.length > 0
      ? `\n\nEstablished characters (use these exactly as described):
${originalCharacters.map((c) => `- ${c.name}: ${c.description}. Personality: ${c.personality}. Appearance: ${c.appearance}.`).join("\n")}`
      : "";

  const premiseSection = premise
    ? `\n\nStory premise (this is the spine - follow it closely):
${premise}`
    : "";

  const notesSection = notes ? `\n\nExtra details to include: ${notes}` : "";

  const avoidSection =
    recentTitles && recentTitles.length > 0
      ? `\n\nRecent story titles for this child (avoid similar plots):
${recentTitles.map((t) => `- ${t}`).join("\n")}`
      : "";
  const ipSection = buildIpSafeGenerationInstruction();

  return `You are a magical storyteller creating a personalised bedtime story for a child.

Child: ${profile.name}, age ${getAge(profile)}
- Theme/lesson: ${theme || "a gentle adventure"}
${characterSection}${premiseSection}${notesSection}${avoidSection}

Write the story in ${language}. Write a warm, age-appropriate bedtime story that:
1. Features ${profile.name} as the main character
2. Follows this 5-part structure: introduction → adventure/problem → character growth → resolution → calm bedtime ending
3. Uses simple vocabulary appropriate for age ${getAge(profile)}
4. Is approximately ${len.words} words total
5. Has a positive, cosy tone ending with ${profile.name} settling down to sleep
6. Naturally weaves in the theme: ${theme || "a gentle adventure"}
7. Feels FRESH and DIFFERENT from typical stories - surprise us with the opening
8. Uses some warm repetition suitable for young children
9. Does NOT include "The End", "Sweet dreams", "Goodnight", or any closing sign-off in the story text - the last page ends naturally with the child drifting to sleep
10. Avoids scenes that could look unsafe or sensitive when illustrated: no bathing, toilets, undressing, visible underwear/nappies, medical treatment, injuries, restraint, scary peril, weapons, drowning, or a child alone in risky water.
11. Keeps ${profile.name} visibly clothed, safe, comfortable, and supervised or clearly secure in every visual moment. If water appears, keep it shallow/calm and frame ${profile.name} safely on dry ground or with a trusted adult nearby.
12. Avoids close-up descriptions of private/sensitive body areas. Do not focus illustration prompts on feet, bare skin, mud on body parts, vulnerability, fear, hiding, or being watched.
13. Makes every illustrationPrompt image-safe: describe setting, characters, action, mood, clothing, and composition only. Do not quote story prose. Do not include wording about nudity, bare body parts, bathing, toilets, fear, injury, danger, restraint, or a child being alone near water.
14. Follows all IP originality requirements below.

${ipSection}

Respond ONLY with valid JSON - no markdown, no extra text:
{
  "title": "A short magical title",
  "pages": [
    {
      "pageNumber": 1,
      "text": "${len.sentencesPerPage} sentences of story text",
      "illustrationPrompt": "Image-safe brief description for a warm watercolour children's illustration: clothed child, safe setting, clear action, cosy mood, no text in image"
    }
  ]
}

Split into ${len.pages} pages. Each page: ${len.sentencesPerPage} sentences.`;
}

export function buildStoryPostCheckPrompt(
  input: GenerateStoryInput,
  story: GeneratedStory
): string {
  const language = LOCALE_LANGUAGE[input.locale ?? "en"] ?? "English";

  return `You are Storycot's final children's-book editor.

Copyedit this generated bedtime story so it is author-ready for a parent to read aloud.

Required checks:
1. Fix grammar, spelling, punctuation, repeated words, awkward wording, and malformed dialogue.
2. Make dialogue attribution accurate and natural. If ${input.profile.name} is the speaker, use "${input.profile.name} said" or an equivalent accurate tag. Do not attribute speech to the wrong character.
3. Keep the child's exact name as ${input.profile.name}. Do not rename the child.
4. Preserve the story's warmth, bedtime tone, age suitability, approximate length, page count, and page numbers.
5. Remove every em dash and en dash. Use commas, periods, or simpler sentence breaks instead.
6. Remove or rewrite any surviving franchise, brand, celebrity, copyrighted character, trademarked world, logo, catchphrase, or recognisable likeness into original Storycot-safe characters and settings.
7. Keep every illustrationPrompt image-safe and original. Do not mention protected names, studios, brands, franchises, lookalike traits, unsafe scenes, private body areas, bathing, toilets, injury, danger, restraint, or text in the image.
8. Write in ${language}.

Respond ONLY with valid JSON matching this exact shape. Do not add markdown or commentary:
{
  "title": "A short magical title",
  "pages": [
    {
      "pageNumber": 1,
      "text": "Polished story text",
      "illustrationPrompt": "Polished image-safe illustration prompt"
    }
  ]
}

Story JSON to polish:
${JSON.stringify(story, null, 2)}`;
}

function validatePostCheckedStory(
  original: GeneratedStory,
  checked: GeneratedStory
): GeneratedStory {
  if (!checked.title?.trim()) {
    throw new Error("Story post-check returned no title");
  }
  if (checked.pages.length !== original.pages.length) {
    throw new Error("Story post-check changed page count");
  }

  for (let i = 0; i < checked.pages.length; i += 1) {
    const originalPage = original.pages[i];
    const checkedPage = checked.pages[i];
    if (!originalPage || !checkedPage) {
      throw new Error("Story post-check returned invalid pages");
    }
    if (checkedPage.pageNumber !== originalPage.pageNumber) {
      throw new Error("Story post-check changed page numbers");
    }
    if (!checkedPage.text?.trim() || !checkedPage.illustrationPrompt?.trim()) {
      throw new Error("Story post-check returned incomplete page content");
    }
  }

  return normalizeGeneratedStory(checked);
}

async function postCheckStory(
  input: GenerateStoryInput,
  story: GeneratedStory
): Promise<GeneratedStory> {
  const normalized = normalizeGeneratedStory(story);
  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    messages: [
      { role: "user", content: buildStoryPostCheckPrompt(input, normalized) },
    ],
  });

  const content = message.content[0];
  if (content.type !== "text") {
    throw new Error("Unexpected response type from story post-check");
  }

  return validatePostCheckedStory(
    normalized,
    parseGeneratedStory(content.text.trim())
  );
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

  return postCheckStory(input, parseGeneratedStory(content.text.trim()));
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
  return postCheckStory(input, parseGeneratedStory(raw.trim()));
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
- Favourite characters/toys: ${(profile.favouriteCharacters ?? []).join(", ") || "none"}
- Favourite activities: ${(profile.favouriteActivities ?? []).join(", ") || "none"}
- Favourite animals: ${(profile.favouriteAnimals ?? []).join(", ") || "none"}
- Favourite places: ${(profile.favouritePlaces ?? []).join(", ") || "none"}
- Themes they like: ${(profile.lessons ?? []).join(", ") || "adventure, kindness"}
${avoidSection}

Generate exactly 3 unique, imaginative bedtime story ideas for ${profile.name}.
Each should:
- Use DIFFERENT elements from their profile (don't repeat the same toys/places across all 3)
- Have a fresh, specific premise - not generic ("goes on an adventure")
- Be warm and cosy, suitable for bedtime
- Feel genuinely different from each other in setting, tone, and focus

Write the title and premise in ${language}.
The "theme" field must always be a single English word (e.g. bravery, kindness, curiosity) - this is used as a database key.

Respond ONLY with valid JSON - no markdown, no extra text:
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
