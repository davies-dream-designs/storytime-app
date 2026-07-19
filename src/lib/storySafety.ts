type StoryIdeaSafetyInput = {
  theme?: string;
  premise?: string;
  notes?: string;
};

type StoryIdeaSafetyResult =
  { ok: true } | { ok: false; reason: string; category: string };

const BLOCKED_PATTERNS: Array<{
  category: string;
  reason: string;
  patterns: RegExp[];
}> = [
  {
    category: "sexual_content",
    reason:
      "Story ideas for children cannot include sexual content, nudity, or romantic adult material.",
    patterns: [
      /\b(sex|sexual|sexy|erotic|porn|porno|nsfw|fetish|kink)\b/i,
      /\b(nude|naked|nudity|topless|strip|stripping|undress|undressing)\b/i,
      /\b(genitals?|private parts?|breasts?|boobs?|penis|vagina|buttocks?)\b/i,
      /\b(kiss(?:ing)? passionately|make out|seduc(?:e|ing|tion))\b/i,
    ],
  },
  {
    category: "child_exploitation",
    reason:
      "Story ideas cannot sexualize children or place children in exploitative situations.",
    patterns: [
      /\b(child|kid|toddler|baby|infant|minor|little girl|little boy)\b.{0,40}\b(sex|sexy|nude|naked|strip|undress|private parts?)\b/i,
      /\b(sex|sexy|nude|naked|strip|undress|private parts?)\b.{0,40}\b(child|kid|toddler|baby|infant|minor|little girl|little boy)\b/i,
    ],
  },
  {
    category: "violence_or_peril",
    reason:
      "Story ideas for Storycot should not include graphic violence, weapons, abuse, or serious peril.",
    patterns: [
      /\b(kill|murder|slaughter|stab|shoot|gun|knife|weapon|blood|gore)\b/i,
      /\b(abuse|torture|kidnap(?:s|ped|ping)?|abduct(?:s|ed|ing)?|hostage|attack|assault)\b/i,
      /\b(drown|drowning|choke|choking|strangle|suffocate)\b/i,
      /\b(monster eats|eaten alive|burned alive)\b/i,
    ],
  },
  {
    category: "self_harm",
    reason: "Story ideas cannot include self-harm or suicide content.",
    patterns: [
      /\b(suicide|self[- ]?harm|cutting myself|cut themselves|hang myself|kill myself)\b/i,
    ],
  },
  {
    category: "substances",
    reason:
      "Story ideas for children cannot include drugs, intoxication, smoking, or alcohol use.",
    patterns: [
      /\b(drugs?|cocaine|heroin|meth|weed|marijuana|cannabis|vape|vaping|smoking)\b/i,
      /\b(drunk|alcohol|beer|wine|vodka|whiskey|cocktail)\b/i,
    ],
  },
  {
    category: "bathroom_or_bathing",
    reason:
      "Story ideas that involve bathing, toilets, nappies, or undressing are not suitable for illustrated children's books.",
    patterns: [
      /\b(bath|bathtub|shower|toilet|potty|nappy|nappies|diaper|diapers)\b/i,
      /\b(get changed|changing clothes|changing room|bathroom accident)\b/i,
    ],
  },
  {
    category: "hate_or_harassment",
    reason: "Story ideas cannot include hate, slurs, bullying, or harassment.",
    patterns: [
      /\b(racist|racism|slur|hate crime|bully|bullying|humiliate|degrade)\b/i,
    ],
  },
];

function normalizeInput(input: StoryIdeaSafetyInput): string {
  return [input.theme, input.premise, input.notes]
    .filter((value): value is string => Boolean(value?.trim()))
    .join("\n")
    .normalize("NFKC");
}

export function validateStoryIdeaSafety(
  input: StoryIdeaSafetyInput
): StoryIdeaSafetyResult {
  const text = normalizeInput(input);
  if (!text) return { ok: true };

  for (const rule of BLOCKED_PATTERNS) {
    if (rule.patterns.some((pattern) => pattern.test(text))) {
      return {
        ok: false,
        category: rule.category,
        reason: rule.reason,
      };
    }
  }

  return { ok: true };
}

export function storyIdeaSafetyErrorResponse(
  result: Exclude<StoryIdeaSafetyResult, { ok: true }>
) {
  return {
    error: result.reason,
    code: "story_idea_not_allowed",
    category: result.category,
  };
}
