import { describe, expect, it } from "vitest";
import {
  buildChildAppearanceDoNotChange,
  buildChildAppearanceSummary,
  getStoryPersonAppearanceContext,
  sanitizeChildAppearance,
} from "@/types";
import { getBodyBuildIllustrationCue } from "@/types/bodyBuild";

describe("child appearance custom details", () => {
  it("uses custom labels for selected other values in summaries", () => {
    const appearance = sanitizeChildAppearance({
      hairColor: "other",
      bodyBuild: "large",
      customHairColor: "strawberry blonde",
      hairTexture: "wavy",
      hairStyles: ["other"],
      customHairStyle: "two tiny buns",
      eyeColor: "other",
      customEyeColor: "blue-grey",
      featureEmphasis: ["wide_eyes", "other"],
      customFeatureEmphasis: "strong eyebrows",
      distinguishingFeatures: ["other"],
      customDistinguishingFeature: "small eyebrow scar",
      favoriteClothingItem: "other",
      customFavoriteClothingItem: "yellow gumboots",
    });

    expect(buildChildAppearanceSummary(appearance)).toContain(
      "large body build"
    );
    expect(buildChildAppearanceSummary(appearance)).toContain(
      "strawberry blonde wavy hair"
    );
    expect(buildChildAppearanceSummary(appearance)).toContain(
      "usually styled in two tiny buns"
    );
    expect(buildChildAppearanceSummary(appearance)).toContain(
      "blue-grey eyes"
    );
    expect(buildChildAppearanceSummary(appearance)).toContain(
      "features include wide eyes, strong eyebrows"
    );
    expect(buildChildAppearanceSummary(appearance)).toContain(
      "distinguishing details: small eyebrow scar"
    );
    expect(buildChildAppearanceSummary(appearance)).toContain(
      "often shown with yellow gumboots"
    );
    expect(buildChildAppearanceDoNotChange(appearance)).toContain(
      "large body build"
    );
    expect(buildChildAppearanceDoNotChange(appearance)).toContain(
      "small eyebrow scar"
    );
  });

  it("drops custom details when other is not selected", () => {
    const appearance = sanitizeChildAppearance({
      hairColor: "blonde",
      customHairColor: "purple",
      hairStyles: ["loose"],
      customHairStyle: "mohawk",
      eyeColor: "blue",
      customEyeColor: "gold",
    });

    expect(appearance.customHairColor).toBeUndefined();
    expect(appearance.customHairStyle).toBeUndefined();
    expect(appearance.customEyeColor).toBeUndefined();
    expect(buildChildAppearanceSummary(appearance)).not.toContain("purple");
    expect(buildChildAppearanceSummary(appearance)).not.toContain("mohawk");
    expect(buildChildAppearanceSummary(appearance)).not.toContain("gold");
  });

  it("uses distinct illustration cues for large and very large builds", () => {
    expect(getBodyBuildIllustrationCue("large")).toContain("fuller frame");
    expect(getBodyBuildIllustrationCue("large")).not.toContain("plus-size");
    expect(getBodyBuildIllustrationCue("very_large")).toContain("plus-size");
    expect(getBodyBuildIllustrationCue("very_large")).toContain(
      "visibly larger proportions than a large build"
    );
  });

  it("prioritizes latest edited story-person appearance over generated summaries", () => {
    const context = getStoryPersonAppearanceContext({
      id: "person-1",
      userId: "user-1",
      name: "Glenpa",
      relationship: "grandparent",
      bodyBuild: "very_large",
      description: "",
      personality: "",
      appearance: "grey hair tied in a neat man bun",
      appearanceSummary: "shoulder-length wavy grey hair",
      availableToAllProfiles: true,
      profileIds: [],
      createdAt: "2026-08-10T00:00:00.000Z",
      updatedAt: "2026-08-10T00:00:00.000Z",
    });

    expect(context.indexOf("grey hair tied in a neat man bun")).toBeLessThan(
      context.indexOf("shoulder-length wavy grey hair")
    );
    expect(context).toContain(
      "Previous generated reference summary, use only when it does not conflict"
    );
  });
});
