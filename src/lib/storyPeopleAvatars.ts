import sharp from "sharp";
import Anthropic from "@anthropic-ai/sdk";
import type { ChildProfile, StoryPerson } from "@/types";
import { buildChildAppearanceSummary } from "@/types";
import { deleteBookAssetUrls, storeBookAsset } from "@/lib/print-books/storage";

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const ALLOWED_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const anthropic = new Anthropic();

type PhotoAnalysis = {
  appearance: string;
  appearanceSummary: string;
};

export function validateStoryPersonPhoto(file: File): string | null {
  if (!ALLOWED_CONTENT_TYPES.has(file.type)) {
    return "Please upload a JPG, PNG, or WebP photo.";
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return "Please upload a photo under 8 MB.";
  }
  return null;
}

function buildAvatarPrompt(person: StoryPerson): string {
  const subject =
    person.relationship === "pet"
      ? "beloved family pet"
      : `${person.relationship} or family friend`;

  return [
    `Create a square Storycot-style illustrated character reference of this ${subject}.`,
    `Display name: ${person.name}.`,
    person.pronouns ? `Pronouns: ${person.pronouns}.` : "",
    person.description ? `Role notes: ${person.description}.` : "",
    person.personality ? `Personality: ${person.personality}.` : "",
    "Use the uploaded photo only as private visual reference for broad visible body, face, hair or fur, posture, colouring, and expression.",
    "Treat the uploaded photo as the visual source of truth. Do not exaggerate body shape, age, expression, or proportions from written profile notes.",
    "Do not copy any clothing graphics, logos, printed text, costumes, branded characters, franchise characters, toy characters, mascot art, or recognisable protected designs visible in the photo.",
    "For people, use a head-and-shoulders portrait with a plain unbranded jumper or top in a gentle Storycot palette. If the photo shows character-print clothing, replace it with simple solid-colour clothing with no graphics or lettering.",
    "Match Storycot illustrated-book continuity: warm watercolour children's-book rendering, soft bedtime palette, gentle paper texture, expressive kind face, simple rounded shapes, cosy lighting, and a clean uncluttered background.",
    "Make it suitable as a reusable character reference for Storycot hardcover interiors and child profile illustrations: square crop, head-and-shoulders person portrait or full pet pose, clear visible features, stable unbranded outfit or pet markings, no scene-specific props unless requested.",
    "Do not make a photorealistic portrait, caricature, sticker, logo, toy packaging image, or social-media avatar.",
    "No text, watermark, logos, franchise styling, celebrity styling, recognisable character prints, or exact copy of clothing designs.",
  ]
    .filter(Boolean)
    .join(" ");
}

function buildChildAvatarPrompt(
  profile: ChildProfile,
  analysis: PhotoAnalysis
): string {
  return [
    "Create a square Storycot-style illustrated child profile reference.",
    `Child name: ${profile.name}.`,
    `Age: ${profile.age}.`,
    profile.gender ? `Gender/pronoun setting: ${profile.gender}.` : "",
    analysis.appearance
      ? `Photo-derived visible notes: ${analysis.appearance}.`
      : "",
    "Use the uploaded photo only as private visual reference for broad visible face, hair, posture, colouring, and expression.",
    "Treat the uploaded photo as the visual source of truth. Do not exaggerate body shape, age, expression, or proportions from written profile notes.",
    "Do not copy any clothing graphics, logos, printed text, costumes, branded characters, franchise characters, toy characters, mascot art, or recognisable protected designs visible in the photo.",
    "Match Storycot illustrated-book continuity: warm watercolour children's-book rendering, soft bedtime palette, gentle paper texture, expressive kind face, simple rounded shapes, cosy lighting, and a clean uncluttered background.",
    "Make it suitable as a reusable child reference for Storycot hardcover interiors: square crop, plain unbranded child-safe clothing in a gentle Storycot palette, clear visible features, stable outfit guidance, no scene-specific props unless already in the profile.",
    "Do not make a photorealistic portrait, caricature, sticker, logo, toy packaging image, or social-media avatar.",
    "No text, watermark, logos, franchise styling, celebrity styling, recognisable character prints, or exact copy of clothing designs.",
  ]
    .filter(Boolean)
    .join(" ");
}

async function normalizeUploadForOpenAI(file: File): Promise<Buffer> {
  const input = Buffer.from(await file.arrayBuffer());
  return sharp(input)
    .rotate()
    .resize(1024, 1024, {
      fit: "cover",
      position: "attention",
    })
    .png({ compressionLevel: 8 })
    .toBuffer();
}

async function generateEditedImage(input: {
  image: Buffer;
  prompt: string;
}): Promise<Buffer> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");

  const formData = new FormData();
  const imageArrayBuffer = input.image.buffer.slice(
    input.image.byteOffset,
    input.image.byteOffset + input.image.byteLength
  ) as ArrayBuffer;
  formData.append(
    "image",
    new File([imageArrayBuffer], "storycot-reference.png", {
      type: "image/png",
    })
  );
  formData.append(
    "model",
    process.env.OPENAI_AVATAR_IMAGE_MODEL ?? "gpt-image-1"
  );
  formData.append("prompt", input.prompt);
  formData.append("size", "1024x1024");
  formData.append("quality", "medium");

  const response = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `OpenAI avatar generation failed: ${response.status} ${body}`
    );
  }

  const payload = (await response.json()) as {
    data?: Array<{ b64_json?: string }>;
  };
  const base64 = payload.data?.[0]?.b64_json;
  if (!base64) throw new Error("OpenAI avatar generation returned no image");
  return Buffer.from(base64, "base64");
}

function parseAnalysis(raw: string): PhotoAnalysis {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned) as PhotoAnalysis;
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) {
      return { appearance: "", appearanceSummary: "" };
    }
    try {
      return JSON.parse(match[0]) as PhotoAnalysis;
    } catch {
      return { appearance: "", appearanceSummary: "" };
    }
  }
}

async function analyzePhoto(input: {
  image: Buffer;
  subject: string;
}): Promise<PhotoAnalysis> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { appearance: "", appearanceSummary: "" };
  }

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 700,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/png",
                data: input.image.toString("base64"),
              },
            },
            {
              type: "text",
              text: `Describe only visible, non-sensitive appearance details that help keep this ${input.subject} consistent in original Storycot bedtime illustrations. Do not identify the person, infer ethnicity, health, personality, age beyond broad child/adult if obvious, or any sensitive trait. Ignore and do not name any logos, text, brand marks, franchise characters, toy characters, mascot art, costumes, or clothing graphics; for clothing mention only plain generic colour/type if useful. Do not mention the photo or camera. Return only JSON:
{
  "appearance": "one concise sentence of visible features, hair/fur/markings, plain generic clothing colour/type if useful, accessories, and expression, with no brands or character prints",
  "appearanceSummary": "short reusable illustration reference summary"
}`,
            },
          ],
        },
      ],
    });

    const content = message.content[0];
    if (content?.type !== "text")
      return { appearance: "", appearanceSummary: "" };
    const parsed = parseAnalysis(content.text);
    return {
      appearance: (parsed.appearance ?? "").trim().slice(0, 400),
      appearanceSummary: (parsed.appearanceSummary ?? "").trim().slice(0, 400),
    };
  } catch (err) {
    console.warn("Photo analysis failed; continuing without auto notes.", {
      error: err instanceof Error ? err.message : String(err),
    });
    return { appearance: "", appearanceSummary: "" };
  }
}

export function buildStoryPersonAppearanceSummary(person: StoryPerson): string {
  return [
    person.appearance.trim(),
    person.personality.trim()
      ? `Personality: ${person.personality.trim()}.`
      : "",
    person.relationship ? `Relationship: ${person.relationship}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

async function deletePreviousReference(url?: string) {
  if (!url) return;
  try {
    await deleteBookAssetUrls([url]);
  } catch (err) {
    console.warn("Could not delete previous illustrated reference.", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function createStoryPersonAvatar(input: {
  person: StoryPerson;
  file: File;
}): Promise<{
  avatarImageUrl: string;
  appearance: string;
  appearanceSummary: string;
}> {
  const validationError = validateStoryPersonPhoto(input.file);
  if (validationError) throw new Error(validationError);

  const normalizedPhoto = await normalizeUploadForOpenAI(input.file);
  const analysis = await analyzePhoto({
    image: normalizedPhoto,
    subject: input.person.relationship === "pet" ? "pet" : "person",
  });
  const generated = await generateEditedImage({
    image: normalizedPhoto,
    prompt: [
      buildAvatarPrompt(input.person),
      analysis.appearance
        ? `Additional visible reference details from photo: ${analysis.appearance}.`
        : "",
    ]
      .filter(Boolean)
      .join(" "),
  });
  const webImage = await sharp(generated)
    .resize(768, 768, { fit: "cover" })
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();

  const avatarImageUrl = await storeBookAsset({
    pathname: `story-people/${input.person.userId}/${input.person.id}/avatar-${Date.now()}.jpg`,
    body: webImage,
    contentType: "image/jpeg",
  });

  await deletePreviousReference(input.person.avatarImageUrl);

  const appearance = analysis.appearance || input.person.appearance.trim();

  return {
    avatarImageUrl,
    appearance,
    appearanceSummary:
      analysis.appearanceSummary ||
      buildStoryPersonAppearanceSummary({ ...input.person, appearance }),
  };
}

export async function createChildProfileAvatar(input: {
  profile: ChildProfile;
  file: File;
}): Promise<{
  avatarImageUrl: string;
  appearanceSummary: string;
  consistencyNote?: string;
}> {
  const validationError = validateStoryPersonPhoto(input.file);
  if (validationError) throw new Error(validationError);

  const normalizedPhoto = await normalizeUploadForOpenAI(input.file);
  const analysis = await analyzePhoto({
    image: normalizedPhoto,
    subject: "child",
  });
  const generated = await generateEditedImage({
    image: normalizedPhoto,
    prompt: buildChildAvatarPrompt(input.profile, analysis),
  });
  const webImage = await sharp(generated)
    .resize(768, 768, { fit: "cover" })
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();

  const avatarImageUrl = await storeBookAsset({
    pathname: `profiles/${input.profile.userId}/${input.profile.id}/avatar-${Date.now()}.jpg`,
    body: webImage,
    contentType: "image/jpeg",
  });

  await deletePreviousReference(input.profile.avatarImageUrl);

  return {
    avatarImageUrl,
    appearanceSummary:
      analysis.appearanceSummary ||
      buildChildAppearanceSummary(input.profile.appearance) ||
      "",
    consistencyNote: analysis.appearance || undefined,
  };
}
