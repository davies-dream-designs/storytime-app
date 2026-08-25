import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";
import {
  generateEditedImage,
  normalizeUploadForOpenAI,
} from "@/lib/storyPeopleAvatars";
import { storeBookAsset } from "@/lib/print-books/storage";
import {
  buildLocationDirection,
  buildSleepFurnitureDirection,
} from "@/lib/print-books/locationBible";
import type { LocationFixture, SceneLocation } from "@/types/printBook";

/**
 * Turn one or more parent photos of a place into a single reusable
 * "establishing" illustration. The raw photos are analysed and used to seed the
 * drawing, then discarded — only the generated illustration is persisted, the
 * same privacy model as story-people avatars. Locations differ from people in
 * that a space often needs several angles to pin down its layout, so this
 * accepts multiple photos and fuses them into one canonical view.
 */

type LocationLike = Pick<
  SceneLocation | LocationFixture,
  "fixedElements" | "doNotChange" | "lighting" | "palette" | "notes" | "summary"
> & { name?: string; place?: string; area?: string };

function displayName(location: LocationLike): string {
  const base = location.name?.trim() || location.place?.trim() || "this place";
  const area = location.area?.trim();
  return area && !base.toLowerCase().includes(area.toLowerCase())
    ? `${base} (${area})`
    : base;
}

function compactList(values: Array<string | undefined>, maxLength: number) {
  const text = values
    .map((value) => value?.trim())
    .filter(Boolean)
    .join("; ");
  return text.length <= maxLength
    ? text
    : `${text.slice(0, maxLength).trim()}…`;
}

function buildHardLayoutBlueprint(location: LocationLike): string {
  const summary = location.summary?.trim();
  const notes = location.notes?.trim();
  const fixedElements = compactList(location.fixedElements ?? [], 900);
  const doNotChange = compactList(location.doNotChange ?? [], 600);
  const lighting = location.lighting?.trim();
  const palette = location.palette?.trim();
  const blueprint = compactList(
    [
      summary ? `summary: ${summary}` : undefined,
      notes ? `family notes: ${notes}` : undefined,
      fixedElements ? `fixed elements: ${fixedElements}` : undefined,
      doNotChange ? `must not change: ${doNotChange}` : undefined,
      lighting ? `lighting: ${lighting}` : undefined,
      palette ? `colours: ${palette}` : undefined,
    ],
    1800
  );
  if (!blueprint) return "";
  return `AUTHORITATIVE FAMILY LAYOUT BLUEPRINT — highest priority, even over generic nursery/bedroom conventions and over any ambiguous photo analysis: ${blueprint}. Treat every comma-separated or sentence-level detail as a pass/fail checklist. Place every named object exactly where the family says it belongs; preserve left/right/centre, beside/next-to/under/above, window/door placement, furniture type, furniture size, colour, and facing direction. If a detail says a window is on the right next to a cot, draw the window on the right next to that cot. If a detail says a child's bed is on the left, draw that bed on the left. Do not replace, merge, mirror, resize, or reinterpret these objects for a prettier composition.`;
}

async function analyzeLocationPhoto(image: Buffer): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY) return "";
  try {
    const anthropic = new Anthropic();
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 500,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/png",
                data: image.toString("base64"),
              },
            },
            {
              type: "text",
              text: `Describe only the physical layout of this place so it can be redrawn consistently in a children's picture book. State the main fixed furniture and large objects, their exact positions relative to each other and to the walls/room, and which way they face. Be very literal about sleep furniture: distinguish a normal child's bed, Kura-style bed, bunk bed, toddler bed, cot, crib, bassinet, and mattress; do not call every bed a crib. Note windows, doors, rugs, dressers, and the dominant colours and lighting direction, including left/right placement. Do not describe or identify any people, pets, faces, logos, text, brand marks, or franchise/toy characters. Do not mention the photo or camera. Return one concise paragraph of plain description.`,
            },
          ],
        },
      ],
    });
    const content = message.content[0];
    if (content?.type !== "text") return "";
    return content.text.trim().slice(0, 700);
  } catch (err) {
    console.warn("Location photo analysis failed; continuing.", {
      error: err instanceof Error ? err.message : String(err),
    });
    return "";
  }
}

export function buildEstablishingPromptFromPhotos(
  location: LocationLike,
  photoNotes: string[]
): string {
  const notes = photoNotes.filter(Boolean);
  const hardBlueprint = buildHardLayoutBlueprint(location);
  const sleepFurnitureDirection = buildSleepFurnitureDirection(
    location as SceneLocation
  );
  return [
    `A literal children's picture-book establishing illustration of "${displayName(location)}" — the empty space with no people, pets, or characters.`,
    "Primary goal: create an accurate, reviewable setting reference, not a decorative nursery concept. Accuracy of layout and object identity is more important than charm or a convenient composition.",
    hardBlueprint,
    sleepFurnitureDirection
      ? `${sleepFurnitureDirection} This rule applies while generating the saved location illustration itself, not only later book pages.`
      : "",
    notes.length
      ? `Use the attached source photo as the visual anchor, and match this real layout captured from ${
          notes.length > 1
            ? `${notes.length} reference photos`
            : "a reference photo"
        } (fuse them into one coherent room, keeping each object's position and the direction it faces): ${notes.join(" | ")}`
      : "Use the attached source photo as the visual anchor. Keep the real furniture types, object positions, and window/door layout from the photo instead of inventing a generic room.",
    buildLocationDirection(location as SceneLocation),
    "Use a neutral, eye-level, straight-on or very slight three-quarter view that shows the whole space clearly. Do not mirror the room. Do not invent extra windows, doors, beds, cots, dressers, wall art, lamps, rugs, or shelves. Do not hide important furniture behind curtains or crop it out.",
    "Soft, warm, storybook style. No text, no watermark, no people, no characters.",
  ]
    .filter(Boolean)
    .join(" ");
}

export type LocationEstablishingResult = {
  establishingImageUrl: string;
};

/**
 * Generate and persist an establishing illustration for a location from one or
 * more uploaded photos. Photos are never stored. `pathnamePrefix` scopes the
 * stored asset (e.g. `location-fixtures/<user>/<id>` or
 * `book-locations/<user>/<project>/<locationId>`).
 */
export async function generateLocationEstablishingFromPhotos(input: {
  location: LocationLike;
  files: File[];
  pathnamePrefix: string;
}): Promise<LocationEstablishingResult> {
  const { location, files, pathnamePrefix } = input;
  if (files.length === 0) {
    throw new Error("At least one photo is required");
  }
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const normalized = await Promise.all(
    files.map((file) => normalizeUploadForOpenAI(file))
  );
  const photoNotes = await Promise.all(
    normalized.map((image) => analyzeLocationPhoto(image))
  );

  const prompt = buildEstablishingPromptFromPhotos(location, photoNotes);
  // Seed the drawing with the first (primary) photo; the fused notes carry the
  // detail from the remaining angles.
  const generated = await generateEditedImage({
    image: normalized[0],
    prompt,
  });

  const illustration = await sharp(generated)
    .resize(1024, 1024, { fit: "cover" })
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();

  const establishingImageUrl = await storeBookAsset({
    pathname: `${pathnamePrefix}-establishing-${Date.now()}.jpg`,
    body: illustration,
    contentType: "image/jpeg",
  });

  return { establishingImageUrl };
}
