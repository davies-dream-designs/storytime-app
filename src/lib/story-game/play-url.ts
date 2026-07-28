import type { StoryGameJson } from "./schema";

export const DEFAULT_STORY_GAME_ENGINE_URL =
  "https://storygame-lp5m43pfn-davies-dream-designs.vercel.app/";

export function getStoryGameEngineUrl() {
  return (
    process.env.NEXT_PUBLIC_STORY_GAME_URL?.trim() ||
    DEFAULT_STORY_GAME_ENGINE_URL
  );
}

export function buildStoryGamePlayUrl({
  engineUrl,
  game,
}: {
  engineUrl: string;
  game: StoryGameJson;
}) {
  const url = new URL(engineUrl);
  const storyDataUrl = `data:application/json;charset=utf-8,${encodeURIComponent(
    JSON.stringify(game)
  )}`;

  url.searchParams.set("story", storyDataUrl);
  return url.toString();
}
