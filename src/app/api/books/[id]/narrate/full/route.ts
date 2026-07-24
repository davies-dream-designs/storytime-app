import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import {
  DEFAULT_NARRATION_VOICE_ID,
  isNarrationConfigured,
  NARRATION_VOICES,
} from "@/lib/elevenlabs";
import { findBookAsset, storeBookAsset } from "@/lib/print-books/storage";
import { getStorySpreads } from "@/lib/print-books/video";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export type PageBoundary = {
  spreadId: string;
  endTime: number; // seconds into the audio when this page's narration ends
};

function groupCharsToWords(alignment: {
  characters: string[];
  character_end_times_seconds: number[];
}): { end: number }[] {
  const words: { end: number }[] = [];
  let inWord = false;
  let lastEnd = 0;

  for (let i = 0; i < alignment.characters.length; i++) {
    const ch = alignment.characters[i]!;
    const isSpace = ch === " " || ch === "\n";
    const end = alignment.character_end_times_seconds[i] ?? lastEnd;

    if (!isSpace) {
      inWord = true;
      lastEnd = end;
    } else if (inWord) {
      words.push({ end: lastEnd });
      inWord = false;
    }
  }
  if (inWord) words.push({ end: lastEnd });
  return words;
}

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

  const hasAccess =
    isAdmin ||
    Boolean(project.assets.digitalDownloadUnlockedAt) ||
    Boolean(project.assets.animatedVideoUnlockedAt);

  if (!hasAccess)
    return NextResponse.json(
      { error: "Purchase required to access narration" },
      { status: 402 }
    );

  if (!isNarrationConfigured())
    return NextResponse.json(
      { error: "Narration not configured" },
      { status: 503 }
    );

  const requestedVoiceId =
    req.nextUrl.searchParams.get("voiceId") ?? DEFAULT_NARRATION_VOICE_ID;
  const voiceId =
    NARRATION_VOICES.find((v) => v.id === requestedVoiceId)?.id ??
    DEFAULT_NARRATION_VOICE_ID;

  const audioPath = `books/${id}/audio/full-${voiceId}.mp3`;
  const metaPath = `books/${id}/audio/full-${voiceId}-meta.json`;

  // Return cached result if both assets exist
  const [cachedAudio, cachedMeta] = await Promise.all([
    findBookAsset(audioPath),
    findBookAsset(metaPath),
  ]);

  if (cachedAudio && cachedMeta) {
    const meta = (await (await fetch(cachedMeta)).json()) as {
      pageBoundaries: PageBoundary[];
      totalDuration: number;
    };
    return NextResponse.json({ audioUrl: cachedAudio, ...meta });
  }

  // Build full text tracking word count per spread — use ALL story spreads
  // so the narration covers every page even if some illustrations failed.
  const spreads = getStorySpreads(project.spreads);
  const spreadMeta: { spreadId: string; wordCount: number }[] = [];
  let fullText = "";

  for (const spread of spreads) {
    const text = [spread.leftPageText, spread.rightPageText]
      .filter(Boolean)
      .join(" ")
      .trim();
    if (!text) continue;

    if (fullText) fullText += " ";
    fullText += text;
    spreadMeta.push({
      spreadId: spread.id,
      wordCount: text.split(/\s+/).filter(Boolean).length,
    });
  }

  if (!fullText || spreadMeta.length === 0) {
    return NextResponse.json({ error: "No text content" }, { status: 400 });
  }

  // Single ElevenLabs call for the full story
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY is not configured");

  const ttsRes = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        text: fullText,
        model_id: "eleven_turbo_v2_5",
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.2,
          use_speaker_boost: true,
        },
      }),
    }
  );

  if (!ttsRes.ok) {
    const body = await ttsRes.text();
    throw new Error(`ElevenLabs TTS failed (${ttsRes.status}): ${body.slice(0, 300)}`);
  }

  const ttsData = (await ttsRes.json()) as {
    audio_base64: string;
    alignment: {
      characters: string[];
      character_start_times_seconds: number[];
      character_end_times_seconds: number[];
    };
  };

  // Group character alignment into words
  const words = groupCharsToWords(ttsData.alignment);
  const totalDuration =
    ttsData.alignment.character_end_times_seconds[
      ttsData.alignment.character_end_times_seconds.length - 1
    ] ?? 0;

  // Map cumulative word counts to end times
  const pageBoundaries: PageBoundary[] = [];
  let wordCursor = 0;
  for (const { spreadId, wordCount } of spreadMeta) {
    wordCursor += wordCount;
    const lastWordIdx = Math.min(wordCursor - 1, words.length - 1);
    pageBoundaries.push({
      spreadId,
      endTime: words[lastWordIdx]?.end ?? totalDuration,
    });
  }

  const audio = Buffer.from(ttsData.audio_base64, "base64");

  const [audioUrl] = await Promise.all([
    storeBookAsset({ pathname: audioPath, body: audio, contentType: "audio/mpeg" }),
    storeBookAsset({
      pathname: metaPath,
      body: JSON.stringify({ pageBoundaries, totalDuration }),
      contentType: "application/json",
    }),
  ]);

  return NextResponse.json({ audioUrl, pageBoundaries, totalDuration });
}
