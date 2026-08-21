import sharp from "sharp";
import Anthropic from "@anthropic-ai/sdk";
import type { ChildProfile, StoryPerson } from "@/types";
import {
  buildChildAppearanceSummary,
  getAgeInMonths,
  getBodyBuildLabel,
  getStoryPersonAgeGroupLabel,
  getStoryPersonHeightLabel,
  getStoryPersonRelationshipLabel,
} from "@/types";
import { deleteBookAssetUrls, storeBookAsset } from "@/lib/print-books/storage";

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const ALLOWED_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export type PhotoAnalysis = {
  appearance: string;
  appearanceSummary: string;
};

const NO_VISIBLE_TEXT_IN_REFERENCE =
  "The image must contain only the illustrated subject and simple background. Do not include any written words, letters, numbers, labels, UI text, signs, captions, name tags, initials, age labels, pronouns, relationship labels, speech bubbles, or watermarks.";

// Identity features the model most often loses or restyles: real hair/eyebrow/
// facial-hair colour drifts warm to match the palette, and subtle clear
// eyeglasses get "cleaned up" out of the portrait. These must be locked to the
// supplied photo and kept out of the palette's reach, or every downstream book
// page inherits the wrong likeness from the seed reference.
const IDENTITY_LOCK_WITH_PHOTO =
  "Identity lock, highest priority: match the subject's real hair colour, eyebrow colour, facial-hair colour, skin tone, and eye colour exactly as they appear in the supplied photo. Never warm-tint, redden, lighten, or otherwise shift hair, eyebrow, beard, skin, or eye colour to fit the bedtime palette; apply the warm Storycot palette only to background, clothing, and lighting, never to hair, skin, or eyes. If the subject wears eyeglasses in the photo, keep the same glasses as a permanent identity feature with the same frame shape and clarity; never remove or omit them. Preserve visible facial hair shape and coverage as shown.";

const IDENTITY_LOCK_FROM_DESCRIPTION =
  "Identity lock, highest priority: match the written hair colour, skin tone, and eye colour exactly. Never warm-tint, redden, or lighten hair, eyebrows, beard, skin, or eyes to fit the bedtime palette; apply the warm Storycot palette only to background, clothing, and lighting. If the description mentions glasses, keep them as a permanent identity feature and never omit them.";

function formatAdjustmentInstruction(adjustment?: string): string {
  const clean = adjustment?.trim().slice(0, 240);
  if (!clean) return "";

  if (
    /\b(text|word|words|label|labels|caption|captions|name|names|pronoun|pronouns|letter|letters|number|numbers|age|mumma|mama|mum|mummy|dad|daddy|he\/|she\/|they\/)\b/i.test(
      clean
    )
  ) {
    return "Correction instruction only: remove all visible writing, labels, name tags, pronouns, letters, numbers, captions, and age/name text from the image. Do not add replacement text.";
  }

  return `Correction instruction only, never text to draw: ${clean}. If the instruction mentions words, labels, names, pronouns, letters, or numbers, remove or avoid those visible marks rather than reproducing them.`;
}

function getChildDrawingStage(profile: ChildProfile): string {
  const months = getAgeInMonths(profile);
  if (months < 12) return "baby proportions";
  if (months < 36) return "toddler proportions";
  if (months < 60) return "preschool child proportions";
  return "young child proportions";
}

export function validateStoryPersonPhoto(file: File): string | null {
  if (!ALLOWED_CONTENT_TYPES.has(file.type)) {
    return "Please upload a JPG, PNG, or WebP photo.";
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return "Please upload a photo under 8 MB.";
  }
  return null;
}

export function buildStoryPersonAvatarPrompt(
  person: StoryPerson,
  adjustment?: string
): string {
  const subject =
    person.relationship === "pet"
      ? "beloved family pet"
      : "family member or friend";

  return [
    NO_VISIBLE_TEXT_IN_REFERENCE,
    `Create a square Storycot-style illustrated character reference of this ${subject}.`,
    IDENTITY_LOCK_WITH_PHOTO,
    `Relationship context: ${getStoryPersonRelationshipLabel(person)}.`,
    "Use relationship, name, and pronoun data only as private context outside the image; never draw words, labels, or name tags.",
    person.description
      ? `Role notes for behaviour/context only: ${person.description}.`
      : "",
    person.personality ? `Personality: ${person.personality}.` : "",
    person.ageGroup && person.ageGroup !== "not_specified"
      ? `Age group context: ${getStoryPersonAgeGroupLabel(person.ageGroup)}. Preserve this broad life stage without making the person look older or younger than requested.`
      : "",
    person.height && person.height !== "not_specified"
      ? `Height context: ${getStoryPersonHeightLabel(person.height)}. Preserve this as a relative height cue for reusable story scenes.`
      : "",
    person.bodyBuild && person.bodyBuild !== "not_specified"
      ? `Body build context: ${getBodyBuildLabel(person.bodyBuild)}. Preserve this as a respectful broad body-shape cue without exaggerating it.`
      : "",
    person.bodyBuild === "large"
      ? "Large means moderately fuller-than-average, not very large or oversized."
      : "",
    person.bodyBuild === "very_large"
      ? "Very Large means clearly plus-size and fuller than Large."
      : "",
    formatAdjustmentInstruction(adjustment),
    "Use the supplied image only as private visual reference for broad visible body, face, hair or fur, posture, colouring, and expression.",
    "Treat the supplied image as visual source of truth for identity, but latest written age, height, hairstyle, facial hair, glasses, outfit, and body build override stale generated details when they conflict.",
    "Do not exaggerate body shape, age, expression, or proportions from either the image or written profile notes.",
    "Do not infer a larger body from loose, baggy, oversized, or bulky clothing; judge build from the face, neck, and visible frame and keep a natural, non-exaggerated build. If another person or pet overlaps the subject's body in the photo, do not add bulk where they were.",
    "Do not copy any clothing graphics, logos, printed text, costumes, branded characters, franchise characters, toy characters, mascot art, or recognisable protected designs visible in the photo.",
    "For people, use a head-and-shoulders portrait with a plain unbranded jumper or top in a gentle Storycot palette. If the photo shows character-print clothing, replace it with simple solid-colour clothing with no graphics or lettering.",
    "Match Storycot illustrated-book continuity: warm watercolour children's-book rendering, soft bedtime palette, gentle paper texture, expressive kind face, simple rounded shapes, cosy lighting, and a clean uncluttered background.",
    "Make it suitable as a reusable character reference for Storycot hardcover interiors and child profile illustrations: square crop, head-and-shoulders person portrait or full pet pose, clear visible features, stable unbranded outfit or pet markings, no scene-specific props unless requested.",
    "Show only the named subject. If the supplied image contains any extra adult, child, baby, pet, toy, or background object, remove it unless the correction explicitly asks to keep it.",
    "Do not make a photorealistic portrait, caricature, sticker, logo, toy packaging image, or social-media avatar.",
    "No text, captions, name labels, age labels, watermark, logos, franchise styling, celebrity styling, recognisable character prints, or exact copy of clothing designs.",
    NO_VISIBLE_TEXT_IN_REFERENCE,
  ]
    .filter(Boolean)
    .join(" ");
}

export function buildStoryPersonDescriptionAvatarPrompt(
  person: StoryPerson,
  adjustment?: string
): string {
  return [
    NO_VISIBLE_TEXT_IN_REFERENCE,
    `Create a square Storycot-style illustrated character reference of a ${person.relationship === "pet" ? "beloved family pet" : "family member or friend"}.`,
    IDENTITY_LOCK_FROM_DESCRIPTION,
    `Relationship context: ${getStoryPersonRelationshipLabel(person)}.`,
    "Use profile details only as private generation context; never draw words, labels, names, relationship labels, or name tags.",
    person.appearance.trim()
      ? `Current appearance description: ${person.appearance.trim()}.`
      : "",
    person.description.trim()
      ? `Role notes for behaviour/context only: ${person.description.trim()}.`
      : "",
    person.personality.trim()
      ? `Personality: ${person.personality.trim()}.`
      : "",
    person.ageGroup && person.ageGroup !== "not_specified"
      ? `Age group context: ${getStoryPersonAgeGroupLabel(person.ageGroup)}. Preserve this broad life stage without making the person look older or younger than requested.`
      : "",
    person.height && person.height !== "not_specified"
      ? `Height context: ${getStoryPersonHeightLabel(person.height)}. Preserve this as a relative height cue for reusable story scenes.`
      : "",
    person.bodyBuild && person.bodyBuild !== "not_specified"
      ? `Body build context: ${getBodyBuildLabel(person.bodyBuild)}. Preserve this as a respectful broad body-shape cue without exaggerating it.`
      : "",
    person.bodyBuild === "large"
      ? "Large means moderately fuller-than-average, not very large or oversized."
      : "",
    person.bodyBuild === "very_large"
      ? "Very Large means clearly plus-size and fuller than Large."
      : "",
    formatAdjustmentInstruction(adjustment),
    "Because no source photo is supplied, infer any missing non-sensitive visual details once from the written profile and make a stable reusable reference.",
    "Do not exaggerate body shape, age, expression, or proportions from written profile notes.",
    "Do not include branded clothing, recognisable protected character designs, toy characters, mascot art, logos, or clothing graphics.",
    "For people, use a head-and-shoulders portrait with a plain unbranded jumper or top in a gentle Storycot palette.",
    "Match Storycot illustrated-book continuity: warm watercolour children's-book rendering, soft bedtime palette, gentle paper texture, expressive kind face, simple rounded shapes, cosy lighting, and a clean uncluttered background.",
    "Make it suitable as a reusable character reference for Storycot hardcover interiors and child profile illustrations: square crop, head-and-shoulders person portrait or full pet pose, clear visible features, stable unbranded outfit or pet markings, no scene-specific props unless requested.",
    "Show only one subject. Do not add extra adults, children, babies, pets, toys, props, or background objects unless the written profile explicitly describes them as part of the subject.",
    "Do not make a photorealistic portrait, caricature, sticker, logo, toy packaging image, or social-media avatar.",
    "No text, captions, name labels, age labels, watermark, logos, franchise styling, celebrity styling, recognisable character prints, or exact copy of clothing designs.",
    NO_VISIBLE_TEXT_IN_REFERENCE,
  ]
    .filter(Boolean)
    .join(" ");
}

export function buildChildProfileAvatarPrompt(
  profile: ChildProfile,
  analysis: PhotoAnalysis,
  adjustment?: string
): string {
  return [
    NO_VISIBLE_TEXT_IN_REFERENCE,
    "Create a square Storycot-style illustrated child profile reference.",
    IDENTITY_LOCK_WITH_PHOTO,
    "Use child profile metadata only as private context outside the image; never draw the child's name, age, gender, pronouns, labels, or captions.",
    `Use ${getChildDrawingStage(profile)} only for visual scale and proportions.`,
    analysis.appearance
      ? `Photo-derived visible notes: ${analysis.appearance}. These details are visual guidance only and must not be rendered as visible writing.`
      : "",
    profile.appearance?.bodyBuild &&
    profile.appearance.bodyBuild !== "not_specified"
      ? `Body build context: ${getBodyBuildLabel(profile.appearance.bodyBuild)}. Preserve this as a respectful broad body-shape cue without exaggerating it.`
      : "",
    profile.appearance?.bodyBuild === "large"
      ? "Large means moderately fuller-than-average, not very large or oversized."
      : "",
    profile.appearance?.bodyBuild === "very_large"
      ? "Very Large means clearly plus-size and fuller than Large."
      : "",
    formatAdjustmentInstruction(adjustment),
    "Use the supplied image only as private visual reference for broad visible face, hair, colouring, and expression.",
    "Treat the supplied image as visual source of truth for identity, but latest written profile appearance and body build override stale generated details when they conflict.",
    "Do not exaggerate body shape, age, expression, or proportions from either the image or written profile notes.",
    "Do not copy any clothing graphics, logos, printed text, costumes, branded characters, franchise characters, toy characters, mascot art, or recognisable protected designs visible in the photo.",
    "Use a portrait crop from upper chest to top of head, centred on the child's face. Do not create a full-body standing or seated character sheet, full outfit pose, poster, profile page, or scene.",
    "Match Storycot illustrated-book continuity: warm watercolour children's-book rendering, soft bedtime palette, gentle paper texture, expressive kind face, simple rounded shapes, cosy lighting, and a clean uncluttered background.",
    "Make it suitable as a reusable child reference for Storycot hardcover interiors: square crop, head-and-shoulders portrait only, plain unbranded child-safe top in a gentle Storycot palette, clear visible features, stable outfit guidance, no scene-specific props unless already in the profile.",
    "Show only the child. If the supplied image contains any extra adult, child, baby, pet, toy, or background object, remove it unless the correction explicitly asks to keep it.",
    "Do not make a photorealistic portrait, caricature, sticker, logo, toy packaging image, or social-media avatar.",
    "No text, captions, name labels, age labels, watermark, logos, franchise styling, celebrity styling, recognisable character prints, or exact copy of clothing designs.",
    NO_VISIBLE_TEXT_IN_REFERENCE,
  ]
    .filter(Boolean)
    .join(" ");
}

export function buildChildProfileDescriptionAvatarPrompt(
  profile: ChildProfile,
  adjustment?: string
): string {
  const appearance = buildChildAppearanceSummary(profile.appearance);
  return [
    NO_VISIBLE_TEXT_IN_REFERENCE,
    "Create a square Storycot-style illustrated child profile reference from the written child profile.",
    IDENTITY_LOCK_FROM_DESCRIPTION,
    "Use child profile metadata only as private generation context; never draw the child's name, age, gender, pronouns, labels, or captions.",
    `Use ${getChildDrawingStage(profile)} only for visual scale and proportions.`,
    appearance ? `Current profile appearance: ${appearance}.` : "",
    profile.appearanceSummary
      ? `Previous visible reference summary, use only if it does not conflict with current profile appearance: ${profile.appearanceSummary}.`
      : "",
    profile.appearance?.bodyBuild &&
    profile.appearance.bodyBuild !== "not_specified"
      ? `Body build context: ${getBodyBuildLabel(profile.appearance.bodyBuild)}. Preserve this as a respectful broad body-shape cue without exaggerating it.`
      : "",
    profile.appearance?.bodyBuild === "large"
      ? "Large means moderately fuller-than-average, not very large or oversized."
      : "",
    profile.appearance?.bodyBuild === "very_large"
      ? "Very Large means clearly plus-size and fuller than Large."
      : "",
    formatAdjustmentInstruction(adjustment),
    "Because no source photo is supplied, infer any missing non-sensitive visual details once from the written profile and make a stable reusable reference.",
    "Do not exaggerate body shape, age, expression, or proportions from written profile notes.",
    "Do not include branded clothing, recognisable protected character designs, toy characters, mascot art, logos, or clothing graphics.",
    "Use a portrait crop from upper chest to top of head, centred on the child's face. Do not create a full-body standing or seated character sheet, full outfit pose, poster, profile page, or scene.",
    "Match Storycot illustrated-book continuity: warm watercolour children's-book rendering, soft bedtime palette, gentle paper texture, expressive kind face, simple rounded shapes, cosy lighting, and a clean uncluttered background.",
    "Make it suitable as a reusable child reference for Storycot hardcover interiors: square crop, head-and-shoulders portrait only, plain unbranded child-safe top in a gentle Storycot palette, clear visible features, stable outfit guidance, no scene-specific props unless already in the profile.",
    "Show only the child. Do not add extra adults, children, babies, pets, toys, props, or background objects unless the written profile explicitly describes them as part of the child.",
    "Do not make a photorealistic portrait, caricature, sticker, logo, toy packaging image, or social-media avatar.",
    "No text, captions, name labels, age labels, watermark, logos, franchise styling, celebrity styling, recognisable character prints, or exact copy of clothing designs.",
    NO_VISIBLE_TEXT_IN_REFERENCE,
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

async function generateImageFromText(prompt: string): Promise<Buffer> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");

  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_AVATAR_IMAGE_MODEL ?? "gpt-image-1",
      prompt,
      size: "1024x1024",
      output_format: "png",
      quality: "medium",
    }),
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

async function loadReferenceImage(url: string): Promise<Buffer> {
  if (url.startsWith("data:")) {
    const base64 = url.split(",", 2)[1];
    if (!base64) throw new Error("Reference image is unavailable");
    return Buffer.from(base64, "base64");
  }

  const response = await fetch(url);
  if (!response.ok) throw new Error("Reference image is unavailable");
  return Buffer.from(await response.arrayBuffer());
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
    const anthropic = new Anthropic();
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
              text: `Describe only visible, non-sensitive appearance details that help keep this ${input.subject} consistent in original Storycot bedtime illustrations. Always state the exact visible hair colour (and beard/moustache colour if present) and whether the subject is wearing eyeglasses, including the frame style, because these are the details illustrations most often get wrong. Do not identify the person, infer ethnicity, health, personality, age beyond broad child/adult if obvious, or any sensitive trait. Ignore and do not name any logos, text, brand marks, franchise characters, toy characters, mascot art, costumes, or clothing graphics; for clothing mention only plain generic colour/type if useful. Do not mention the photo or camera. Return only JSON:
{
  "appearance": "one concise sentence of visible features, exact hair/beard colour, eyeglasses and frame style if worn, hair/fur/markings, plain generic clothing colour/type if useful, accessories, and expression, with no brands or character prints",
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
    person.ageGroup && person.ageGroup !== "not_specified"
      ? `Age group: ${getStoryPersonAgeGroupLabel(person.ageGroup)}.`
      : "",
    person.height && person.height !== "not_specified"
      ? `Height: ${getStoryPersonHeightLabel(person.height)}.`
      : "",
    person.bodyBuild && person.bodyBuild !== "not_specified"
      ? `Body build: ${getBodyBuildLabel(person.bodyBuild)}.`
      : "",
    person.personality.trim()
      ? `Personality: ${person.personality.trim()}.`
      : "",
    person.relationship
      ? `Relationship: ${getStoryPersonRelationshipLabel(person)}.`
      : "",
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

function buildAdjustedSummary(summary: string, adjustment?: string): string {
  const cleanSummary = summary.trim();
  const cleanAdjustment = adjustment?.trim();
  if (!cleanAdjustment) return cleanSummary;
  return [cleanSummary, `Adjustment: ${cleanAdjustment}.`]
    .filter(Boolean)
    .join(" ")
    .slice(0, 600);
}

function isTextOnlyAdjustment(adjustment?: string): boolean {
  return /\b(text|word|words|label|labels|caption|captions|name|names|pronoun|pronouns|letter|letters|number|numbers|age|mumma|mama|mum|mummy|dad|daddy|he\/|she\/|they\/)\b/i.test(
    adjustment ?? ""
  );
}

function adjustmentChangesBodyBuild(adjustment?: string): boolean {
  return /\b(body|build|size|weight|fat|fatter|thin|thinner|slim|slimmer|skinny|large|larger|very large|plus[- ]?size|broad|broader|bigger|smaller|wider|narrower|heavier|lighter|chubby|round|rounder|belly|tummy|frame|proportion|proportions|shape)\b/i.test(
    adjustment ?? ""
  );
}

// The redo path edits the previously generated avatar, not the source photo.
// When a correction removes another person or pet that was overlapping the
// subject's body (e.g. a child held across the torso), the model tends to
// invent an oversized body to fill the vacated space. Unless the correction is
// explicitly about body size, keep body build/proportions locked to the
// reference and forbid adding bulk.
export function buildRedoFidelityInstruction(adjustment?: string): string {
  const base =
    "Preserve the same reusable Storycot reference style and core facial identity from the supplied generated illustration.";
  if (adjustmentChangesBodyBuild(adjustment)) {
    return `${base} Apply the current profile traits and the requested correction, even when that means changing body build, age, hairstyle, facial hair, glasses, outfit, or proportions from the old generated image.`;
  }
  return `${base} Apply the current profile traits and the requested correction, but keep the subject's body build, face width, torso width, and proportions the same as the supplied reference; do not make the subject fuller, rounder, or larger. When the correction removes another person, pet, or object, do not enlarge, widen, or add bulk to the remaining subject and do not invent a larger body to fill the space the removed subject occupied; keep a natural build consistent with the face and neck.`;
}

function buildAdjustedAppearance(
  appearance: string,
  adjustment?: string
): string {
  const clean = appearance.trim();
  if (!adjustment?.trim() || isTextOnlyAdjustment(adjustment)) return clean;
  return buildAdjustedSummary(clean, adjustment);
}

export async function createStoryPersonAvatar(input: {
  person: StoryPerson;
  file: File;
  adjustment?: string;
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
      buildStoryPersonAvatarPrompt(input.person, input.adjustment),
      analysis.appearance
        ? `Additional visible reference details from photo: ${analysis.appearance}. These details are visual guidance only and must not be rendered as visible writing.`
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

  const appearance = input.person.appearance.trim() || analysis.appearance;

  return {
    avatarImageUrl,
    appearance,
    appearanceSummary: buildAdjustedSummary(
      analysis.appearanceSummary ||
        buildStoryPersonAppearanceSummary({ ...input.person, appearance }),
      input.adjustment
    ),
  };
}

export async function createStoryPersonAvatarFromDescription(input: {
  person: StoryPerson;
  adjustment?: string;
}): Promise<{
  avatarImageUrl: string;
  appearance: string;
  appearanceSummary: string;
}> {
  const appearance = input.person.appearance.trim();
  const generated = await generateImageFromText(
    buildStoryPersonDescriptionAvatarPrompt(input.person, input.adjustment)
  );
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
  const nextAppearance =
    appearance || buildStoryPersonAppearanceSummary(input.person);

  return {
    avatarImageUrl,
    appearance: nextAppearance,
    appearanceSummary: buildAdjustedSummary(
      nextAppearance || "Storycot-style illustrated reference from profile details.",
      input.adjustment
    ),
  };
}

export async function redoStoryPersonAvatar(input: {
  person: StoryPerson;
  adjustment: string;
}): Promise<{
  avatarImageUrl: string;
  appearance: string;
  appearanceSummary: string;
}> {
  if (!input.person.avatarImageUrl) {
    throw new Error("Create a reference from a photo before redoing it.");
  }
  const adjustment = input.adjustment.trim().slice(0, 240);
  if (!adjustment) {
    throw new Error("Tell us what should change before redoing the reference.");
  }

  const currentImage = await loadReferenceImage(input.person.avatarImageUrl);
  const normalizedImage = await sharp(currentImage)
    .resize(1024, 1024, { fit: "cover" })
    .png({ compressionLevel: 8 })
    .toBuffer();
  const generated = await generateEditedImage({
    image: normalizedImage,
    prompt: [
      buildStoryPersonAvatarPrompt(input.person, adjustment),
      buildRedoFidelityInstruction(adjustment),
    ].join(" "),
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
  const appearance = buildAdjustedAppearance(
    input.person.appearance,
    adjustment
  );

  return {
    avatarImageUrl,
    appearance,
    appearanceSummary: buildAdjustedSummary(
      input.person.appearanceSummary ||
        buildStoryPersonAppearanceSummary({ ...input.person, appearance }),
      adjustment
    ),
  };
}

export async function createChildProfileAvatar(input: {
  profile: ChildProfile;
  file: File;
  adjustment?: string;
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
    prompt: buildChildProfileAvatarPrompt(
      input.profile,
      analysis,
      input.adjustment
    ),
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
    appearanceSummary: buildAdjustedSummary(
      analysis.appearanceSummary ||
        buildChildAppearanceSummary(input.profile.appearance) ||
        "",
      input.adjustment
    ),
    consistencyNote: analysis.appearance || undefined,
  };
}

export async function createChildProfileAvatarFromDescription(input: {
  profile: ChildProfile;
  adjustment?: string;
}): Promise<{
  avatarImageUrl: string;
  appearanceSummary: string;
  consistencyNote?: string;
}> {
  const appearance = buildChildAppearanceSummary(input.profile.appearance);
  const generated = await generateImageFromText(
    buildChildProfileDescriptionAvatarPrompt(input.profile, input.adjustment)
  );
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
    appearanceSummary: buildAdjustedSummary(
      appearance ||
        input.profile.appearanceSummary ||
        "Storycot-style illustrated child reference from profile details.",
      input.adjustment
    ),
    consistencyNote: isTextOnlyAdjustment(input.adjustment)
      ? undefined
      : input.adjustment?.trim().slice(0, 140) || undefined,
  };
}

export async function redoChildProfileAvatar(input: {
  profile: ChildProfile;
  adjustment: string;
}): Promise<{
  avatarImageUrl: string;
  appearanceSummary: string;
  consistencyNote?: string;
}> {
  if (!input.profile.avatarImageUrl) {
    throw new Error("Create a reference from a photo before redoing it.");
  }
  const adjustment = input.adjustment.trim().slice(0, 240);
  if (!adjustment) {
    throw new Error("Tell us what should change before redoing the reference.");
  }

  const currentImage = await loadReferenceImage(input.profile.avatarImageUrl);
  const normalizedImage = await sharp(currentImage)
    .resize(1024, 1024, { fit: "cover" })
    .png({ compressionLevel: 8 })
    .toBuffer();
  const generated = await generateEditedImage({
    image: normalizedImage,
    prompt: [
      buildChildProfileAvatarPrompt(
        input.profile,
        { appearance: "", appearanceSummary: "" },
        adjustment
      ),
      buildRedoFidelityInstruction(adjustment),
    ].join(" "),
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
    appearanceSummary: buildAdjustedSummary(
      input.profile.appearanceSummary ||
        buildChildAppearanceSummary(input.profile.appearance) ||
        "",
      adjustment
    ),
    consistencyNote: isTextOnlyAdjustment(adjustment) ? undefined : adjustment,
  };
}
