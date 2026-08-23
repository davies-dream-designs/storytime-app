import { NextRequest } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { kv } from "@vercel/kv";
import { db } from "@/lib/db";
import { STORY_CREDIT_COST } from "@/lib/pricing";
import { StoryGenerationError, streamStory } from "@/lib/storyGenerator";
import {
  assessGeneratedStoryIp,
  assessProfileIp,
  profileIpErrorResponse,
} from "@/lib/ipGuardrails";
import { logEvent } from "@/lib/logEvent";
import { storyRatelimit, checkRatelimit } from "@/lib/ratelimit";
import { getSelectedStoryPeople } from "@/lib/storyPeopleSelection";
import type { StoryPage } from "@/types";

function sendEvent(
  controller: ReadableStreamDefaultController<Uint8Array>,
  event: string,
  data: unknown
) {
  const encoder = new TextEncoder();
  try {
    controller.enqueue(
      encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    );
  } catch {
    // Controller is already closed (client disconnected); nothing to send.
  }
}

function safeClose(controller: ReadableStreamDefaultController<Uint8Array>) {
  try {
    controller.close();
  } catch {
    // Already closed.
  }
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

  const rateLimitRes = await checkRatelimit(storyRatelimit, userId);
  if (rateLimitRes) return rateLimitRes;

  if (!process.env.ANTHROPIC_API_KEY) {
    await db.stories.update(id, {
      status: "failed",
      generationError: "ANTHROPIC_API_KEY not configured",
    });
    await logEvent({
      code: "story.config_missing",
      message: "ANTHROPIC_API_KEY not configured",
      userId,
      entityType: "story",
      entityId: id,
      source: "story/stream",
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
      generationError: "You're out of credits. Visit your account to top up.",
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
        const safeCharacters = characters.filter((c) => c.userId === userId);
        const selectedStoryPeople = await getSelectedStoryPeople({
          userId,
          profileId: story.profileId,
          storyPersonIds: story.storyPersonIds ?? [],
        });
        const profileIpPolicy = assessProfileIp({
          ...profile,
          characters: safeCharacters,
          storyPeople: selectedStoryPeople,
        });
        if (profileIpPolicy.printAllowed === false) {
          const response = profileIpErrorResponse(profileIpPolicy);
          throw new Error(response.error);
        }

        const recentTitles = recentStories
          .filter((s) => s.userId === userId && s.id !== story.id)
          .sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1))
          .slice(0, 5)
          .map((s) => s.title);

        const generated = await streamStory(
          {
            profile,
            characters: safeCharacters,
            storyPeople: selectedStoryPeople,
            theme: story.theme,
            premise: story.premise,
            notes: story.notes,
            storyPreset: story.storyPreset,
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
          },
          (stage) => {
            sendEvent(controller, "status", { status: stage });
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
        const generatedIpPolicy = assessGeneratedStoryIp(finalStory);
        const storyForStorage =
          generatedIpPolicy.riskLevel === "restricted"
            ? { ...finalStory, ipPolicy: generatedIpPolicy }
            : finalStory;

        const updated = await db.stories.update(id, storyForStorage);

        await kv.del(`suggestions:${story.profileId}`);

        if (!isAdmin) {
          await client.users.updateUserMetadata(userId, {
            privateMetadata: { credits: credits - STORY_CREDIT_COST },
          });
        }

        sendEvent(controller, "complete", updated ?? storyForStorage);
        safeClose(controller);
      } catch (err) {
        // If the client navigated away, the failure is just the disconnect.
        // Don't corrupt the story record to "failed" - leave it as-is so a
        // reload can recover, and skip the noisy error log/event.
        if (req.signal.aborted) {
          safeClose(controller);
          return;
        }
        const message =
          err instanceof StoryGenerationError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Story generation failed";
        const technicalMessage =
          err instanceof StoryGenerationError
            ? err.technicalMessage
            : err instanceof Error
              ? err.message
              : undefined;
        await db.stories.update(id, {
          status: "failed",
          generationError: message,
        });
        await logEvent({
          error: err,
          fallbackCode: "story.generation_failed",
          userId,
          userEmail: user.primaryEmailAddress?.emailAddress ?? null,
          entityType: "story",
          entityId: id,
          source: "story/stream",
          context: {
            theme: story.theme,
            profileId: story.profileId,
            technicalMessage,
          },
        });
        sendEvent(controller, "error", { error: message });
        safeClose(controller);
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
