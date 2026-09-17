import { getTradeBooksModelConfig } from "@/lib/trade-books/modelConfig";
import type { IllustrationQaCategory } from "@/types/printBook";

export interface IllustrationQaResult {
  defect: boolean;
  category: IllustrationQaCategory;
  description: string;
}

const QA_PROMPT = `You are a strict quality reviewer for children's picture book illustrations. Look at this image and check ONLY for these defect categories:
1. Anatomy errors: extra or missing limbs, malformed/extra hands, fused or impossible body parts.
2. Obscured faces: a named human character's face is turned fully away, hidden, or not visible when the scene implies it should be (e.g. two people talking, looking at each other, or facing the viewer).
3. Major style breaks: photorealistic intrusion, unfinished/glitched rendering, duplicated body parts.

Do NOT flag: art style choices, minor asymmetry, hands that are simply resting/holding something normally, stylized cartoon proportions typical of children's book art.

Respond with ONLY a JSON object, no markdown, no other text:
{"defect": true or false, "category": "anatomy"|"obscured_face"|"style_break"|"none", "description": "one sentence describing the specific issue, written as an instruction to fix it, or empty string if no defect"}`;

const VALID_CATEGORIES: IllustrationQaCategory[] = [
  "anatomy",
  "obscured_face",
  "style_break",
  "none",
];

function parseQaResponse(content: string): IllustrationQaResult {
  // Vision models sometimes wrap JSON in markdown fences despite instructions.
  const stripped = content
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  const parsed: unknown = JSON.parse(stripped);
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("QA response was not a JSON object");
  }
  const record = parsed as Record<string, unknown>;
  const defect = record.defect === true;
  const category = VALID_CATEGORIES.includes(
    record.category as IllustrationQaCategory
  )
    ? (record.category as IllustrationQaCategory)
    : "none";
  const description =
    typeof record.description === "string" ? record.description.trim() : "";
  return { defect, category, description };
}

/**
 * Runs a vision-model QA check on a single generated illustration, looking
 * for anatomy errors, obscured faces, and major style breaks that the
 * pixel-level checks in illustrations.ts (black-frame / moderation / aspect
 * ratio) can't detect. Uses the trade books review model over Cliproxy's
 * OpenAI-compatible /chat/completions endpoint.
 */
export async function checkIllustrationQa(input: {
  imageUrl: string;
  fetchImpl?: typeof fetch;
}): Promise<IllustrationQaResult> {
  const modelConfig = getTradeBooksModelConfig();
  const fetchImpl = input.fetchImpl ?? fetch;

  const response = await fetchImpl(`${modelConfig.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${modelConfig.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: modelConfig.reviewModel,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: QA_PROMPT },
            { type: "image_url", image_url: { url: input.imageUrl } },
          ],
        },
      ],
      temperature: 0,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Illustration QA request failed with status ${response.status}`
    );
  }

  const body = (await response.json()) as {
    choices?: Array<{ message?: { content?: unknown } }>;
  };
  const content = body.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("Illustration QA response did not include content");
  }

  return parseQaResponse(content);
}
