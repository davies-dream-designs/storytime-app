import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import {
  buildEstablishingPromptFromPhotos,
  generateLocationEstablishingFromPhotos,
  normalizeLocationPhotoForOpenAI,
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

function bufferFile(buffer: Buffer): File {
  const arrayBuffer = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength
  ) as ArrayBuffer;
  return { arrayBuffer: async () => arrayBuffer } as File;
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
  return bufferFile(png);
}

async function wideRoomFile(): Promise<File> {
  const png = await sharp({
    create: {
      width: 1600,
      height: 900,
      channels: 3,
      background: { r: 40, g: 90, b: 160 },
    },
  })
    .png()
    .toBuffer();
  return bufferFile(png);
}

async function generatedPngBase64(): Promise<string> {
  const png = await sharp({
    create: {
      width: 16,
      height: 16,
      channels: 3,
      background: { r: 200, g: 180, b: 160 },
    },
  })
    .png()
    .toBuffer();
  return png.toString("base64");
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
    expect(prompt).toContain("do not rotate, mirror, re-stage");
    expect(prompt).toContain("The attached photo is the source of truth");
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

  it("supports saved locations with no optional summary", () => {
    const fixture = makeFixture();
    fixture.place = "Home";
    fixture.area = "Kitchen";
    fixture.summary = undefined;
    fixture.notes =
      "Window above the sink, range hood above the oven, microwave in the left far corner.";

    const prompt = buildEstablishingPromptFromPhotos(fixture, [
      "A kitchen with a sink, oven, microwave, and fridge.",
    ]);

    expect(prompt).toContain("Home (Kitchen)");
    expect(prompt).toContain("Window above the sink");
    expect(prompt).not.toContain("undefined");
  });
});

describe("generateLocationEstablishingFromPhotos", () => {
  beforeEach(() => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.BLOB_READ_WRITE_TOKEN;
    delete process.env.PREVIEW_READ_WRITE_TOKEN;
    delete process.env.PROD_READ_WRITE_TOKEN;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
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


  it("does not attention-crop wide room photos", async () => {
    const imageBuffer = await normalizeLocationPhotoForOpenAI(
      await wideRoomFile()
    );
    const metadata = await sharp(imageBuffer).metadata();
    expect(metadata.width).toBe(1024);
    expect(metadata.height).toBe(1024);

    const topLeftPixel = await sharp(imageBuffer)
      .extract({ left: 0, top: 0, width: 1, height: 1 })
      .raw()
      .toBuffer();
    expect([...topLeftPixel.slice(0, 3)]).toEqual([246, 240, 229]);
  });

  it("requests high-fidelity edits for location renders", async () => {
    process.env.OPENAI_API_KEY = "test-openai";
    const generatedBase64 = await generatedPngBase64();
    const fetchMock = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      const body = init?.body;
      expect(body).toBeInstanceOf(FormData);
      const form = body as FormData;
      expect(form.get("quality")).toBe("high");
      expect(form.get("input_fidelity")).toBe("high");
      expect(form.get("image")).toBeTruthy();

      return new Response(
        JSON.stringify({ data: [{ b64_json: generatedBase64 }] }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      generateLocationEstablishingFromPhotos({
        location: makeFixture(),
        files: [await wideRoomFile()],
        pathnamePrefix: "location-fixtures/user-1/f1",
      })
    ).resolves.toMatchObject({
      establishingImageUrl: expect.stringMatching(/^data:image\/jpeg;base64,/),
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
