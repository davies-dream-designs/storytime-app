import { notFound, redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { buildStoryGameJson } from "@/lib/story-game/generator";
import {
  buildStoryGamePlayUrl,
  getStoryGameEngineUrl,
} from "@/lib/story-game/play-url";

export default async function StoryGameLaunchPage({
  params,
}: {
  params: Promise<{ id: string; locale: string }>;
}) {
  const { userId } = await auth();
  const { id } = await params;
  const story = await db.stories.getById(id);

  if (!userId || !story || story.userId !== userId) notFound();
  if (story.status !== "ready" || story.pages.length === 0) notFound();

  redirect(
    buildStoryGamePlayUrl({
      engineUrl: getStoryGameEngineUrl(),
      game: buildStoryGameJson(story),
    })
  );
}
