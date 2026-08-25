import { describe, expect, it, beforeEach } from "vitest";
import sharp from "sharp";
import {
  buildEstablishingPromptFromPhotos,
  generateLocationEstablishingFromPhotos,
} from "@/lib/print-books/locationEstablishing";
import type { LocationFixture } from "@/types/printBook";

function makeFixture(): LocationFixture {
  return {
    id: "f1",
    userId: "user-1",
    place: "Levi's bedroom",
    area: undefined,
    summary: "",
    notes: undefined,
    referenceImageUrl: undefined,
    establishingImageUrl: undefined,
    fixedElements: [],
    doNotChange: [],
    lighting: undefined,
    palette: undefined,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

async function pngFile(): Promise<File> {
  const png = await sharp({
    create: {
      width: 8,
      height: 8,
      channels: 3,
      background: { r: 200, g: 180, b: 160 },
    },
  })
    .png()
    .toBuffer();
  return new File([png], "room.png", { type: "image/png" });
}

describe("buildEstablishingPromptFromPhotos", () => {
  it("treats family nursery notes as an authoritative layout checklist", () => {
    const fixture = makeFixture();
    fixture.place = "Home";
    fixture.area = "Nursery";
    fixture.summary = "Bailey and Levi's room";
    fixture.notes =
      "Bailey's bed on left, rug in front of dresser in the middle up against the wall, window on right next to Levi's cot.";
    fixture.fixedElements = [
      "Bailey's bed on left",
      "dresser in the middle up against the wall",
      "window on right next to Levi's cot",
    ];

    const prompt = buildEstablishingPromptFromPhotos(fixture, [
      "A bedroom with a bed, dresser, rug, right-side window, and baby cot.",
    ]);

    expect(prompt).toContain("AUTHORITATIVE FAMILY LAYOUT BLUEPRINT");
    expect(prompt).toContain("highest priority");
    expect(prompt).toContain("pass/fail checklist");
    expect(prompt).toContain("window is on the right next to a cot");
    expect(prompt).toContain("draw the window on the right next to that cot");
    expect(prompt).toContain("child's bed is on the left");
    expect(prompt).toContain("draw that bed on the left");
    expect(prompt).toContain("Do not mirror the room");
    expect(prompt).toContain("not a decorative nursery concept");
  });

  it("explicitly prevents older-child beds from becoming cots while generating the location illustration", () => {
    const fixture = makeFixture();
    fixture.place = "Home";
    fixture.area = "Nursery";
    fixture.notes =
      "Bailey's Kura bed on the left and Levi's cot on the right.";

    const prompt = buildEstablishingPromptFromPhotos(fixture, []);

    expect(prompt).toContain("Sleep-furniture guardrail");
    expect(prompt).toContain(
      "older child's bed stays an open single/Kura-style bed"
    );
    expect(prompt).toContain("must not become a cot");
    expect(prompt).toContain(
      "This rule applies while generating the saved location illustration itself"
    );
  });
});

describe("generateLocationEstablishingFromPhotos", () => {
  beforeEach(() => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
  });

  it("requires at least one photo", async () => {
    await expect(
      generateLocationEstablishingFromPhotos({
        location: makeFixture(),
        files: [],
        pathnamePrefix: "location-fixtures/user-1/f1",
      })
    ).rejects.toThrow(/at least one photo/i);
  });

  it("fails clearly when image generation is not configured", async () => {
    await expect(
      generateLocationEstablishingFromPhotos({
        location: makeFixture(),
        files: [await pngFile()],
        pathnamePrefix: "location-fixtures/user-1/f1",
      })
    ).rejects.toThrow(/OPENAI_API_KEY/);
  });
});
