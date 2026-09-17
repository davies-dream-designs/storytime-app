import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import type { BookProject, CharacterBible } from "@/types/printBook";
import type { ChildProfile, Story } from "@/types";

// Cliproxy (and other OpenAI-compatible proxies) ignore the requested `size` on
// /images/edits and return the aspect ratio of the attached reference sheet.
// Stretching that response into a square is what distorted trade-book art, so
// these tests drive the real generation path with real sharp.

const storedAssets: { pathname: string; body: Buffer }[] = [];

// A dark circle of known radius on a light field. Stretching a 2:1 image into a
// square doubles the shape's height (it becomes an ellipse); centre-cropping
// leaves it circular. Measuring the shape's width:height therefore detects
// distortion in a way that checking output dimensions alone cannot.
async function makeWideImageWithCircle(
  width: number,
  height: number
): Promise<Buffer> {
  const radius = Math.floor(height / 4);
  const svg = `<svg width="${width}" height="${height}">
    <rect width="${width}" height="${height}" fill="rgb(240,240,240)"/>
    <circle cx="${width / 2}" cy="${height / 2}" r="${radius}" fill="rgb(10,10,10)"/>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

// Measure the bounding box of the dark shape, in pixels.
async function measureDarkShape(
  image: Buffer
): Promise<{ width: number; height: number }> {
  const { data, info } = await sharp(image)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let minX = info.width;
  let maxX = -1;
  let minY = info.height;
  let maxY = -1;

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const offset = (y * info.width + x) * info.channels;
      if (data[offset] < 128) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  return { width: maxX - minX + 1, height: maxY - minY + 1 };
}

function createProject(): BookProject {
  return {
    id: "project-aspect",
    userId: "user-1",
    profileId: "profile-1",
    sourceStoryId: "story-1",
    status: "illustrating",
    ageBand: "3-5",
    spreadCount: 1,
    completedSpreads: 0,
    totalSpreads: 1,
    beats: [],
    spreads: [
      {
        id: "spread-cover",
        bookProjectId: "project-aspect",
        sequence: 1,
        layoutType: "cover",
        text: "",
        sceneBrief: "Cover scene",
      },
    ],
    assets: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as unknown as BookProject;
}

function createStory(): Story {
  return {
    id: "story-1",
    title: "A Square Story",
    theme: "gentle bedtime adventure",
    content: "Once upon a time.",
  } as unknown as Story;
}

function createProfile(): ChildProfile {
  return { id: "profile-1", name: "River", age: 8 } as unknown as ChildProfile;
}

function createBible(): CharacterBible {
  return {
    palette: "warm ambers",
    doNotChange: ["River's face"],
    outfitRules: "blue henley and mustard overalls",
    renderStyle: "painterly picture-book illustration",
    lightingTone: "golden hour",
    recurringProps: [],
    childAppearance: "An 8-year-old child with wavy dark-brown hair.",
    companionCharacters: [],
    lockedCharacterRules: [],
  } as unknown as CharacterBible;
}

describe("provider responses that ignore the requested size", () => {
  beforeEach(() => {
    vi.resetModules();
    storedAssets.length = 0;
    process.env.OPENAI_API_KEY = "test-key";
    delete process.env.OPENAI_IMAGE_MODEL;

    vi.doMock("@/lib/print-books/storage", () => ({
      isBookAssetStorageConfigured: () => true,
      storeBookAsset: vi.fn(async (input: { pathname: string; body: Buffer }) => {
        storedAssets.push({ pathname: input.pathname, body: input.body });
        return `https://blob.test/${input.pathname}`;
      }),
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("stores square, undistorted art when the provider returns a 2:1 image", async () => {
    const wide = await makeWideImageWithCircle(1774, 887);
    const source = await measureDarkShape(wide);
    expect(source.width / source.height).toBeCloseTo(1, 1);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({ data: [{ b64_json: wide.toString("base64") }] }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
    );

    const { generateCoverIllustration } = await import(
      "@/lib/print-books/illustrations"
    );

    await generateCoverIllustration({
      project: createProject(),
      story: createStory(),
      profile: createProfile(),
      characterBible: createBible(),
    });

    expect(storedAssets.length).toBeGreaterThan(0);

    for (const asset of storedAssets) {
      const metadata = await sharp(asset.body).metadata();
      expect({
        pathname: asset.pathname,
        square: metadata.width === metadata.height,
      }).toEqual({ pathname: asset.pathname, square: true });

      // The circle must still be a circle. Stretching a 2:1 source into a
      // square would render it as a ~1:2 ellipse.
      const shape = await measureDarkShape(asset.body);
      expect(shape.width / shape.height).toBeCloseTo(1, 1);
    }
  });
});
