import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { kv } from "@vercel/kv";
import { db } from "@/lib/db";
import { generateSuggestions } from "@/lib/storyGenerator";
import type { StorySuggestion } from "@/types";

const CACHE_TTL_SECONDS = 60 * 60 * 24; // 24 hours
const MAX_CACHED_SUGGESTIONS = 9;

function normalizeTheme(theme?: string) {
  return (theme ?? "calm bedtime").trim().toLowerCase();
}

function uniqueSuggestions(suggestions: StorySuggestion[]) {
  const seen = new Set<string>();
  return suggestions.filter((suggestion) => {
    const key = `${suggestion.title.trim().toLowerCase()}|${suggestion.premise.trim().toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { profileId, locale, fresh, theme } = (await req.json()) as {
    profileId: string;
    locale?: string;
    fresh?: boolean;
    theme?: string;
  };
  if (!profileId)
    return NextResponse.json(
      { error: "profileId is required" },
      { status: 400 }
    );

  const profile = await db.profiles.getById(profileId);
  if (!profile || profile.userId !== userId) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY not configured" },
      { status: 503 }
    );
  }

  const selectedTheme = normalizeTheme(theme || profile.lessons?.[0]);
  const cacheKey = `suggestions:${profileId}:${locale ?? "en"}:${selectedTheme}`;
  const cached = (await kv.get<StorySuggestion[]>(cacheKey)) ?? [];
  if (!fresh) {
    if (cached.length > 0) return NextResponse.json(cached);
  } else if (cached.length >= MAX_CACHED_SUGGESTIONS) {
    return NextResponse.json(cached);
  }

  const recentStories = (await db.stories.getByProfileId(profileId))
    .filter((s) => s.userId === userId)
    .sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1))
    .slice(0, 5)
    .map((s) => s.title);

  const suggestions = await generateSuggestions(profile, recentStories, locale, {
    selectedTheme,
    previousSuggestions: cached,
  });
  const accumulated = uniqueSuggestions([...cached, ...suggestions]).slice(
    0,
    MAX_CACHED_SUGGESTIONS
  );
  await kv.set(cacheKey, accumulated, { ex: CACHE_TTL_SECONDS });
  return NextResponse.json(accumulated);
}
