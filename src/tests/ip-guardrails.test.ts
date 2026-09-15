import { describe, expect, it } from "vitest";
import {
  assessGeneratedStoryIp,
  assessStoryIdeaIp,
  isStoryPrintRestricted,
  originalizeProseText,
  originalizeStoryIdeaText,
} from "@/lib/ipGuardrails";

describe("IP guardrails", () => {
  it("allows original story ideas", () => {
    expect(
      assessStoryIdeaIp({
        premise: "Bailey's own toys build a moon ladder in the bedroom.",
      })
    ).toMatchObject({
      riskLevel: "clear",
      printAllowed: true,
    });
  });

  it("originalizes obvious source-material ideas before generation", () => {
    const result = assessStoryIdeaIp({
      premise: "A Toy Story adventure where Bailey meets Woody.",
    });

    expect(result).toMatchObject({
      riskLevel: "originalized",
      printAllowed: true,
      reasons: expect.arrayContaining(["protected_reference"]),
      matchedTerms: ["Toy Story", "Woody"],
    });
    expect(result.originalizedPremise).toContain(
      "Replace any named source material"
    );
    expect(result.originalizedPremise).toContain(
      "an original toy-room adventure"
    );
    expect(result.originalizedPremise).not.toContain("Toy Story");
    expect(result.originalizedPremise).not.toContain("Woody");
  });

  it("allows clean generated stories after the protected premise was safely rewritten", () => {
    const result = assessGeneratedStoryIp({
      title: "Bailey and the Blanket Hero",
      theme: "bravery",
      premise: originalizeStoryIdeaText(
        "A Superman story where Bailey learns to help."
      ),
      notes: "",
      pages: [
        {
          pageNumber: 1,
          text: "Bailey met a brave flying helper with a starry blanket cape.",
          illustrationPrompt:
            "An original child-safe bedtime hero with a starry blanket cape in a cosy bedroom.",
        },
      ],
    });

    expect(result).toMatchObject({
      riskLevel: "clear",
      printAllowed: true,
    });
  });

  it("marks generated stories as print restricted if protected references survive", () => {
    const result = assessGeneratedStoryIp({
      title: "Bailey and Buzz",
      theme: "bravery",
      premise: originalizeStoryIdeaText("A space toy adventure."),
      notes: "",
      pages: [
        {
          pageNumber: 1,
          text: "Bailey met Buzz Lightyear beside the toy box.",
          illustrationPrompt: "Buzz Lightyear in a bedroom.",
        },
      ],
    });

    expect(result).toMatchObject({
      riskLevel: "restricted",
      printAllowed: false,
      matchedTerms: ["Buzz Lightyear"],
    });
  });

  it("does not block ordinary uses of broad words like frozen", () => {
    const result = assessGeneratedStoryIp({
      title: "Bailey and the Frozen Pond",
      theme: "patience",
      premise: "",
      notes: "",
      pages: [
        {
          pageNumber: 1,
          text: "Bailey watched a frozen pond sparkle in the morning light.",
          illustrationPrompt:
            "An original winter pond with a warmly dressed child nearby.",
        },
      ],
    });

    expect(result).toMatchObject({
      riskLevel: "clear",
      printAllowed: true,
    });
  });

  it("does not block ordinary phrases like brand new", () => {
    const result = assessGeneratedStoryIp({
      title: "Bailey's Brand New Boat",
      theme: "curiosity",
      premise: "",
      notes: "",
      pages: [
        {
          pageNumber: 1,
          text: "Bailey found a brand new paper boat beside the window.",
          illustrationPrompt:
            "An original cosy bedroom scene with a child holding a paper boat.",
        },
      ],
    });

    expect(result).toMatchObject({
      riskLevel: "clear",
      printAllowed: true,
    });
  });

  it("still blocks explicit brand or logo source wording", () => {
    const result = assessGeneratedStoryIp({
      title: "Bailey's Boat",
      theme: "curiosity",
      premise: "",
      notes: "",
      pages: [
        {
          pageNumber: 1,
          text: "Bailey found a toy with a brand logo on the sail.",
          illustrationPrompt:
            "A toy boat with a brand logo in a cosy bedroom.",
        },
      ],
    });

    expect(result).toMatchObject({
      riskLevel: "restricted",
      printAllowed: false,
      reasons: expect.arrayContaining(["source_or_style_reference"]),
    });
  });

  it("does not keep old stored restrictions when final generated content is clean", () => {
    expect(
      isStoryPrintRestricted({
        title: "Bailey and the Blanket Hero",
        theme: "bravery",
        premise: originalizeStoryIdeaText(
          "A Superman story where Bailey learns to help."
        ),
        notes: "",
        ipPolicy: {
          riskLevel: "restricted",
          printAllowed: false,
          reasons: ["protected_reference"],
        },
        pages: [
          {
            pageNumber: 1,
            text: "Bailey met a brave flying helper with a starry blanket cape.",
            illustrationPrompt:
              "An original child-safe bedtime hero with a starry blanket cape in a cosy bedroom.",
          },
        ],
      })
    ).toBe(false);
  });

  it("keeps print blocked when protected references survive in final content", () => {
    expect(
      isStoryPrintRestricted({
        title: "Bailey and Buzz",
        theme: "bravery",
        premise: originalizeStoryIdeaText("A space toy adventure."),
        notes: "",
        ipPolicy: {
          riskLevel: "restricted",
          printAllowed: false,
          reasons: ["protected_reference"],
        },
        pages: [
          {
            pageNumber: 1,
            text: "Bailey met Buzz Lightyear beside the toy box.",
            illustrationPrompt: "Buzz Lightyear in a bedroom.",
          },
        ],
      })
    ).toBe(true);
  });

  describe("originalizeProseText", () => {
    it("replaces branded references in reading prose", () => {
      const cleaned = originalizeProseText(
        "Bailey met Buzz Lightyear beside the toy box."
      );
      expect(cleaned).not.toMatch(/buzz lightyear/i);
      expect(cleaned).toContain("an original space-themed toy");
    });

    it("preserves paragraph breaks so page formatting survives", () => {
      const cleaned = originalizeProseText(
        "First paragraph about Buzz Lightyear.\n\nSecond paragraph."
      );
      expect(cleaned).toContain("\n\n");
      expect(cleaned).not.toMatch(/buzz lightyear/i);
    });

    it("leaves clean prose untouched", () => {
      const original = "Bailey climbed the moon ladder.\n\nThe end of the day.";
      expect(originalizeProseText(original)).toBe(original);
    });
  });

  it("marks a story clear once branded prose has been scrubbed", () => {
    const cleaned = {
      title: originalizeProseText("Bailey and Buzz Lightyear"),
      theme: "bravery",
      premise: "",
      notes: "",
      pages: [
        {
          pageNumber: 1,
          text: originalizeProseText(
            "Bailey met Buzz Lightyear beside the toy box."
          ),
          illustrationPrompt: originalizeProseText("Buzz Lightyear in a bedroom."),
        },
      ],
    };
    const policy = assessGeneratedStoryIp(cleaned);
    expect(policy.riskLevel).toBe("clear");
    expect(policy.printAllowed).toBe(true);
  });
});
