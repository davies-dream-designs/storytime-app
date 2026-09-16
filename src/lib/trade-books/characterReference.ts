import { generateTradeProtagonistVisualReference } from "@/lib/print-books/illustrations";
import type {
  BookProject,
  CharacterBible,
  CharacterVisualReference,
} from "@/types/printBook";
import type { ChildProfile } from "@/types";

export async function ensureTradeProtagonistVisualReference(input: {
  project: BookProject;
  profile: ChildProfile;
  characterBible: CharacterBible;
}): Promise<CharacterVisualReference[]> {
  const existing = input.project.assets.tradeCharacterReferences ?? [];
  if (
    existing.some(
      (reference) => reference.id === `trade:protagonist:${input.project.id}`
    )
  ) {
    return existing;
  }

  const reference = await generateTradeProtagonistVisualReference(input);
  return [...existing, reference];
}
