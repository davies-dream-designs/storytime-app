import { NextRequest } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { kv } from "@vercel/kv";
import { db } from "@/lib/db";
import { STORY_CREDIT_COST } from "@/lib/pricing";
import { streamStory } from "@/lib/storyGenerator";
import type { StoryPage } from "@/types";

function sendEvent(
  controller: ReadableStreamDefaultController<Uint8Array>,
  event: string,
  data: unknown
) {
  const encoder = new TextEncoder();
  controller.enqueue(
    encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
  );
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const { id } = await params;
  const story = await db.stories.getById(id);
  if (!story || story.userId !== userId) {
    return new Response("Story not found", { status: 404 });
  }

  if (story.status === "ready") {
    return Response.json(story);
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    await db.stories.update(id, {
      status: "failed",
      generationError: "ANTHROPIC_API_KEY not configured",
    });
    return new Response("ANTHROPIC_API_KEY not configured", { status: 503 });
  }

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const isAdmin = user.privateMetadata.isAdmin === true;
  const credits = (user.privateMetadata.credits as number | undefined) ?? 3;

  if (!isAdmin && credits < STORY_CREDIT_COST) {
    await db.stories.update(id, {
      status: "failed",
      generationError: "No credits remaining. Visit /account to purchase more.",
    });
    return new Response("No credits remaining", { status: 402 });
  }

  const profile = await db.profiles.getById(story.profileId);
  if (!profile || profile.userId !== userId) {
    await db.stories.update(id, {
      status: "failed",
      generationError: "Profile not found",
    });
    return new Response("Profile not found", { status: 404 });
  }

  const locale = req.nextUrl.searchParams.get("locale") ?? undefined;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        sendEvent(controller, "status", { status: "starting" });

        const [characters, recentStories] = await Promise.all([
          db.characters.getByProfileId(story.profileId),
          db.stories.getByProfileId(story.profileId),
        ]);

        const recentTitles = recentStories
          .filter((s) => s.userId === userId && s.id !== story.id)
          .sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1))
          .slice(0, 5)
          .map((s) => s.title);

        const generated = await streamStory(
          {
            profile,
            characters: characters.filter((c) => c.userId === userId),
            theme: story.theme,
            premise: story.premise,
            notes: story.notes,
            recentTitles,
            locale,
          },
          (textPages) => {
            sendEvent(controller, "snapshot", {
              pages: textPages.map((text, index): StoryPage => ({
                pageNumber: index + 1,
                text,
                illustrationPrompt: "",
              })),
            });
          }
        );

        const wordCount = generated.pages.reduce(
          (acc, page) => acc + page.text.split(/\s+/).filter(Boolean).length,
          0
        );

        const finalStory = {
          ...story,
          title: generated.title,
          pages: generated.pages,
          wordCount,
          status: "ready",
          generationError: undefined,
        } as const;

        const updated = await db.stories.update(id, finalStory);

        await kv.del(`suggestions:${story.profileId}`);

        if (!isAdmin) {
          await client.users.updateUserMetadata(userId, {
            privateMetadata: { credits: credits - STORY_CREDIT_COST },
          });
        }

        sendEvent(controller, "complete", updated ?? finalStory);
        controller.close();
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Story generation failed";
        await db.stories.update(id, {
          status: "failed",
          generationError: message,
        });
        sendEvent(controller, "error", { error: message });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
    },
  });
}
