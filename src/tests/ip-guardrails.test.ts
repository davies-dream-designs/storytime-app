import { describe, expect, it } from "vitest";
import {
  assessGeneratedStoryIp,
  assessStoryIdeaIp,
  isStoryPrintRestricted,
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
});
