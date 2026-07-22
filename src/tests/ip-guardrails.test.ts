import { describe, expect, it } from "vitest";
import {
  assessGeneratedStoryIp,
  assessStoryIdeaIp,
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
    expect(result.originalizedPremise).toContain("Toy Story");
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
});
