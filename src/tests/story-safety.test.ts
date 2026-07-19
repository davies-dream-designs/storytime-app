import { describe, expect, it } from "vitest";
import { validateStoryIdeaSafety } from "@/lib/storySafety";

describe("validateStoryIdeaSafety", () => {
  it("allows benign custom bedtime story ideas", () => {
    expect(
      validateStoryIdeaSafety({
        theme: "kindness",
        premise:
          "Bailey helps a shy fish feel brave beside a calm garden pond.",
        notes: "Warm, cosy, gentle repetition.",
      })
    ).toEqual({ ok: true });
  });

  it("rejects sexualized child story ideas", () => {
    const result = validateStoryIdeaSafety({
      premise: "A naked little boy has a secret adventure.",
    });

    expect(result).toMatchObject({
      ok: false,
      category: "sexual_content",
    });
  });

  it("rejects violent or dangerous custom ideas", () => {
    const result = validateStoryIdeaSafety({
      premise: "A monster kidnaps Bailey and threatens him with a knife.",
    });

    expect(result).toMatchObject({
      ok: false,
      category: "violence_or_peril",
    });
  });

  it("rejects bathroom or bathing ideas before they reach image generation", () => {
    const result = validateStoryIdeaSafety({
      notes: "Set the whole story in the bathtub after a potty accident.",
    });

    expect(result).toMatchObject({
      ok: false,
      category: "bathroom_or_bathing",
    });
  });
});
