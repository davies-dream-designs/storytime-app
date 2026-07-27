import type { BookArtMode } from "@/types/printBook";

export function getProjectArtMode(input: {
  coverProvider?: "openai" | "placeholder";
  spreadProviders?: Array<"openai" | "placeholder">;
  existingArtMode?: BookArtMode;
}): BookArtMode {
  const providers = new Set<string>();
  if (input.coverProvider) providers.add(input.coverProvider);
  for (const provider of input.spreadProviders ?? []) providers.add(provider);
  if (providers.size === 0) return input.existingArtMode ?? "placeholder";
  if (providers.size === 1)
    return providers.has("openai") ? "generated" : "placeholder";
  return "mixed";
}
