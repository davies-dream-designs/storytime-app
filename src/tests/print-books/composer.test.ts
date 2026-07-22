import { describe, expect, it } from "vitest";
import {
  composePrintBookSpreads,
  createEmptyBookProject,
} from "@/lib/print-books/composer";
import { deriveBeatsFromStory } from "@/lib/print-books/beats";
import type { ChildProfile, Story } from "@/types";
import type { CharacterBible } from "@/types/printBook";

function createProfile(age: number): ChildProfile {
  return {
    id: "profile-1",
    userId: "user-1",
    name: "Mila",
    age,
    favouriteCharacters: ["Bunny"],
    favouriteActivities: ["painting"],
    favouriteAnimals: ["fox"],
    favouritePlaces: ["garden"],
    lessons: ["kindness"],
    createdAt: "2026-07-15T00:00:00.000Z",
  };
}

function createStory(pageCount: number): Story {
  return {
    id: "story-1",
    userId: "user-1",
    title: "Moonlight Garden",
    profileId: "profile-1",
    profileName: "Mila",
    wordCount: pageCount * 20,
    theme: "kindness",
    notes: "",
    createdAt: "2026-07-15T00:00:00.000Z",
    pages: Array.from({ length: pageCount }, (_, index) => ({
      pageNumber: index + 1,
      text: `Story page ${index + 1} with a gentle bedtime moment and a little adventure.`,
      illustrationPrompt: `Illustration prompt ${index + 1}`,
    })),
  };
}

function createSentenceStory(): Story {
  return {
    id: "story-sentences",
    userId: "user-1",
    title: "Sentence Story",
    profileId: "profile-1",
    profileName: "Mila",
    wordCount: 160,
    theme: "wonder",
    notes: "",
    createdAt: "2026-07-15T00:00:00.000Z",
    pages: [
      {
        pageNumber: 1,
        text: "Mila saw a silver gate. It shimmered in the moonlight. She whispered hello and stepped closer.",
        illustrationPrompt: "A silver gate in moonlight",
      },
      {
        pageNumber: 2,
        text: "A tiny lantern flickered beside the path. It made the flowers glow. Mila smiled and kept going.",
        illustrationPrompt: "Lantern and glowing flowers",
      },
      {
        pageNumber: 3,
        text: "A sleepy fox blinked once. Then it curled up again. The garden felt safe and soft.",
        illustrationPrompt: "Sleepy fox in garden",
      },
      {
        pageNumber: 4,
        text: "Soon the night grew quieter. Mila felt peaceful. It was almost time for bed.",
        illustrationPrompt: "Quiet garden at bedtime",
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

describe("createEmptyBookProject", () => {
  it("creates a queued dynamic square book shell", () => {
    const project = createEmptyBookProject({
      id: "book-1",
      userId: "user-1",
      sourceStoryId: "story-1",
      profileId: "profile-1",
      ageBand: "3-5",
    });

    expect(project.status).toBe("queued");
    expect(project.pageCount).toBe(28);
    expect(project.spreadCount).toBe(14);
  });
});

describe("composePrintBookSpreads", () => {
  it("composes a 3-5 book to 14 spreads covering 28 pages", () => {
    const story = createStory(10);
    const spreads = composePrintBookSpreads({
      bookProjectId: "book-1",
      story,
      profile: createProfile(4),
      ageBand: "3-5",
      beats: deriveBeatsFromStory(story),
    });

    expect(spreads).toHaveLength(14);
    expect(spreads[0]?.pageStart).toBe(1);
    expect(spreads[13]?.pageEnd).toBe(28);
  });

  it("creates more quiet pacing for the youngest age band", () => {
    const story = createStory(6);
    const spreads = composePrintBookSpreads({
      bookProjectId: "book-1",
      story,
      profile: createProfile(2),
      ageBand: "0-2",
      beats: deriveBeatsFromStory(story),
    });

    const quietCount = spreads.filter(
      (spread) => spread.layoutType === "quiet"
    ).length;
    expect(quietCount).toBeGreaterThanOrEqual(4);
    expect(spreads.some((spread) => spread.leftPageText.includes("Mila"))).toBe(
      true
    );
    expect(
      spreads.some((spread) => spread.sceneBrief.includes("Story page"))
    ).toBe(true);
  });

  it("keeps front matter first and end matter last for longer books", () => {
    const story = createStory(12);
    const spreads = composePrintBookSpreads({
      bookProjectId: "book-1",
      story,
      profile: createProfile(7),
      ageBand: "6-8",
      beats: deriveBeatsFromStory(story),
    });

    expect(spreads[0]?.layoutType).toBe("front_matter");
    expect(spreads[1]?.layoutType).toBe("front_matter");
    expect(spreads).toHaveLength(16);
    expect(spreads.at(-2)?.layoutType).toBe("end_matter");
    expect(spreads.at(-1)?.layoutType).toBe("end_matter");
    expect(spreads.at(-1)?.pageEnd).toBe(32);
  });

  it("derives extra interior spreads from the story instead of using only generic filler", () => {
    const story = createStory(4);
    const spreads = composePrintBookSpreads({
      bookProjectId: "book-1",
      story,
      profile: createProfile(2),
      ageBand: "0-2",
      beats: deriveBeatsFromStory(story),
    });

    const interiorSpreads = spreads.slice(2, 10);
    expect(
      interiorSpreads.some((spread) =>
        spread.leftPageText.includes("Story page 1")
      )
    ).toBe(true);
    expect(
      interiorSpreads.some((spread) =>
        spread.illustrationPrompt.includes("toddler board-book style")
      )
    ).toBe(true);
  });

  it("splits story text at sentence boundaries for regular spreads", () => {
    const story = createSentenceStory();
    const spreads = composePrintBookSpreads({
      bookProjectId: "book-1",
      story,
      profile: createProfile(4),
      ageBand: "3-5",
      beats: deriveBeatsFromStory(story),
    });

    const firstStorySpread = spreads[2];
    expect(firstStorySpread?.leftPageText).toBe("Mila saw a silver gate.");
    expect(firstStorySpread?.rightPageText).toBe(
      "It shimmered in the moonlight. She whispered hello and stepped closer."
    );
  });

  it("uses named expansion roles instead of generic quiet filler for short stories", () => {
    const story = createStory(4);
    const spreads = composePrintBookSpreads({
      bookProjectId: "book-1",
      story,
      profile: createProfile(4),
      ageBand: "3-5",
      beats: deriveBeatsFromStory(story),
    });

    const interiorSpreads = spreads.slice(2, 14);
    expect(
      interiorSpreads.some((spread) =>
        spread.sceneBrief.includes("scene-setting")
      )
    ).toBe(true);
    expect(
      interiorSpreads.some((spread) =>
        spread.sceneBrief.includes("notice-and-linger")
      )
    ).toBe(true);
    expect(
      interiorSpreads.some((spread) =>
        spread.sceneBrief.includes("turn-the-page")
      )
    ).toBe(true);
  });

  it("keeps every story page when there are more source pages than planned story spreads", () => {
    const story = createStory(14);
    const spreads = composePrintBookSpreads({
      bookProjectId: "book-1",
      story,
      profile: createProfile(2),
      ageBand: "0-2",
      beats: deriveBeatsFromStory(story),
    });

    const composedText = spreads
      .map((spread) => `${spread.leftPageText} ${spread.rightPageText}`)
      .join(" ");
    for (let page = 1; page <= 14; page += 1) {
      expect(composedText).toContain(`Story page ${page}`);
    }
  });

  it("keeps scene brief separate from illustration intent", () => {
    const story = createStory(1);
    const spreads = composePrintBookSpreads({
      bookProjectId: "book-1",
      story,
      profile: createProfile(4),
      ageBand: "3-5",
      beats: deriveBeatsFromStory(story),
    });

    expect(spreads[2]?.sceneBrief).toContain("Story page 1");
    expect(spreads[2]?.sceneBrief).not.toContain("Illustration prompt 1");
    expect(spreads[2]?.illustrationPrompt).toBe("Illustration prompt 1");
  });

  it("threads character bible continuity into illustration prompts when available", () => {
    const story = createStory(2);
    const spreads = composePrintBookSpreads({
      bookProjectId: "book-1",
      story,
      profile: createProfile(4),
      ageBand: "3-5",
      beats: deriveBeatsFromStory(story),
      characterBible: createCharacterBible(),
    });

    expect(spreads[0]?.illustrationPrompt).toContain(
      "Child appearance: Mila has curly dark hair and bright brown eyes."
    );
    expect(spreads[0]?.illustrationPrompt).toContain("Scene direction:");
    expect(spreads[2]?.illustrationPrompt).toContain(
      "Do not change: curly dark hair; yellow cardigan"
    );
    expect(spreads[2]?.illustrationPrompt).toContain("Illustration prompt 1");
  });
});
