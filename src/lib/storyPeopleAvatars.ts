import sharp from "sharp";
import type { StoryPerson } from "@/types";
import { storeBookAsset } from "@/lib/print-books/storage";

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const ALLOWED_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

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
    person.appearance ? `User appearance notes: ${person.appearance}.` : "",
    "Use the uploaded photo only as private visual reference for broad visible features, posture, colouring, and expression.",
    "Do not make a photorealistic portrait. Render a warm original bedtime storybook illustration with soft texture, gentle lighting, kind expression, and simple clean background.",
    "No text, watermark, logos, franchise styling, celebrity styling, or exact copy of clothing logos.",
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

export async function createStoryPersonAvatar(input: {
  person: StoryPerson;
  file: File;
}): Promise<{ avatarImageUrl: string; appearanceSummary: string }> {
  const validationError = validateStoryPersonPhoto(input.file);
  if (validationError) throw new Error(validationError);

  const normalizedPhoto = await normalizeUploadForOpenAI(input.file);
  const generated = await generateEditedImage({
    image: normalizedPhoto,
    prompt: buildAvatarPrompt(input.person),
  });
  const webImage = await sharp(generated)
    .resize(768, 768, { fit: "cover" })
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();

  const avatarImageUrl = await storeBookAsset({
    pathname: `story-people/${input.person.userId}/${input.person.id}/avatar.jpg`,
    body: webImage,
    contentType: "image/jpeg",
  });

  return {
    avatarImageUrl,
    appearanceSummary: buildStoryPersonAppearanceSummary(input.person),
  };
}
