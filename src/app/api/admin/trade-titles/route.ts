import { NextRequest, NextResponse } from "next/server";
import { getAdminIdentity } from "@/lib/adminAuth";
import { db } from "@/lib/db";
import { CHILD_GENDERS, STORY_PRESETS, type ChildGender } from "@/types";
import type { TradeTitle, TradeTitleSeedBrief } from "@/types/tradeBook";

const LISTED_STATUSES = [
  "queued",
  "generating",
  "draft",
  "approved",
  "rejected",
  "failed",
] as const;

type CreateTradeTitleBody = {
  theme?: unknown;
  premise?: unknown;
  notes?: unknown;
  storyPreset?: unknown;
  locale?: unknown;
  protagonist?: {
    name?: unknown;
    age?: unknown;
    gender?: unknown;
  };
};

function requiredText(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const text = value.trim();
  return text.length <= 2000 ? text : undefined;
}

function parseSeedBrief(
  body: CreateTradeTitleBody
): TradeTitleSeedBrief | undefined {
  const theme = requiredText(body.theme);
  const premise = requiredText(body.premise);
  const notes = typeof body.notes === "string" ? body.notes.trim() : "";
  const locale = requiredText(body.locale);
  const name = requiredText(body.protagonist?.name);
  const age = body.protagonist?.age;
  const gender = body.protagonist?.gender;

  if (
    !theme ||
    !premise ||
    !locale ||
    !name ||
    notes.length > 4000 ||
    !STORY_PRESETS.includes(
      body.storyPreset as (typeof STORY_PRESETS)[number]
    ) ||
    typeof age !== "number" ||
    !Number.isInteger(age) ||
    age < 0 ||
    age > 18 ||
    (gender !== undefined && !CHILD_GENDERS.includes(gender as ChildGender))
  ) {
    return undefined;
  }

  return {
    theme,
    premise,
    notes,
    storyPreset: body.storyPreset as TradeTitleSeedBrief["storyPreset"],
    locale,
    protagonist: {
      name,
      age,
      ...(gender === undefined ? {} : { gender: gender as ChildGender }),
    },
  };
}

export async function GET() {
  if (!(await getAdminIdentity())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const titles = await db.tradeTitles.listByStatuses([...LISTED_STATUSES]);
  return NextResponse.json({ titles });
}

export async function POST(req: NextRequest) {
  if (!(await getAdminIdentity())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as CreateTradeTitleBody;
  const seedBrief = parseSeedBrief(body);
  if (!seedBrief) {
    return NextResponse.json(
      {
        error:
          "Provide valid theme, premise, preset, locale, and protagonist details.",
      },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();
  const title: TradeTitle = {
    id: crypto.randomUUID(),
    status: "queued",
    seedBrief,
    createdAt: now,
    updatedAt: now,
  };

  await db.tradeTitles.create(title);
  await db.tradeBookJobs.enqueue({
    kind: "generate_title",
    dedupeKey: `generate-title:${title.id}:v1`,
    payload: { tradeTitleId: title.id },
  });

  return NextResponse.json({ title }, { status: 201 });
}
