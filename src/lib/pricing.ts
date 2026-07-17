export const STORY_CREDIT_COST = 1;
export const ILLUSTRATED_BOOK_CREDIT_COST = 8;

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
