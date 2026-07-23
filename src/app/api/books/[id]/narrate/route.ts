import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import {
  DEFAULT_NARRATION_VOICE_ID,
  NARRATION_VOICES,
  generateNarration,
  isNarrationConfigured,
} from "@/lib/elevenlabs";
import {
  findBookAsset,
  storeBookAsset,
} from "@/lib/print-books/storage";

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

  const pathname = `books/${id}/audio/${spreadId}-${voiceId}.mp3`;

  // Return cached blob if it already exists
  const cached = await findBookAsset(pathname);
  if (cached) {
    return NextResponse.redirect(cached, { status: 302 });
  }

  // Generate and cache
  const audio = await generateNarration(text, voiceId);
  const audioUrl = await storeBookAsset({
    pathname,
    body: audio,
    contentType: "audio/mpeg",
  });

  return NextResponse.redirect(audioUrl, { status: 302 });
}
