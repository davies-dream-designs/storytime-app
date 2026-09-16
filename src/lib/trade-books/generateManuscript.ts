import { db } from "@/lib/db";
import {
  assessGeneratedStoryIp,
  assessProfileIp,
  assessStoryIdeaIp,
  buildIpSafeGenerationInstruction,
  originalizeProseText,
  originalizeReferenceTerm,
} from "@/lib/ipGuardrails";
import {
  validatePublicStorySafety,
  validateStoryIdeaSafety,
} from "@/lib/storySafety";
import { getTradeBooksModelConfig } from "@/lib/trade-books/modelConfig";
import { TradeBookJobPermanentError } from "@/lib/trade-books/worker";
import type { ChildProfile, Story, StoryPage, StoryPreset } from "@/types";
import {
  TRADE_SYSTEM_USER_ID,
  type TradeTitle,
  type TradeTitleGateResults,
  type TradeTitleSafetyResult,
} from "@/types/tradeBook";

type TradePreset = {
  words: string;
  pages: number;
  sentencesPerPage: string;
  style: string;
};

const TRADE_PRESET_CONFIG: Record<StoryPreset, TradePreset> = {
  "baby-drift": {
    words: "90-140",
    pages: 8,
    sentencesPerPage: "1 very short",
    style: "lullaby-like, sensory, and gently repetitive",
  },
  "little-listener": {
    words: "140-220",
    pages: 10,
    sentencesPerPage: "1 short",
    style: "simple, familiar, warm, and gently repetitive",
  },
  "toddler-tale": {
    words: "220-340",
    pages: 12,
    sentencesPerPage: "1-2 short",
    style: "a small adventure with one clear feeling or lesson",
  },
  "first-adventure": {
    words: "350-500",
    pages: 13,
    sentencesPerPage: "2 short",
    style: "a playful, safe plot with a gentle bedtime resolution",
  },
  "preschool-story": {
    words: "450-650",
    pages: 14,
    sentencesPerPage: "2",
    style: "a clear story arc with playful detail and a cosy resolution",
  },
  "big-kid-chapter": {
    words: "750-1050",
    pages: 16,
    sentencesPerPage: "2-3",
    style: "an early chapter-book arc with richer plot and child agency",
  },
  "young-reader-short": {
    words: "1200-1600",
    pages: 20,
    sentencesPerPage: "3-5",
    style: "a short chapter-book with scene breaks and interior thoughts",
  },
  "young-reader-classic": {
    words: "1800-2400",
    pages: 27,
    sentencesPerPage: "3-5",
    style: "a fuller classic chapter-book arc with dialogue",
  },
  "young-reader-long": {
    words: "2600-3400",
    pages: 36,
    sentencesPerPage: "4-6",
    style: "a longer chapter-book with linked scenes and emotional payoff",
  },
  "tiny-tales": {
    words: "150-250",
    pages: 5,
    sentencesPerPage: "1",
    style: "a legacy toddler picture-book style",
  },
  "moonlit-adventures": {
    words: "350-550",
    pages: 9,
    sentencesPerPage: "2-3",
    style: "a legacy balanced picture-book style",
  },
  "epic-sagas": {
    words: "600-900",
    pages: 12,
    sentencesPerPage: "3-4",
    style: "a legacy older-child picture-book style",
  },
};

type GeneratedStory = { title: string; pages: StoryPage[] };
type ModelResponse = { choices?: Array<{ message?: { content?: unknown } }> };

function profileIdFor(titleId: string): string {
  return `trade-profile:${titleId}`;
}

function storyIdFor(titleId: string): string {
  return `trade-story:${titleId}`;
}

function modelResponseJson(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    const start = content.indexOf("{");
    if (start < 0) throw new Error("Model response did not contain JSON");

    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < content.length; index += 1) {
      const character = content[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === '"') inString = false;
        continue;
      }
      if (character === '"') inString = true;
      else if (character === "{") depth += 1;
      else if (character === "}") {
        depth -= 1;
        if (depth === 0) return JSON.parse(content.slice(start, index + 1));
      }
    }
    throw new Error("Model response did not contain a complete JSON object");
  }
}

function normalizeManuscript(
  story: GeneratedStory,
  preset: StoryPreset
): GeneratedStory {
  const clean = (value: string) =>
    value
      .replace(/[\u2013\u2014]/g, " ")
      .replace(/\s+([,.;:!?])/g, "$1")
      .replace(/\s+/g, " ")
      .trim();
  const seen = new Set<string>();
  const pages = story.pages
    .filter((page) => {
      const fingerprint = clean(page.text)
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, "")
        .replace(/\s+/g, " ")
        .trim();
      if (!fingerprint || seen.has(fingerprint)) return false;
      seen.add(fingerprint);
      return true;
    })
    .slice(0, TRADE_PRESET_CONFIG[preset].pages)
    .map((page, index) => ({
      pageNumber: index + 1,
      text: clean(page.text),
      illustrationPrompt: clean(page.illustrationPrompt),
    }));

  if (pages.length === 0) throw new Error("Model response pages are missing");
  return { title: clean(story.title), pages };
}

function parseGeneratedStory(
  content: string,
  storyPreset: StoryPreset
): GeneratedStory {
  const parsed: unknown = modelResponseJson(content);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Model response JSON must be an object");
  }

  const candidate = parsed as { title?: unknown; pages?: unknown };
  if (typeof candidate.title !== "string" || !candidate.title.trim()) {
    throw new Error("Model response title is missing");
  }
  if (!Array.isArray(candidate.pages) || candidate.pages.length === 0) {
    throw new Error("Model response pages are missing");
  }

  const pages = candidate.pages.map((page, index): StoryPage => {
    if (!page || typeof page !== "object" || Array.isArray(page)) {
      throw new Error(`Model response page ${index + 1} is invalid`);
    }
    const candidatePage = page as {
      pageNumber?: unknown;
      text?: unknown;
      illustrationPrompt?: unknown;
    };
    if (
      typeof candidatePage.text !== "string" ||
      !candidatePage.text.trim() ||
      typeof candidatePage.illustrationPrompt !== "string" ||
      !candidatePage.illustrationPrompt.trim()
    ) {
      throw new Error(`Model response page ${index + 1} is incomplete`);
    }
    return {
      pageNumber:
        typeof candidatePage.pageNumber === "number" &&
        Number.isFinite(candidatePage.pageNumber)
          ? Math.trunc(candidatePage.pageNumber)
          : index + 1,
      text: candidatePage.text,
      illustrationPrompt: candidatePage.illustrationPrompt,
    };
  });

  return normalizeManuscript({ title: candidate.title, pages }, storyPreset);
}

function buildSyntheticProfile(
  title: TradeTitle,
  createdAt: string
): ChildProfile {
  return {
    id: profileIdFor(title.id),
    userId: TRADE_SYSTEM_USER_ID,
    name: title.seedBrief.protagonist.name,
    age: title.seedBrief.protagonist.age,
    gender: title.seedBrief.protagonist.gender ?? "not_specified",
    favouriteCharacters: [],
    favouriteActivities: [],
    favouriteAnimals: [],
    favouritePlaces: [],
    lessons: [],
    createdAt,
  };
}

function buildCastPrompt(title: TradeTitle): string {
  const cast = title.seedBrief.cast ?? [];
  if (cast.length === 0) return "No additional cast is supplied.";

  return cast
    .map((person, index) => {
      const role = originalizeReferenceTerm(person.relationship);
      const description = originalizeProseText(person.description);
      const personality = originalizeProseText(person.personality);
      const appearance = originalizeProseText(person.appearance);
      return `${index + 1}. A generic ${role}: ${description}; temperament: ${personality}; appearance: ${appearance}.`;
    })
    .join("\n");
}

function buildPrompt(
  title: TradeTitle,
  premise: string,
  notes: string
): string {
  const preset = TRADE_PRESET_CONFIG[title.seedBrief.storyPreset];
  const protagonist = title.seedBrief.protagonist;
  const genderLine =
    protagonist.gender === "girl"
      ? "Use she/her pronouns when needed."
      : protagonist.gender === "boy"
        ? "Use he/him pronouns when needed."
        : protagonist.gender === "non_binary"
          ? "Use they/them pronouns when needed."
          : "Avoid gendered pronouns unless the name makes the sentence clear.";

  return `You are creating an original trade children's manuscript for a publisher. This is not a personalised consumer story.

Create approximately ${preset.words} words across exactly ${preset.pages} illustrated pages. Use ${preset.sentencesPerPage} sentences per page. Style: ${preset.style}. Write in the language appropriate for locale ${title.seedBrief.locale}.

Manuscript brief:
- Theme: ${originalizeReferenceTerm(title.seedBrief.theme)}
- Premise: ${premise}
- Editorial notes: ${notes}
- Main child: ${originalizeReferenceTerm(protagonist.name)}, age ${protagonist.age}. ${genderLine}
- Additional cast, if used: ${buildCastPrompt(title)}

Use only the supplied main child, the supplied generic cast roles, and unnamed generic adult roles. Do not invent named companions, recurring characters, villains, celebrities, franchises, or branded worlds.

Children's illustration safety requirements:
- Keep children fully clothed, safe, comfortable, and supervised or clearly secure.
- No weapons, injuries, medical treatment, peril, restraint, bathing, toilets, undressing, visible underwear, private body focus, or risky water scenes.
- Each illustrationPrompt describes only an original safe scene, setting, visible characters, action, clothing, mood, and composition. It must contain no text-in-image instruction or quoted story prose.

${buildIpSafeGenerationInstruction()}

Respond ONLY with valid JSON, with no markdown or extra keys:
{"title":"A short original title","pages":[{"pageNumber":1,"text":"Story prose","illustrationPrompt":"Safe original illustrated scene"}]}`;
}

function gateResults(
  inputSafety: TradeTitleSafetyResult,
  inputIp: TradeTitleGateResults["inputIp"],
  profileIp: TradeTitleGateResults["profileIp"],
  outputSafety?: TradeTitleSafetyResult,
  outputIp?: TradeTitleGateResults["outputIp"]
): TradeTitleGateResults {
  return { inputSafety, inputIp, profileIp, outputSafety, outputIp };
}

async function reject(
  title: TradeTitle,
  results: TradeTitleGateResults,
  error: string
): Promise<never> {
  await db.tradeTitles.update(title.id, {
    status: "rejected",
    gateResults: results,
    generationError: error,
  });
  throw new TradeBookJobPermanentError(error);
}

function assertExistingRecordsMatch(
  profile: ChildProfile | undefined,
  story: Story | undefined,
  title: TradeTitle
): void {
  if (profile && profile.userId !== TRADE_SYSTEM_USER_ID) {
    throw new TradeBookJobPermanentError(
      "Synthetic trade profile ownership mismatch"
    );
  }
  if (
    story &&
    (story.userId !== TRADE_SYSTEM_USER_ID ||
      story.profileId !== profileIdFor(title.id))
  ) {
    throw new TradeBookJobPermanentError(
      "Synthetic trade story linkage mismatch"
    );
  }
}

export async function generateTradeTitleManuscript(
  tradeTitleId: string,
  options: { fetchImpl?: typeof fetch; now?: Date } = {}
): Promise<TradeTitle> {
  const title = await db.tradeTitles.getById(tradeTitleId);
  if (!title) throw new TradeBookJobPermanentError("Trade title not found");
  if (title.status === "draft" && title.profileId && title.storyId)
    return title;
  if (title.status !== "queued" && title.status !== "generating") {
    throw new TradeBookJobPermanentError(
      `Trade title cannot generate from status ${title.status}`
    );
  }

  await db.tradeTitles.update(title.id, { status: "generating" });
  const modelConfig = getTradeBooksModelConfig();
  const inputSafety = validateStoryIdeaSafety(title.seedBrief);
  const inputIp = assessStoryIdeaIp(title.seedBrief);
  const castForAssessment = (title.seedBrief.cast ?? []).map(
    (person, index) => ({
      id: `trade-cast:${title.id}:${index}`,
      userId: TRADE_SYSTEM_USER_ID,
      name: `Generic ${person.relationship}`,
      relationship: person.relationship,
      description: person.description,
      personality: person.personality,
      appearance: person.appearance,
      availableToAllProfiles: false,
      profileIds: [],
      createdAt: title.createdAt,
      updatedAt: title.createdAt,
    })
  );
  const profile = buildSyntheticProfile(
    title,
    options.now?.toISOString() ?? new Date().toISOString()
  );
  const profileIp = assessProfileIp({
    ...profile,
    storyPeople: castForAssessment,
  });

  if (!inputSafety.ok) {
    return reject(
      title,
      gateResults(inputSafety, inputIp, profileIp),
      inputSafety.reason
    );
  }
  if (profileIp.printAllowed === false) {
    return reject(
      title,
      gateResults(inputSafety, inputIp, profileIp),
      "Trade title cast or profile is restricted by IP policy"
    );
  }

  const premise = inputIp.originalizedPremise ?? title.seedBrief.premise;
  const notes = inputIp.originalizedNotes ?? title.seedBrief.notes;
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(`${modelConfig.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${modelConfig.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: modelConfig.textModel,
      messages: [{ role: "user", content: buildPrompt(title, premise, notes) }],
      temperature: 0.7,
    }),
  });
  if (!response.ok) {
    throw new Error(
      `Trade manuscript model request failed with status ${response.status}`
    );
  }

  let generated: GeneratedStory;
  try {
    const responseBody = (await response.json()) as ModelResponse;
    const content = responseBody.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      throw new Error("Model response content must be a string");
    }
    generated = parseGeneratedStory(content, title.seedBrief.storyPreset);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Malformed model response";
    return reject(
      title,
      gateResults(inputSafety, inputIp, profileIp, {
        ok: false,
        category: "malformed_model_response",
        reason: message,
      }),
      message
    );
  }

  const rawOutputIp = assessGeneratedStoryIp({
    title: generated.title,
    theme: title.seedBrief.theme,
    premise,
    notes,
    pages: generated.pages,
  });
  const cleanedPages = generated.pages.map((page) => ({
    ...page,
    text: originalizeProseText(page.text),
    illustrationPrompt: originalizeProseText(page.illustrationPrompt),
  }));
  const draft: Story = {
    id: storyIdFor(title.id),
    userId: TRADE_SYSTEM_USER_ID,
    title: originalizeReferenceTerm(generated.title),
    profileId: profile.id,
    profileName: profile.name,
    pages: cleanedPages,
    wordCount: cleanedPages.reduce(
      (total, page) => total + page.text.split(/\s+/).filter(Boolean).length,
      0
    ),
    theme: originalizeReferenceTerm(title.seedBrief.theme),
    premise,
    notes,
    storyPreset: title.seedBrief.storyPreset,
    storyPersonIds: [],
    ipPolicy: inputIp,
    locale: title.seedBrief.locale,
    createdAt: profile.createdAt,
    status: "ready",
    visibility: "private",
    publicReviewStatus: "not_submitted",
  };
  const outputSafety = validatePublicStorySafety(draft);
  const outputIp = assessGeneratedStoryIp(draft);
  if (!outputSafety.ok) {
    return reject(
      title,
      gateResults(inputSafety, inputIp, profileIp, outputSafety, outputIp),
      outputSafety.reason
    );
  }
  if (rawOutputIp.printAllowed === false || outputIp.printAllowed === false) {
    return reject(
      title,
      gateResults(
        inputSafety,
        inputIp,
        profileIp,
        outputSafety,
        rawOutputIp.printAllowed === false ? rawOutputIp : outputIp
      ),
      "Generated trade manuscript is restricted by IP policy"
    );
  }
  draft.ipPolicy = outputIp;

  const [existingProfile, existingStory] = await Promise.all([
    db.profiles.getById(profile.id),
    db.stories.getById(draft.id),
  ]);
  assertExistingRecordsMatch(existingProfile, existingStory, title);
  if (!existingProfile) await db.profiles.create(profile);
  if (!existingStory) await db.stories.create(draft);

  const updated = await db.tradeTitles.update(title.id, {
    status: "draft",
    profileId: profile.id,
    storyId: draft.id,
    modelMetadata: {
      provider: "cliproxy-openai-compatible",
      textModel: modelConfig.textModel,
      reviewModel: modelConfig.reviewModel,
      promptVersion: "trade-manuscript-v1",
      generatedAt: profile.createdAt,
    },
    gateResults: gateResults(
      inputSafety,
      inputIp,
      profileIp,
      outputSafety,
      outputIp
    ),
    generationError: undefined,
  });
  if (!updated)
    throw new TradeBookJobPermanentError(
      "Trade title disappeared during generation"
    );
  return updated;
}
