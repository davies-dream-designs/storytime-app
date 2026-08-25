import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";
import {
  generateEditedImage,
  normalizeUploadForOpenAI,
} from "@/lib/storyPeopleAvatars";
import { storeBookAsset } from "@/lib/print-books/storage";
import { buildLocationDirection } from "@/lib/print-books/locationBible";
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
  "fixedElements" | "lighting" | "palette" | "notes" | "summary"
> & { name?: string; place?: string };

function displayName(location: LocationLike): string {
  return (
    location.name?.trim() ||
    location.place?.trim() ||
    "this place"
  );
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
              text: `Describe only the physical layout of this place so it can be redrawn consistently in a children's picture book. State the main fixed furniture and large objects, their positions relative to each other and to the walls/room, and which way they face. Note windows, doors, and the dominant colours and lighting direction. Do not describe or identify any people, pets, faces, logos, text, brand marks, or franchise/toy characters. Do not mention the photo or camera. Return one concise paragraph of plain description.`,
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

function buildEstablishingPromptFromPhotos(
  location: LocationLike,
  photoNotes: string[]
): string {
  const notes = photoNotes.filter(Boolean);
  return [
    `A children's picture-book establishing illustration of "${displayName(location)}" — the empty space with no people, pets, or characters.`,
    "Draw the whole space in a neutral, eye-level, straight-on view so it can be the canonical reference for this location.",
    notes.length
      ? `Match this real layout captured from ${
          notes.length > 1 ? `${notes.length} reference photos` : "a reference photo"
        } (fuse them into one coherent room, keeping each object's position and the direction it faces): ${notes.join(" | ")}`
      : "",
    buildLocationDirection(location as SceneLocation),
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
