import type { AgeBand } from "@/types/printBook";
import { getStorycotIllustrationCountForAgeBand } from "@/lib/print-books/printProducts";

export const STORY_CREDIT_COST = 1;
export const REFERENCE_REDO_CREDIT_COST = 1;
export const ILLUSTRATED_BOOK_CREDIT_COST = 6;

const ILLUSTRATED_BOOK_CREDIT_FLOORS_BY_AGE_BAND: Record<AgeBand, number> = {
  "baby-drift": 6,
  "little-listener": 6,
  "toddler-tale": 7,
  "first-adventure": 8,
  "preschool-story": 9,
  "big-kid-chapter": 10,
  "young-reader-short": 10,
  "young-reader-classic": 12,
  "young-reader-long": 14,
  "0-2": 6,
  "3-5": 9,
  "6-8": 11,
};

export function estimateIllustratedBookCredits(input: {
  ageBand: AgeBand;
  pageCount?: number;
  illustrationCount?: number;
}) {
  const illustrationCount =
    input.illustrationCount ??
    getStorycotIllustrationCountForAgeBand(input.ageBand);
  const baseCredits =
    input.ageBand === "big-kid-chapter" ||
    input.ageBand === "young-reader-short" ||
    input.ageBand === "young-reader-classic" ||
    input.ageBand === "young-reader-long" ||
    input.ageBand === "6-8"
      ? 3
      : 2;
  const illustrationCredits = Math.ceil(illustrationCount * 0.5);
  const complexityCredits =
    input.pageCount && input.pageCount > 24
      ? Math.ceil((input.pageCount - 24) / 8)
      : 0;

  return {
    credits: Math.max(
      ILLUSTRATED_BOOK_CREDIT_FLOORS_BY_AGE_BAND[input.ageBand],
      baseCredits + illustrationCredits + complexityCredits
    ),
    illustrationCount,
    baseCredits,
    illustrationCredits,
    complexityCredits,
  };
}

export type CostEstimateInput = {
  storyInputTokens?: number;
  storyOutputTokens?: number;
  imageCount?: number;
  imageUnitCostAud?: number;
  claudeInputPerMillionAud?: number;
  claudeOutputPerMillionAud?: number;
  platformOverheadAud?: number;
};

export function estimateDigitalGenerationCostAud({
  storyInputTokens = 3500,
  storyOutputTokens = 1400,
  imageCount = 17,
  imageUnitCostAud = 0.08,
  claudeInputPerMillionAud = 4.5,
  claudeOutputPerMillionAud = 22.5,
  platformOverheadAud = 0.08,
}: CostEstimateInput = {}) {
  const claudeCostAud =
    (storyInputTokens / 1_000_000) * claudeInputPerMillionAud +
    (storyOutputTokens / 1_000_000) * claudeOutputPerMillionAud;
  const imageCostAud = imageCount * imageUnitCostAud;
  const totalAud = claudeCostAud + imageCostAud + platformOverheadAud;

  return {
    claudeCostAud,
    imageCostAud,
    platformOverheadAud,
    totalAud,
  };
}

export function estimateCreditValueAud(packAmountAud: number, credits: number) {
  return packAmountAud / credits;
}
