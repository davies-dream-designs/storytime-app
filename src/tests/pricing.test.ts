import { describe, expect, it } from "vitest";
import {
  estimateCreditValueAud,
  estimateDigitalGenerationCostAud,
  estimateIllustratedBookCredits,
  ILLUSTRATED_BOOK_CREDIT_COST,
  STORY_CREDIT_COST,
} from "@/lib/pricing";

describe("pricing policy", () => {
  it("sets plain stories and illustrated books to distinct credit costs", () => {
    expect(STORY_CREDIT_COST).toBe(1);
    expect(ILLUSTRATED_BOOK_CREDIT_COST).toBe(8);
  });

  it("estimates digital generation cost from configurable inputs", () => {
    const estimate = estimateDigitalGenerationCostAud({
      storyInputTokens: 1000,
      storyOutputTokens: 1000,
      claudeInputPerMillionAud: 3,
      claudeOutputPerMillionAud: 15,
      imageCount: 10,
      imageUnitCostAud: 0.1,
      platformOverheadAud: 0.2,
    });

    expect(estimate.claudeCostAud).toBeCloseTo(0.018);
    expect(estimate.imageCostAud).toBeCloseTo(1);
    expect(estimate.totalAud).toBeCloseTo(1.218);
  });

  it("derives credit value from pack pricing", () => {
    expect(estimateCreditValueAud(11.99, 30)).toBeCloseTo(0.3997);
  });

  it("estimates illustrated book credits by age and complexity", () => {
    expect(
      estimateIllustratedBookCredits({
        ageBand: "0-2",
        pageCount: 24,
        illustrationCount: 9,
      }).credits
    ).toBe(8);
    expect(
      estimateIllustratedBookCredits({
        ageBand: "6-8",
        pageCount: 32,
        illustrationCount: 13,
      }).credits
    ).toBe(11);
  });
});
