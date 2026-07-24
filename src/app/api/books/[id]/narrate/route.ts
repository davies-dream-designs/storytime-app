import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import {
  DEFAULT_NARRATION_VOICE_ID,
  NARRATION_VOICES,
  generateNarration,
  isNarrationConfigured,
  type WordTiming,
} from "@/lib/elevenlabs";
import { findBookAsset, storeBookAsset } from "@/lib/print-books/storage";

export const maxDuration = 60;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const project = await db.bookProjects.getById(id);
  if (!project || project.userId !== userId)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const isAdmin = user.privateMetadata.isAdmin === true;

  if (!isAdmin && !project.assets.digitalDownloadUnlockedAt)
    return NextResponse.json(
      { error: "Digital download purchase required" },
      { status: 402 }
    );

  if (!isNarrationConfigured())
    return NextResponse.json(
      { error: "Narration not configured" },
      { status: 503 }
    );

  const spreadId = req.nextUrl.searchParams.get("spreadId");
  if (!spreadId)
    return NextResponse.json({ error: "spreadId required" }, { status: 400 });

  const requestedVoiceId =
    req.nextUrl.searchParams.get("voiceId") ?? DEFAULT_NARRATION_VOICE_ID;
  const voiceId =
    NARRATION_VOICES.find((v) => v.id === requestedVoiceId)?.id ??
    DEFAULT_NARRATION_VOICE_ID;

  const spread = project.spreads.find((s) => s.id === spreadId);
  if (!spread)
    return NextResponse.json({ error: "Spread not found" }, { status: 404 });

  const text = [spread.leftPageText, spread.rightPageText]
    .filter(Boolean)
    .join(" ")
    .trim();
  if (!text)
    return NextResponse.json(
      { error: "No text on this page" },
      { status: 400 }
    );

  const audioPath = `books/${id}/audio/${spreadId}-${voiceId}.mp3`;
  const timingsPath = `books/${id}/audio/${spreadId}-${voiceId}.json`;

  // Return from cache if both assets exist
  const [cachedAudio, cachedTimings] = await Promise.all([
    findBookAsset(audioPath),
    findBookAsset(timingsPath),
  ]);

  if (cachedAudio && cachedTimings) {
    const timingsRes = await fetch(cachedTimings);
    const words = (await timingsRes.json()) as WordTiming[];
    return NextResponse.json({ audioUrl: cachedAudio, words });
  }

  // Generate and cache both
  const { audio, words } = await generateNarration(text, voiceId);

  const [audioUrl] = await Promise.all([
    storeBookAsset({ pathname: audioPath, body: audio, contentType: "audio/mpeg" }),
    storeBookAsset({
      pathname: timingsPath,
      body: JSON.stringify(words),
      contentType: "application/json",
    }),
  ]);

  return NextResponse.json({ audioUrl, words });
}
