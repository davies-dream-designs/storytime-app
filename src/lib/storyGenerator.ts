import Anthropic from "@anthropic-ai/sdk";
import type {
  ChildProfile,
  Character,
  StoryPerson,
  StoryPage,
  StorySuggestion,
  StoryPreset,
} from "@/types";
import { getAge, getStoryPersonRelationshipLabel } from "@/types";
import {
  assessStoryIdeaIp,
  buildIpSafeGenerationInstruction,
} from "@/lib/ipGuardrails";
import {
  buildChildCanonicalAppearanceContext,
  buildStoryPersonCanonicalAppearanceContext,
} from "@/lib/characterReferenceContext";

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
  "baby-drift": {
    words: "90-140",
    pages: "8",
    maxPages: 8,
    sentencesPerPage: "1 very short",
    style:
      "lullaby-like, sensory, repetitive, almost no plot, designed for a baby being read to sleep",
  },
  "little-listener": {
    words: "140-220",
    pages: "10",
    maxPages: 10,
    sentencesPerPage: "1 short",
    style:
      "simple bedtime routine, familiar objects, warm repetition, gentle cause and effect",
  },
  "toddler-tale": {
    words: "220-340",
    pages: "12",
    maxPages: 12,
    sentencesPerPage: "1-2 short",
    style:
      "tiny adventure with one clear feeling or lesson and a satisfying bedtime close",
  },
  "first-adventure": {
    words: "350-500",
    pages: "12-14",
    maxPages: 14,
    sentencesPerPage: "2 short",
    style:
      "simple plot, playful surprise, a little more agency, still very bedtime-safe",
  },
  "preschool-story": {
    words: "450-650",
    pages: "14",
    maxPages: 14,
    sentencesPerPage: "2",
    style:
      "clear story arc, playful detail, lesson through action, cosy bedtime resolution",
  },
  "big-kid-chapter": {
    words: "750-1050",
    pages: "16",
    maxPages: 16,
    sentencesPerPage: "2-3",
    style:
      "early chapter-book style with richer plot, more dialogue, stronger child agency, and fewer image-dependent moments",
  },
  "young-reader-short": {
    words: "1200-1600",
    pages: "18-22",
    maxPages: 22,
    sentencesPerPage: "3-5",
    style:
      "short chapter-book style with scene breaks, more interior thoughts, and occasional illustration-worthy moments",
  },
  "young-reader-classic": {
    words: "1800-2400",
    pages: "24-30",
    maxPages: 30,
    sentencesPerPage: "3-5",
    style:
      "classic chapter-book style with a fuller arc, chapter-like beats, more dialogue, and sparse illustration-worthy moments",
  },
  "young-reader-long": {
    words: "2600-3400",
    pages: "32-40",
    maxPages: 40,
    sentencesPerPage: "4-6",
    style:
      "longer chapter-book style with several linked scenes, richer emotional payoff, and sparse illustration-worthy moments",
  },
  "tiny-tales": {
    words: "150–250",
    pages: "4–6",
    maxPages: 6,
    sentencesPerPage: "1",
    style: "legacy toddler picture-book style",
  },
  "moonlit-adventures": {
    words: "350–550",
    pages: "8–10",
    maxPages: 10,
    sentencesPerPage: "2–3",
    style: "legacy balanced picture-book style",
  },
  "epic-sagas": {
    words: "600–900",
    pages: "10–14",
    maxPages: 14,
    sentencesPerPage: "3–4",
    style: "legacy older-child picture-book style",
  },
} as const;

function buildGenderPromptLine(profile: ChildProfile): string {
  switch (profile.gender) {
    case "girl":
      return "- Gender/pronouns: girl; use she/her where pronouns are needed";
    case "boy":
      return "- Gender/pronouns: boy; use he/him where pronouns are needed";
    case "non_binary":
      return "- Gender/pronouns: non-binary; use they/them where pronouns are needed";
    default:
      return "- Gender/pronouns: not specified; avoid assuming gender from the child's name and use the child's name when pronouns would be unclear";
  }
}

interface GenerateStoryInput {
  profile: ChildProfile;
  characters: Character[];
  storyPeople?: StoryPerson[];
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

export const STORY_GENERATION_RETRY_MESSAGE =
  "Story generation hit a formatting problem. Please try again.";

export class StoryGenerationError extends Error {
  constructor(
    message = STORY_GENERATION_RETRY_MESSAGE,
    public readonly technicalMessage?: string
  ) {
    super(message);
    this.name = "StoryGenerationError";
  }
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

function pageTextFingerprint(value: string): string {
  return removeDashPunctuation(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function prepareGeneratedStoryForPostCheck(
  input: Pick<GenerateStoryInput, "storyPreset">,
  story: GeneratedStory
): GeneratedStory {
  const preset = STORY_PRESET_CONFIG[input.storyPreset ?? "preschool-story"];
  const seenTexts = new Set<string>();
  const uniquePages: StoryPage[] = [];

  for (const page of story.pages) {
    const fingerprint = pageTextFingerprint(page.text);
    if (fingerprint && seenTexts.has(fingerprint)) continue;
    if (fingerprint) seenTexts.add(fingerprint);
    uniquePages.push(page);
  }

  return {
    ...story,
    pages: uniquePages.slice(0, preset.maxPages).map((page, index) => ({
      ...page,
      pageNumber: index + 1,
    })),
  };
}

export function buildStoryPrompt(input: GenerateStoryInput): string {
  const {
    profile,
    characters,
    storyPeople = [],
    theme,
    premise,
    notes,
    storyPreset,
    recentTitles,
    locale,
  } = input;
  const language = LOCALE_LANGUAGE[locale ?? "en"] ?? "English";
  const len = STORY_PRESET_CONFIG[storyPreset ?? "preschool-story"];
  const originalCharacters = characters.filter((character) => {
    const policy = assessStoryIdeaIp({
      premise: `${character.name} ${character.description}`,
      notes: `${character.personality} ${character.appearance}`,
    });
    return policy.riskLevel === "clear";
  });
  const originalStoryPeople = storyPeople.filter((person) => {
    const policy = assessStoryIdeaIp({
      premise: `${person.name} ${getStoryPersonRelationshipLabel(person)} ${person.description}`,
      notes: `${person.personality} ${buildStoryPersonCanonicalAppearanceContext(person)}`,
    });
    return policy.riskLevel === "clear";
  });

  const familySection =
    originalStoryPeople.length > 0
      ? `\n\nSelected family, friends, pets, or story people to include when they fit naturally:
${originalStoryPeople.map((person) => `- ${person.name} (${getStoryPersonRelationshipLabel(person)}${person.pronouns ? `, ${person.pronouns}` : ""}): ${person.description || "No description provided."} Personality: ${person.personality || "No personality notes provided."} Appearance: ${buildStoryPersonCanonicalAppearanceContext(person) || "No appearance notes provided."}`).join("\n")}`
      : "";
  const characterSection =
    originalCharacters.length > 0
      ? `\n\nLegacy saved characters for this child:
${originalCharacters.map((c) => `- ${c.name}: ${c.description}. Personality: ${c.personality}. Appearance: ${c.appearance}.`).join("\n")}`
      : "";

  const premiseSection = premise
    ? `\n\nStory premise (this is the spine - follow it closely):
${premise}

Stay grounded and true to this premise. Include every element the premise names (for example, if it mentions both ice cream and chips, both appear as ordinary food). Keep everyday objects, food, animals, and settings realistic and physically plausible - do NOT turn an incidental or side detail into a giant, surreal, magical, or physically impossible centrepiece, and do not let a minor noun take over the plot, unless the premise explicitly asks for fantasy or magic. Gentle, cosy imagination is welcome; nonsensical or bizarre imagery is not.`
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
${buildGenderPromptLine(profile)}
- Appearance reference: ${buildChildCanonicalAppearanceContext(profile) || "No structured appearance details provided."}
- Theme/lesson: ${theme || "a gentle adventure"}
${familySection}${characterSection}${premiseSection}${notesSection}${avoidSection}

Write the story in ${language}. Write a warm, age-appropriate bedtime story that:
1. Features ${profile.name} as the main character
2. Follows this 5-part structure: introduction → adventure/problem → character growth → resolution → calm bedtime ending
3. Uses simple vocabulary appropriate for age ${getAge(profile)}
4. Is approximately ${len.words} words total
5. Matches this reading style: ${len.style}
6. Has a positive, cosy tone ending with ${profile.name} settling down to sleep
7. Clearly weaves in the theme: ${theme || "a gentle adventure"}. Include one small age-appropriate moment where ${profile.name} notices, practices, or learns this theme through action, then carry that lesson into the calm ending.
8. Feels FRESH and DIFFERENT from typical stories through the telling, characters, and small moments - surprise us with the opening, but keep the premise and its everyday details grounded and realistic
9. Uses warm repetition for ages 0-5; uses chapter-like progression and less repetition for ages 6+
10. Does not invent named parents, grandparents, siblings, friends, or pets. Use only selected people listed above, legacy saved characters, or generic phrases like "a grown-up nearby" when an adult presence is needed.
11. Does NOT include "The End", "Sweet dreams", "Goodnight", or any closing sign-off in the story text - the last page ends naturally with the child drifting to sleep
12. Avoids scenes that could look unsafe or sensitive when illustrated: no bathing, toilets, undressing, visible underwear/nappies, medical treatment, injuries, restraint, scary peril, weapons, drowning, or a child alone in risky water.
13. Keeps ${profile.name} visibly clothed, safe, comfortable, and supervised or clearly secure in every visual moment. If water appears, keep it shallow/calm and frame ${profile.name} safely on dry ground or with a trusted adult nearby.
14. Avoids close-up descriptions of private/sensitive body areas. Do not focus illustration prompts on feet, bare skin, mud on body parts, vulnerability, fear, hiding, or being watched.
15. Makes every illustrationPrompt image-safe: describe setting, characters, action, mood, clothing, and composition only. Do not quote story prose. Do not include wording about nudity, bare body parts, bathing, toilets, fear, injury, danger, restraint, or a child being alone near water.
16. Follows all IP originality requirements below.

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
  // Polishing is a best-effort copyedit pass. A polish/model/validation failure
  // must not discard an otherwise-good draft, so fall back to the un-polished
  // story rather than failing the whole generation.
  try {
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
      await parseGeneratedStoryWithRepair(content.text.trim(), "post-check")
    );
  } catch (err) {
    console.warn(
      "Story post-check failed; using un-polished draft.",
      err instanceof Error ? err.message : err
    );
    return normalized;
  }
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

  return postCheckStory(
    input,
    prepareGeneratedStoryForPostCheck(
      input,
      await parseGeneratedStoryWithRepair(content.text.trim(), "initial story")
    )
  );
}

function parseGeneratedStory(raw: string): GeneratedStory | undefined {
  try {
    return JSON.parse(raw) as GeneratedStory;
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return undefined;
    try {
      return JSON.parse(match[0]) as GeneratedStory;
    } catch {
      return undefined;
    }
  }
}

async function repairGeneratedStoryJson(raw: string, stage: string) {
  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: `Repair this malformed Storycot story JSON from the ${stage} step.

Return ONLY valid JSON matching:
{
  "title": "A short magical title",
  "pages": [
    {
      "pageNumber": 1,
      "text": "Story text",
      "illustrationPrompt": "Image-safe illustration prompt"
    }
  ]
}

Do not add markdown or commentary. Preserve the story content as much as possible.

Malformed JSON:
${raw}`,
      },
    ],
  });

  const content = message.content[0];
  if (content.type !== "text") {
    throw new StoryGenerationError(
      STORY_GENERATION_RETRY_MESSAGE,
      "Unexpected response type from story JSON repair"
    );
  }
  return content.text.trim();
}

async function parseGeneratedStoryWithRepair(
  raw: string,
  stage: string
): Promise<GeneratedStory> {
  const parsed = parseGeneratedStory(raw);
  if (parsed) return parsed;

  try {
    const repaired = await repairGeneratedStoryJson(raw, stage);
    const parsedRepair = parseGeneratedStory(repaired);
    if (parsedRepair) return parsedRepair;
  } catch (error) {
    if (error instanceof StoryGenerationError) throw error;
    throw new StoryGenerationError(
      STORY_GENERATION_RETRY_MESSAGE,
      error instanceof Error ? error.message : String(error)
    );
  }

  throw new StoryGenerationError(
    STORY_GENERATION_RETRY_MESSAGE,
    `Could not parse story JSON from ${stage}`
  );
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
  onSnapshot: (pages: string[]) => void,
  onStage?: (stage: "drafting" | "polishing") => void
): Promise<GeneratedStory> {
  onStage?.("drafting");
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
  onStage?.("polishing");
  return postCheckStory(
    input,
    prepareGeneratedStoryForPostCheck(
      input,
      await parseGeneratedStoryWithRepair(raw.trim(), "streamed story")
    )
  );
}

export async function generateSuggestions(
  profile: ChildProfile,
  recentTitles: string[],
  locale?: string,
  options: {
    selectedTheme?: string;
    previousSuggestions?: StorySuggestion[];
    storyPeople?: StoryPerson[];
  } = {}
): Promise<StorySuggestion[]> {
  const language = LOCALE_LANGUAGE[locale ?? "en"] ?? "English";
  const selectedTheme =
    options.selectedTheme?.trim() || profile.lessons?.[0] || "calm bedtime";

  const avoidSection =
    recentTitles.length > 0
      ? `\nDon't suggest stories similar to these recent ones: ${recentTitles.join(", ")}`
      : "";
  const previousIdeasSection =
    options.previousSuggestions && options.previousSuggestions.length > 0
      ? `\n\nAlready shown to the parent today (do NOT repeat these plots, settings, conflicts, titles, or endings):\n${options.previousSuggestions
          .map(
            (suggestion) =>
              `- ${suggestion.title}: ${suggestion.premise} [theme: ${suggestion.theme}]`
          )
          .join("\n")}`
      : "";
  const originalStoryPeople = (options.storyPeople ?? []).filter((person) => {
    const policy = assessStoryIdeaIp({
      premise: `${person.name} ${getStoryPersonRelationshipLabel(person)} ${person.description}`,
      notes: `${person.personality} ${buildStoryPersonCanonicalAppearanceContext(person)}`,
    });
    return policy.riskLevel === "clear";
  });
  const familySection =
    originalStoryPeople.length > 0
      ? `\n\nSelected family, friends, pets, or other child profiles to include when they fit naturally:\n${originalStoryPeople
          .map(
            (person) =>
              `- ${person.name} (${getStoryPersonRelationshipLabel(person)}${person.pronouns ? `, ${person.pronouns}` : ""}): ${person.description || "No description provided."} Personality: ${person.personality || "No personality notes provided."}`
          )
          .join("\n")}`
      : "";

  const prompt = `You are a creative children's story idea generator.

Child profile:
- Name: ${profile.name}, age ${getAge(profile)}
${buildGenderPromptLine(profile)}
- Appearance: ${buildChildCanonicalAppearanceContext(profile) || "No structured appearance details provided."}
- Favourite toys: ${(profile.favouriteCharacters ?? []).join(", ") || "none"}
- Favourite activities: ${(profile.favouriteActivities ?? []).join(", ") || "none"}
- Favourite animals: ${(profile.favouriteAnimals ?? []).join(", ") || "none"}
- Favourite places: ${(profile.favouritePlaces ?? []).join(", ") || "none"}
- Themes they like: ${(profile.lessons ?? []).join(", ") || "adventure, kindness"}
Selected theme for this batch: ${selectedTheme}
${familySection}
${avoidSection}
${previousIdeasSection}

Generate exactly 3 unique, imaginative bedtime story ideas for ${profile.name}.
Each should:
- Clearly express the selected theme: ${selectedTheme}
- Use DIFFERENT elements from their profile (don't repeat the same toys/places across all 3)
- Avoid repeating any profile element, setting, problem, or ending from the already-shown ideas
- Have a fresh, specific premise - not generic ("goes on an adventure")
- If selected family/friends/pets/other child profiles are listed, make at least one idea naturally include one or more of them by name. Do not invent named parents, grandparents, siblings, friends, or pets that are not listed.
- Be warm and cosy, suitable for bedtime
- Feel genuinely different from each other in setting, tone, and focus

Write the title and premise in ${language}.
The "theme" field must be the selected theme in English, simplified to a short lowercase key if needed (e.g. bravery, kindness, curiosity, calm bedtime) - this is used as a database key.

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
