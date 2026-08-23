import Anthropic from "@anthropic-ai/sdk";
import type { Character, ChildProfile, Story, StoryPerson } from "@/types";
import {
  buildChildAppearanceDoNotChange,
  buildChildAppearanceSummary,
  formatAge,
  getStoryPersonRelationshipLabel,
} from "@/types";
import type { CharacterBible } from "@/types/printBook";
import { getAge } from "@/types";
import {
  buildChildCanonicalAppearanceContext,
  buildStoryPersonCanonicalAppearanceContext,
} from "@/lib/characterReferenceContext";

let client: Anthropic | undefined;

function getClient(): Anthropic {
  client ??= new Anthropic();
  return client;
}

function buildCharacterList(characters: Character[]): string {
  if (characters.length === 0) return "None saved.";

  return characters
    .map(
      (character) =>
        `- ${character.name}: ${character.description || "No description provided."} Personality: ${
          character.personality || "No personality notes provided."
        } Appearance: ${character.appearance || "No appearance notes provided."}`
    )
    .join("\n");
}

function buildStoryPeopleList(people: StoryPerson[]): string {
  if (people.length === 0) return "None selected.";

  return people
    .map(
      (person) =>
        `- ${person.name} (${getStoryPersonRelationshipLabel(person)}${person.pronouns ? `, ${person.pronouns}` : ""}): ${
          person.description || "No description provided."
        } Personality: ${person.personality || "No personality notes provided."} Appearance: ${
          buildStoryPersonCanonicalAppearanceContext(person) ||
          "No appearance notes provided."
        } Generated reference image: ${person.avatarImageUrl ? "available for visual consistency" : "not available"}`
    )
    .join("\n");
}

function clampPromptPreview(value: string, maxLength: number): string {
  return value.length <= maxLength
    ? value
    : `${value.slice(0, maxLength - 3).trimEnd()}...`;
}

function summarizeStoryVisuals(story: Story): string {
  return story.pages
    .map((page) => {
      const text = clampPromptPreview(page.text.trim(), 160);
      const visual = clampPromptPreview(
        (page.illustrationPrompt ?? "").trim() || "None provided",
        160
      );
      return `- Page ${page.pageNumber}: text="${text}" visual="${visual}"`;
    })
    .join("\n");
}

function buildGenderPromptLine(profile: ChildProfile): string {
  switch (profile.gender) {
    case "girl":
      return "- Gender/pronouns: girl; use she/her where pronouns are needed";
    case "boy":
      return "- Gender/pronouns: boy; use he/him where pronouns are needed";
    case "non_binary":
      return "- Gender/pronouns: non-binary; use they/them where pronouns are needed";
    default:
      return "- Gender/pronouns: not specified; do not infer gender from the child's name";
  }
}

function buildCharacterBiblePrompt(input: {
  profile: ChildProfile;
  story: Story;
  characters: Character[];
  storyPeople?: StoryPerson[];
}): string {
  const { profile, story, characters, storyPeople = [] } = input;

  return `You are preparing a character bible for a children's print-ready picture book.

Your job is to create one stable visual identity package that can be reused across cover art and all interior spreads.

Child profile:
- Name: ${profile.name}
- Age: ${getAge(profile)}
${buildGenderPromptLine(profile)}
- Visual appearance: ${buildChildAppearanceSummary(profile.appearance) || "No structured appearance details provided."}
- Generated reference summary: ${profile.appearanceSummary || "No generated reference summary provided."}
- Generated reference image: ${profile.avatarImageUrl ? "available for profile consistency" : "not available"}
- Keep consistent: ${buildChildAppearanceDoNotChange(profile.appearance).join(", ") || "none"}
- Favourite toys: ${(profile.favouriteCharacters ?? []).join(", ") || "none"}
- Favourite activities: ${(profile.favouriteActivities ?? []).join(", ") || "none"}
- Favourite animals: ${(profile.favouriteAnimals ?? []).join(", ") || "none"}
- Favourite places: ${(profile.favouritePlaces ?? []).join(", ") || "none"}
- Themes or lessons: ${(profile.lessons ?? []).join(", ") || "none"}

Story context:
- Title: ${story.title}
- Theme: ${story.theme || "gentle bedtime adventure"}
- Premise: ${story.premise || "Not provided"}
- Notes: ${story.notes || "None"}

Saved supporting characters:
${buildCharacterList(characters)}

Selected family, friends, pets, or story people:
${buildStoryPeopleList(storyPeople)}

Key source pages and illustration cues:
${summarizeStoryVisuals(story)}

Return ONLY valid JSON with this exact shape:
{
  "childAppearance": "string",
  "outfitRules": "string",
  "recurringProps": ["string"],
  "companionCharacters": ["string"],
  "palette": "string",
  "renderStyle": "string",
  "lightingTone": "string",
  "doNotChange": ["string"]
}

Requirements:
- Keep the child recognisable and age-appropriate across every illustration.
- Prefer concrete physical details over vague adjectives.
- Outfit rules should be stable, reusable, and practical for many scenes, and must name specific footwear (shoes or boots, colour and style) so shoes stay identical on every page.
- Recurring props should be few, memorable, and visually helpful. Never list clothing, footwear, shoes, or boots as a recurring prop; worn items belong only in outfitRules so they are not drawn twice.
- Companion characters should include only characters that should reappear visually.
- For selected family/friends/pets, preserve the supplied appearance and reference-image notes. Do not turn relationship roles into generic stereotypes; for example, do not make grandparents much older, thinner, heavier, or frailer unless their reference/appearance says so.
- Palette, renderStyle, and lightingTone should fit a warm bedtime picture book.
- doNotChange must list the highest-value continuity constraints for later image prompts.
- Keep every field concise but specific.`;
}

function parseCharacterBible(raw: string): CharacterBible {
  // Strip markdown code fences the model sometimes wraps JSON in.
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned) as CharacterBible;
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match)
      throw new Error("Could not parse character bible from AI response");
    return JSON.parse(match[0]) as CharacterBible;
  }
}

function normalizeList(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return values
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean);
}

// Worn items are locked via outfitRules/footwear; if the model also lists them
// as recurring props they get drawn a second time as loose scene objects (e.g. a
// spare pair of boots by the door), so they are stripped from the prop list.
const WORN_ITEM_PROP_PATTERN =
  /\b(boots?|shoes?|sandals?|slippers?|sneakers?|trainers?|wellies|wellingtons?|socks?|hat|cap|beanie|scarf|mittens?|gloves?|coat|jacket|jumper|sweater|cardigan|dress|skirt|shirt|top|tee|t-shirt|trousers|pants|shorts|overalls|dungarees|pyjamas|pajamas|onesie|outfit|clothes|clothing|footwear)\b/i;

function stripWornItemsFromProps(props: string[]): string[] {
  return props.filter((prop) => !WORN_ITEM_PROP_PATTERN.test(prop));
}

function normalizeLockedCharacterRules(
  values: CharacterBible["lockedCharacterRules"]
): NonNullable<CharacterBible["lockedCharacterRules"]> {
  if (!Array.isArray(values)) return [];
  return values
    .map((value) => {
      const role: "main_child" | "family_friend_pet" =
        value.role === "family_friend_pet" ? "family_friend_pet" : "main_child";
      return {
        id: typeof value.id === "string" ? value.id.trim() : "",
        name: typeof value.name === "string" ? value.name.trim() : "",
        role,
        relationship:
          typeof value.relationship === "string" && value.relationship.trim()
            ? value.relationship.trim()
            : undefined,
        identityRules:
          typeof value.identityRules === "string"
            ? value.identityRules.trim()
            : "",
        outfitRules:
          typeof value.outfitRules === "string"
            ? value.outfitRules.trim()
            : "",
        continuityRules: normalizeList(value.continuityRules),
      };
    })
    .filter((value) => value.id && value.name && value.identityRules);
}

function normalizeCharacterBible(bible: CharacterBible): CharacterBible {
  return {
    childAppearance:
      bible.childAppearance?.trim() ||
      "Warm, child-friendly appearance kept consistent across the book.",
    outfitRules:
      bible.outfitRules?.trim() ||
      "Use one consistent bedtime-ready outfit with only scene-appropriate minor variations.",
    recurringProps: stripWornItemsFromProps(normalizeList(bible.recurringProps)),
    companionCharacters: normalizeList(bible.companionCharacters),
    palette:
      bible.palette?.trim() ||
      "Soft moonlit bedtime palette with warm highlights.",
    renderStyle:
      bible.renderStyle?.trim() ||
      "Warm storybook illustration with gentle texture and expressive faces.",
    lightingTone:
      bible.lightingTone?.trim() ||
      "Soft evening light with calm, cozy contrast.",
    doNotChange: normalizeList(bible.doNotChange),
    lockedCharacterRules: normalizeLockedCharacterRules(
      bible.lockedCharacterRules
    ),
  };
}

function stableIndex(seed: string, size: number): number {
  let hash = 5381;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 33) ^ seed.charCodeAt(index);
  }
  return Math.abs(hash >>> 0) % size;
}

function pickStable(seed: string, values: string[]): string {
  return values[stableIndex(seed, values.length)] ?? values[0]!;
}

const childFallbackOutfits = [
  "soft blue pajama top, warm cream pajama pants, white socks, and simple navy slippers",
  "warm sage pajama top, pale grey pajama pants, white socks, and simple brown slippers",
  "cozy yellow cardigan, soft blue pajamas, white socks, and simple canvas shoes",
  "plain teal top, soft grey joggers, white socks, and simple navy shoes",
];

const adultFallbackOutfits = [
  "plain oatmeal knit top, soft blue trousers, and simple brown shoes",
  "plain sage jumper, dark comfortable trousers, and simple tan shoes",
  "plain cream t-shirt, soft charcoal trousers, and simple brown shoes",
  "plain blue cardigan, warm neutral trousers, and simple dark shoes",
];

const petFallbackLooks = [
  "natural markings only, with no clothing or accessories unless explicitly specified",
  "stable natural coat or fur markings, with no outfit unless explicitly specified",
];

function buildLockedCharacterRules(input: {
  profile: ChildProfile;
  storyPeople: StoryPerson[];
}): NonNullable<CharacterBible["lockedCharacterRules"]> {
  const childAppearance =
    buildChildCanonicalAppearanceContext(input.profile) ||
    `Infer a gentle age-appropriate child look for ${input.profile.name} once and keep it consistent for the whole book.`;
  const childOutfit = pickStable(
    `child:${input.profile.id}:${input.profile.name}`,
    childFallbackOutfits
  );

  const rules: NonNullable<CharacterBible["lockedCharacterRules"]> = [
    {
      id: `profile:${input.profile.id}`,
      name: input.profile.name,
      role: "main_child",
      identityRules: `${input.profile.name} is the main child, ${formatAge(input.profile)} old. ${childAppearance}`,
      outfitRules: `Locked outfit and footwear for this book unless the latest child profile explicitly says otherwise: ${childOutfit}. Keep shoes, socks, clothing colors, and hairstyle consistent across every cover, page, and redo.`,
      continuityRules: [
        "Use the same face shape, eye color, hair color, hairstyle, skin tone, body build, outfit, and footwear on every page.",
        "If a trait is missing from the profile, infer it once from this locked rule and do not redesign it later.",
      ],
    },
  ];

  for (const person of input.storyPeople) {
    const relationship = getStoryPersonRelationshipLabel(person);
    const isPet = person.relationship === "pet";
    const appearance =
      buildStoryPersonCanonicalAppearanceContext(person) ||
      `Infer a respectful, original look for ${person.name} once and keep it consistent for the whole book.`;
    const outfit = isPet
      ? pickStable(`pet:${person.id}:${person.name}`, petFallbackLooks)
      : pickStable(`person:${person.id}:${person.name}`, adultFallbackOutfits);

    rules.push({
      id: `person:${person.id}`,
      name: person.name,
      role: "family_friend_pet",
      relationship,
      identityRules: `${person.name} is ${relationship}. ${appearance}`,
      outfitRules: `Locked outfit, markings, and footwear for this book unless the latest edited profile explicitly says otherwise: ${outfit}. Keep these details consistent across every cover, page, and redo.`,
      continuityRules: [
        "Use the same face shape, apparent age, height, body build, hair or fur, glasses, skin tone or markings, outfit, and footwear on every page.",
        "If a trait is missing from the profile, infer it once from this locked rule and do not redesign it later.",
        "Do not make this person a generic relationship stereotype; preserve the specific profile and reference details.",
      ],
    });
  }

  return rules;
}

export function enrichCharacterBibleWithLockedRules(
  bible: CharacterBible,
  input: { profile: ChildProfile; storyPeople: StoryPerson[] }
): CharacterBible {
  return {
    ...bible,
    lockedCharacterRules: buildLockedCharacterRules(input),
  };
}

function clampPromptValue(value: string, maxChars: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxChars) return normalized;
  const trimmed = normalized.slice(0, Math.max(0, maxChars - 1));
  const boundary = Math.max(trimmed.lastIndexOf(" "), trimmed.lastIndexOf(";"));
  return `${(boundary > maxChars * 0.6 ? trimmed.slice(0, boundary) : trimmed).trim()}…`;
}

// Words that carry no identifying signal for a companion/prop, so they must not
// be used to decide whether it has appeared in the story yet (e.g. a "small
// green dinosaur" must not be triggered by unrelated "green garden" text).
const COMPANION_MATCH_STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "with", "who", "that", "this", "her", "his",
  "its", "their", "of", "for", "in", "on", "to", "is", "are",
  "tiny", "small", "little", "big", "large", "baby", "young", "old", "giant",
  "green", "red", "blue", "brown", "grey", "gray", "white", "black", "yellow",
  "purple", "pink", "orange", "golden", "gold", "silver", "dark", "light",
  "soft", "friendly", "cuddly", "toy", "plush", "stuffed", "character",
  "companion", "creature", "animal", "pet", "shiny", "spiky", "fluffy", "round",
  "gentle", "happy", "cute", "colour", "color", "coloured", "colored",
  "named", "called", "some", "very", "into", "from", "they", "them",
]);

// Content words (>=4 chars, not a stopword) that identify a companion/prop.
function companionMatchKeywords(entry: string): string[] {
  return Array.from(
    new Set(
      entry
        .toLowerCase()
        .replace(/[^a-z0-9\s]+/g, " ")
        .split(/\s+/)
        .filter((word) => word.length >= 4 && !COMPANION_MATCH_STOPWORDS.has(word))
    )
  );
}

// Keep only companions/props the story text has introduced by this point.
// An entry with no identifying keyword (e.g. "a friendly creature") is dropped
// rather than shown everywhere, so nothing is drawn before it appears.
function filterEntriesByScene(entries: string[], sceneText: string): string[] {
  const haystack = sceneText.toLowerCase();
  if (!haystack.trim()) return entries;
  return entries.filter((entry) => {
    const keywords = companionMatchKeywords(entry);
    if (keywords.length === 0) return false;
    return keywords.some((keyword) => haystack.includes(keyword));
  });
}

export function buildIllustrationDirection(
  bible: CharacterBible,
  options?: { compact?: boolean; activeSceneText?: string }
): string {
  const compact = options?.compact ?? false;
  const activeSceneText = options?.activeSceneText;
  const gatedProps =
    activeSceneText === undefined
      ? bible.recurringProps
      : filterEntriesByScene(bible.recurringProps, activeSceneText);
  const gatedCompanions =
    activeSceneText === undefined
      ? bible.companionCharacters
      : filterEntriesByScene(bible.companionCharacters, activeSceneText);
  const recurringProps =
    gatedProps.length > 0 ? gatedProps.join(", ") : "none";
  const companionCharacters =
    gatedCompanions.length > 0
      ? gatedCompanions.join(", ")
      : "none";
  const continuity =
    bible.doNotChange.length > 0
      ? bible.doNotChange.join("; ")
      : "keep the child recognisable";
  const lockedRules = normalizeLockedCharacterRules(bible.lockedCharacterRules);
  const lockedContinuity =
    lockedRules.length > 0
      ? [
          compact
            ? "LOCKED CHARACTER CONTINUITY: keep these identities, body builds, and signature outfits stable across every cover, page, and redo."
            : "LOCKED CHARACTER CONTINUITY: use these per-character rules as the source of truth for every cover, interior page, and redo.",
          ...lockedRules.map((character) => {
            const relationship = character.relationship
              ? `, ${character.relationship}`
              : "";
            if (compact) {
              const compactConstraints = character.continuityRules.length
                ? ` Keep consistent: ${clampPromptValue(character.continuityRules.join("; "), 140)}.`
                : "";
              return `${character.name} (${character.role}${relationship}): ${clampPromptValue(character.identityRules, 180)} Outfit/markings: ${clampPromptValue(character.outfitRules, 180)}.${compactConstraints}`;
            }
            const constraints = character.continuityRules.length
              ? ` Continuity constraints: ${character.continuityRules.join("; ")}.`
              : "";
            return `${character.name} (${character.role}${relationship}): ${character.identityRules} ${character.outfitRules}.${constraints}`;
          }),
          compact
            ? "Do not redesign locked faces, hair or fur, body build, age cues, clothing, or footwear later in the book."
            : "For any unspecified visual detail, follow the inferred locked rule above and repeat it consistently; do not invent new shoes, clothing, hair, face, body build, or age details on later pages.",
        ].join(" ")
      : "";

  return [
    lockedContinuity,
    `Child appearance: ${clampPromptValue(bible.childAppearance, compact ? 180 : 420)}`,
    `Outfit rules: ${clampPromptValue(bible.outfitRules, compact ? 180 : 420)}`,
    `Recurring props: ${clampPromptValue(recurringProps, compact ? 120 : 220)}`,
    `Companion characters: ${clampPromptValue(companionCharacters, compact ? 120 : 220)}`,
    gatedCompanions.length > 0
      ? compact
        ? "Companion characters are living creatures, never plush, stuffed, or soft toys. Only draw a companion when this page's scene actually places it here; if the text only remembers or mentions it, do not add it."
        : "Companion characters are real, living creatures in the story - never draw them as a plush, stuffed animal, soft toy, or figurine. Only include a companion when this specific page's scene physically places it there; if the page's text only remembers, mentions, or thinks about the companion without it being present, do not add it to the illustration."
      : "",
    `Palette: ${clampPromptValue(bible.palette, compact ? 100 : 180)}`,
    compact
      ? "Apply the palette only to background, clothing, and lighting, never to hair, skin, or eyes."
      : "Apply the warm palette only to background, clothing, and lighting. Keep every character's hair colour, eyebrow colour, facial-hair colour, skin tone, and eye colour true to their locked appearance; never warm-tint, redden, or lighten hair, skin, or eyes to match the palette.",
    `Render style: ${clampPromptValue(bible.renderStyle, compact ? 100 : 180)}`,
    compact
      ? "Flat 2-D storybook illustration, not a glossy 3-D or photorealistic render; same realism for every character."
      : "Rendering-level lock: draw a flat two-dimensional children's picture-book illustration with soft watercolour and coloured-pencil shading; do not produce a glossy three-dimensional render, CGI or Pixar-style portrait, or photorealistic likeness. Use the same illustration realism and shading level for every character so they all belong in the same book.",
    `Lighting tone: ${clampPromptValue(bible.lightingTone, compact ? 100 : 180)}`,
    `Do not change: ${clampPromptValue(continuity, compact ? 180 : 320)}`,
    compact
      ? "Keep each character's exact footwear identical on every page; never restyle or recolour shoes or boots. Footwear is worn on the feet only - never add a second spare pair as a scene object."
      : "Footwear lock: give each character one fixed pair of shoes or boots and keep the same style and colour on the cover and every page; never swap, redesign, or recolour their footwear between pages. Each character's footwear is worn on their feet only; do not also place a duplicate or spare pair of their shoes or boots elsewhere in the scene.",
    "For selected family/friends/pets, preserve their described/reference apparent age, face shape, hair, glasses, body build, and markings. Do not make grandparents generically elderly or alter body build from the reference.",
  ].join(" ");
}

export async function generateCharacterBible(input: {
  profile: ChildProfile;
  story: Story;
  characters: Character[];
  storyPeople?: StoryPerson[];
}): Promise<CharacterBible> {
  const prompt = buildCharacterBiblePrompt(input);

  // The bible is JSON with eight fields; 1200 tokens occasionally truncated the
  // response mid-object, leaving no closing brace to parse. Give it headroom and
  // retry once so a single malformed reply can't fail the whole build.
  const attempt = async (): Promise<CharacterBible> => {
    const message = await getClient().messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
    });

    const content = message.content[0];
    if (content.type !== "text")
      throw new Error("Unexpected response type from AI");

    return enrichCharacterBibleWithLockedRules(
      normalizeCharacterBible(parseCharacterBible(content.text.trim())),
      {
        profile: input.profile,
        storyPeople: input.storyPeople ?? [],
      }
    );
  };

  try {
    return await attempt();
  } catch (err) {
    console.warn(
      `Character bible parse failed (${
        err instanceof Error ? err.message : "unknown error"
      }) - retrying once.`
    );
    return attempt();
  }
}
