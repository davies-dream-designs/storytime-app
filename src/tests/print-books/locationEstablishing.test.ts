import { describe, expect, it, beforeEach } from "vitest";
import sharp from "sharp";
import { generateLocationEstablishingFromPhotos } from "@/lib/print-books/locationEstablishing";
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
