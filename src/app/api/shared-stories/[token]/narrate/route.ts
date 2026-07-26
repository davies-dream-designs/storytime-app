import { NextRequest, NextResponse } from "next/server";
import {
  DEFAULT_NARRATION_VOICE_ID,
  NARRATION_VOICES,
  generateNarration,
  isNarrationConfigured,
  type WordTiming,
} from "@/lib/elevenlabs";
import { findBookAsset, storeBookAsset } from "@/lib/print-books/storage";
import { getSharedStoryByToken } from "@/lib/sharedStory";

export const maxDuration = 60;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const shared = await getSharedStoryByToken(token);
  if (!shared?.project || !shared.narrationEnabled) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!isNarrationConfigured()) {
    return NextResponse.json(
      { error: "Narration not configured" },
      { status: 503 }
    );
  }

  const projectId = req.nextUrl.searchParams.get("projectId");
  if (projectId !== shared.project.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const spreadId = req.nextUrl.searchParams.get("spreadId");
  if (!spreadId) {
    return NextResponse.json({ error: "spreadId required" }, { status: 400 });
  }

  const spread = shared.project.spreads.find((item) => item.id === spreadId);
  const publicSpread = shared.spreads.find((item) => item.id === spreadId);
  if (!spread || !publicSpread) {
    return NextResponse.json({ error: "Spread not found" }, { status: 404 });
  }

  const text = [spread.leftPageText, spread.rightPageText]
    .filter(Boolean)
    .join(" ")
    .trim();
  if (!text) {
    return NextResponse.json(
      { error: "No text on this page" },
      { status: 400 }
    );
  }

  const requestedVoiceId =
    req.nextUrl.searchParams.get("voiceId") ?? DEFAULT_NARRATION_VOICE_ID;
  const voiceId =
    NARRATION_VOICES.find((voice) => voice.id === requestedVoiceId)?.id ??
    DEFAULT_NARRATION_VOICE_ID;

  const audioPath = `books/${shared.project.id}/audio/${spreadId}-${voiceId}.mp3`;
  const timingsPath = `books/${shared.project.id}/audio/${spreadId}-${voiceId}.json`;

  const [cachedAudio, cachedTimings] = await Promise.all([
    findBookAsset(audioPath),
    findBookAsset(timingsPath),
  ]);

  if (cachedAudio && cachedTimings) {
    const timingsRes = await fetch(cachedTimings);
    const words = (await timingsRes.json()) as WordTiming[];
    return NextResponse.json({ audioUrl: cachedAudio, words });
  }

  const { audio, words } = await generateNarration(text, voiceId);

  const [audioUrl] = await Promise.all([
    storeBookAsset({
      pathname: audioPath,
      body: audio,
      contentType: "audio/mpeg",
    }),
    storeBookAsset({
      pathname: timingsPath,
      body: JSON.stringify(words),
      contentType: "application/json",
    }),
  ]);

  return NextResponse.json({ audioUrl, words });
}
