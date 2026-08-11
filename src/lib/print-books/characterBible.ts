import Anthropic from "@anthropic-ai/sdk";
import type { Character, ChildProfile, Story, StoryPerson } from "@/types";
import {
  buildChildAppearanceDoNotChange,
  buildChildAppearanceSummary,
  getStoryPersonRelationshipLabel,
} from "@/types";
import type { CharacterBible } from "@/types/printBook";
import { getAge } from "@/types";
import { buildStoryPersonCanonicalAppearanceContext } from "@/lib/characterReferenceContext";

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

function summarizeStoryVisuals(story: Story): string {
  return story.pages
    .slice(0, 8)
    .map(
      (page) =>
        `- Page ${page.pageNumber}: text="${page.text.trim()}" visual="${
          (page.illustrationPrompt ?? "").trim() || "None provided"
        }"`
    )
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
- Outfit rules should be stable, reusable, and practical for many scenes.
- Recurring props should be few, memorable, and visually helpful.
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

function normalizeCharacterBible(bible: CharacterBible): CharacterBible {
  return {
    childAppearance:
      bible.childAppearance?.trim() ||
      "Warm, child-friendly appearance kept consistent across the book.",
    outfitRules:
      bible.outfitRules?.trim() ||
      "Use one consistent bedtime-ready outfit with only scene-appropriate minor variations.",
    recurringProps: normalizeList(bible.recurringProps),
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
  };
}

export function buildIllustrationDirection(bible: CharacterBible): string {
  const recurringProps =
    bible.recurringProps.length > 0 ? bible.recurringProps.join(", ") : "none";
  const companionCharacters =
    bible.companionCharacters.length > 0
      ? bible.companionCharacters.join(", ")
      : "none";
  const continuity =
    bible.doNotChange.length > 0
      ? bible.doNotChange.join("; ")
      : "keep the child recognisable";

  return [
    `Child appearance: ${bible.childAppearance}`,
    `Outfit rules: ${bible.outfitRules}`,
    `Recurring props: ${recurringProps}`,
    `Companion characters: ${companionCharacters}`,
    `Palette: ${bible.palette}`,
    `Render style: ${bible.renderStyle}`,
    `Lighting tone: ${bible.lightingTone}`,
    `Do not change: ${continuity}`,
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

    return normalizeCharacterBible(parseCharacterBible(content.text.trim()));
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
