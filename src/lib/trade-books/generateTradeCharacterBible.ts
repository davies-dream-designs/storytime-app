import type { ChildProfile, Story } from "@/types";
import {
  buildCharacterBiblePrompt,
  enrichCharacterBibleWithLockedRules,
  normalizeCharacterBible,
  parseCharacterBible,
} from "@/lib/print-books/characterBible";
import { getTradeBooksModelConfig } from "@/lib/trade-books/modelConfig";
import { TradeBookJobPermanentError } from "@/lib/trade-books/worker";
import type { CharacterBible } from "@/types/printBook";

type ModelResponse = { choices?: Array<{ message?: { content?: unknown } }> };

export async function generateTradeCharacterBible(input: {
  profile: ChildProfile;
  story: Story;
  options?: { fetchImpl?: typeof fetch; now?: Date };
}): Promise<CharacterBible> {
  const { profile, story, options = {} } = input;
  const fetchImpl = options.fetchImpl ?? fetch;
  const modelConfig = getTradeBooksModelConfig();
  const prompt = buildCharacterBiblePrompt({
    profile,
    story,
    characters: [],
    storyPeople: [],
  });

  async function callModel(): Promise<string> {
    const response = await fetchImpl(
      `${modelConfig.baseUrl}/chat/completions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${modelConfig.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: modelConfig.textModel,
          messages: [{ role: "user", content: prompt }],
          temperature: 0.7,
        }),
      }
    );
    if (!response.ok) {
      throw new Error(
        `Trade character bible request failed with status ${response.status}`
      );
    }
    const body = (await response.json()) as ModelResponse;
    const content = body.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      throw new Error(
        "Trade character bible model response content is missing"
      );
    }
    return content;
  }

  function parseBible(content: string): CharacterBible {
    return enrichCharacterBibleWithLockedRules(
      normalizeCharacterBible(parseCharacterBible(content)),
      { profile, storyPeople: [] }
    );
  }

  let content: string;
  try {
    content = await callModel();
  } catch (err) {
    throw err;
  }

  try {
    return parseBible(content);
  } catch {
    console.warn("Trade character bible parse failed — retrying once.");
    let retryContent: string;
    try {
      retryContent = await callModel();
    } catch (err) {
      throw err;
    }
    try {
      return parseBible(retryContent);
    } catch (err) {
      throw new TradeBookJobPermanentError(
        err instanceof Error
          ? err.message
          : "Trade character bible parse failed"
      );
    }
  }
}
