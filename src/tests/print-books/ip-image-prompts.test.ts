import { describe, expect, it } from "vitest";
import type { ChildProfile, Story, StoryPerson } from "@/types";
import type { BookProject, BookSpread, CharacterBible } from "@/types/printBook";
import {
  buildStoryPersonAvatarPrompt,
  buildStoryPersonDescriptionAvatarPrompt,
  buildStoryPersonAppearanceSummary,
} from "@/lib/storyPeopleAvatars";
import {
  buildCoverIllustrationPrompt,
  buildPageIllustrationPrompt,
} from "@/lib/print-books/illustrations";

const BRANDED = "Buzz Lightyear";
const REDACTED = "an original space-themed toy";

function createBrandedPerson(): StoryPerson {
  return {
    id: "person-1",
    userId: "user-1",
    name: "Alex",
    relationship: "sibling",
    description: `Loves playing as ${BRANDED} every afternoon.`,
    personality: `Brave like ${BRANDED} and endlessly curious.`,
    appearance: `Wears a ${BRANDED} costume with a green visor.`,
    availableToAllProfiles: true,
    profileIds: ["profile-1"],
    createdAt: "2026-07-15T00:00:00.000Z",
    updatedAt: "2026-07-15T00:00:00.000Z",
  };
}

function createProfile(): ChildProfile {
  return {
    id: "profile-1",
    userId: "user-1",
    name: "Mila",
    age: 4,
    favouriteCharacters: ["Bunny"],
    favouriteActivities: ["painting"],
    favouriteAnimals: ["fox"],
    favouritePlaces: ["garden"],
    lessons: ["kindness"],
    createdAt: "2026-07-15T00:00:00.000Z",
  };
}

function createStory(): Story {
  return {
    id: "story-1",
    userId: "user-1",
    title: `${BRANDED}'s Moonlight Garden`,
    profileId: "profile-1",
    profileName: "Mila",
    wordCount: 120,
    theme: `A day out with ${BRANDED}`,
    notes: "",
    createdAt: "2026-07-15T00:00:00.000Z",
    pages: [
      {
        pageNumber: 1,
        text: `Mila met ${BRANDED} in the garden.`,
        illustrationPrompt: `A cover moment featuring ${BRANDED}.`,
      },
    ],
  };
}

function createCharacterBible(): CharacterBible {
  return {
    childAppearance: "Mila has curly dark hair and bright brown eyes.",
    outfitRules: "Keep Mila in a yellow cardigan over blue pajamas.",
    recurringProps: ["silver lantern"],
    companionCharacters: ["sleepy fox"],
    palette: "soft indigo, butter yellow, silver",
    renderStyle: "storybook gouache",
    lightingTone: "cozy moonlight",
    doNotChange: ["curly dark hair", "yellow cardigan"],
  };
}

function createBrandedSpread(): BookSpread {
  return {
    id: "book-1:spread:2",
    bookProjectId: "book-1",
    sequence: 2,
    pageStart: 3,
    pageEnd: 4,
    layoutType: "text_art",
    title: "A garden adventure",
    leftPageText: `Mila waved at ${BRANDED} across the grass.`,
    rightPageText: `Then ${BRANDED} zoomed into the sky.`,
    sceneBrief: `Scene where ${BRANDED} plays in the garden.`,
    illustrationPrompt: `Draw ${BRANDED} soaring above the flowers.`,
  };
}

function createProject(): BookProject {
  return {
    id: "book-1",
    userId: "user-1",
    sourceStoryId: "story-1",
    profileId: "profile-1",
    ageBand: "3-5",
    status: "illustrating",
    trimSize: "storycot-dynamic-square",
    pageCount: 32,
    spreadCount: 16,
    completedSpreads: 0,
    totalSpreads: 16,
    currentStageLabel: "Painting moonlit pages...",
    characterBible: createCharacterBible(),
    beats: [],
    spreads: [createBrandedSpread()],
    assets: { proofVersion: 0 },
    retryCount: 0,
    createdAt: "2026-07-15T00:00:00.000Z",
    updatedAt: "2026-07-15T00:00:00.000Z",
  };
}

describe("storyPeopleAvatars IP guardrails", () => {
  it("redacts branded references in the photo avatar prompt", () => {
    const prompt = buildStoryPersonAvatarPrompt(createBrandedPerson());
    expect(prompt).not.toMatch(/buzz lightyear/i);
    expect(prompt).toContain(REDACTED);
  });

  it("redacts branded references in the description avatar prompt", () => {
    const prompt = buildStoryPersonDescriptionAvatarPrompt(
      createBrandedPerson()
    );
    expect(prompt).not.toMatch(/buzz lightyear/i);
    expect(prompt).toContain(REDACTED);
  });

  it("redacts branded references in the appearance summary", () => {
    const summary = buildStoryPersonAppearanceSummary(createBrandedPerson());
    expect(summary).not.toMatch(/buzz lightyear/i);
    expect(summary).toContain(REDACTED);
  });
});

describe("illustrations IP guardrails", () => {
  it("redacts branded references in the page illustration prompt", () => {
    const prompt = buildPageIllustrationPrompt({
      project: createProject(),
      story: createStory(),
      profile: createProfile(),
      characterBible: createCharacterBible(),
      spread: createBrandedSpread(),
      side: "left",
    });
    expect(prompt).not.toMatch(/buzz lightyear/i);
    expect(prompt).toContain(REDACTED);
  });

  it("redacts branded references in the cover illustration prompt", () => {
    const prompt = buildCoverIllustrationPrompt({
      project: createProject(),
      story: createStory(),
      profile: createProfile(),
      characterBible: createCharacterBible(),
      coverSpread: createBrandedSpread(),
    });
    expect(prompt).not.toMatch(/buzz lightyear/i);
    expect(prompt).toContain(REDACTED);
  });

  it("redacts branded references in the cover prompt fallback scene direction", () => {
    const prompt = buildCoverIllustrationPrompt({
      project: createProject(),
      story: createStory(),
      profile: createProfile(),
      characterBible: createCharacterBible(),
    });
    expect(prompt).not.toMatch(/buzz lightyear/i);
    expect(prompt).toContain(REDACTED);
  });
});
