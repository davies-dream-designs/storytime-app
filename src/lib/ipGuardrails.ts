import type { Story, StoryPage } from "@/types";

export type StoryIpRiskLevel = "clear" | "originalized" | "restricted";

export type StoryIpPolicy = {
  riskLevel: StoryIpRiskLevel;
  printAllowed: boolean;
  reasons: string[];
  originalizedPremise?: string;
  originalizedNotes?: string;
};

type StoryIdeaInput = {
  theme?: string;
  premise?: string;
  notes?: string;
};

const PROTECTED_REFERENCE_PATTERNS = [
  /\btoy story\b/i,
  /\bwoody\b/i,
  /\bbuzz lightyear\b/i,
  /\bbluey\b/i,
  /\bbingo\b/i,
  /\bdisney\b/i,
  /\bpixar\b/i,
  /\bmarvel\b/i,
  /\bspider[- ]?man\b/i,
  /\bbatman\b/i,
  /\bsuperman\b/i,
  /\bpok[eé]mon\b/i,
  /\bpikachu\b/i,
  /\bmario\b/i,
  /\bharry potter\b/i,
  /\bhogwarts\b/i,
  /\bstar wars\b/i,
  /\bdarth vader\b/i,
  /\bfrozen\b/i,
  /\belsa\b/i,
  /\bminions?\b/i,
  /\bpeppa pig\b/i,
  /\bpaw patrol\b/i,
  /\bspongebob\b/i,
  /\bsonic\b/i,
  /\bbarbie\b/i,
  /\bmickey mouse\b/i,
  /\bwinnie[- ]?the[- ]?pooh\b/i,
];

const SOURCE_REFERENCE_PATTERNS = [
  /\b(in the style of|drawn like|looks like|from the movie|from the show|from the book|official character|franchise|brand|logo)\b/i,
  /\b(with|and|meets|meeting|adventure with)\s+(?:the\s+)?[A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,3}\b/,
];

function normalizeInput(input: StoryIdeaInput): string {
  return [input.theme, input.premise, input.notes]
    .filter((value): value is string => Boolean(value?.trim()))
    .join("\n")
    .normalize("NFKC");
}

function hasProtectedReference(text: string): boolean {
  return PROTECTED_REFERENCE_PATTERNS.some((pattern) => pattern.test(text));
}

function hasSourceReference(text: string): boolean {
  return SOURCE_REFERENCE_PATTERNS.some((pattern) => pattern.test(text));
}

export function assessStoryIdeaIp(input: StoryIdeaInput): StoryIpPolicy {
  const text = normalizeInput(input);
  if (!text) {
    return { riskLevel: "clear", printAllowed: true, reasons: [] };
  }

  const reasons: string[] = [];
  if (hasProtectedReference(text)) {
    reasons.push("protected_reference");
  }
  if (hasSourceReference(text)) {
    reasons.push("source_or_style_reference");
  }

  if (reasons.length === 0) {
    return { riskLevel: "clear", printAllowed: true, reasons };
  }

  return {
    riskLevel: "originalized",
    printAllowed: true,
    reasons,
    originalizedPremise: input.premise
      ? originalizeStoryIdeaText(input.premise)
      : undefined,
    originalizedNotes: input.notes ? originalizeStoryIdeaText(input.notes) : "",
  };
}

export function originalizeStoryIdeaText(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";

  return [
    "Create an original Storycot adventure inspired only by the broad feeling of this idea.",
    "Do not use any existing franchise, brand, celebrity, copyrighted character, trademarked world, logos, catchphrases, or recognisable visual likeness.",
    "Replace any named source material with new Storycot-original characters, settings, toys, creatures, and story details.",
    `Original user idea to reinterpret safely: ${trimmed}`,
  ].join(" ");
}

export function buildIpSafeGenerationInstruction(): string {
  return [
    "IP originality requirements:",
    "- Create only original Storycot characters, settings, titles, toy designs, creatures, and visual descriptions.",
    "- Do not use or imitate existing franchises, brands, celebrities, copyrighted characters, trademarked worlds, logos, catchphrases, or recognisable character likenesses.",
    "- If the user asks for a known story world or character, reinterpret only the broad generic idea into a new original bedtime-story world.",
    "- Illustration prompts must describe original designs and must not mention protected names, brands, studios, franchises, or lookalike character traits.",
  ].join("\n");
}

export function assessGeneratedStoryIp(
  story: Pick<Story, "title" | "theme" | "premise" | "notes" | "pages">
): StoryIpPolicy {
  const pageText = story.pages
    .map((page: StoryPage) => `${page.text} ${page.illustrationPrompt}`)
    .join("\n");
  const text = [story.title, story.theme, story.premise, story.notes, pageText]
    .filter((value): value is string => Boolean(value?.trim()))
    .join("\n");

  if (!hasProtectedReference(text) && !hasSourceReference(text)) {
    return { riskLevel: "clear", printAllowed: true, reasons: [] };
  }

  return {
    riskLevel: "restricted",
    printAllowed: false,
    reasons: [
      hasProtectedReference(text) ? "protected_reference" : "",
      hasSourceReference(text) ? "source_or_style_reference" : "",
    ].filter(Boolean),
  };
}

export function isStoryPrintRestricted(story?: Pick<Story, "ipPolicy"> | null) {
  return story?.ipPolicy?.printAllowed === false;
}
