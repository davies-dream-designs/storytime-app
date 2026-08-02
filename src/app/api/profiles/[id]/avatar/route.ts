import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import {
  chargeReferenceRedoCredit,
  refundReferenceRedoCredit,
} from "@/lib/credits";
import { createChildProfileAvatar } from "@/lib/storyPeopleAvatars";
import type { ChildAppearance } from "@/types/profileAppearance";

function mergeConsistencyNote(
  appearance: ChildAppearance | undefined,
  consistencyNote?: string
): ChildAppearance | undefined {
  if (!consistencyNote) return appearance;
  const current = appearance ?? {
    hairStyles: [],
    featureEmphasis: [],
    distinguishingFeatures: [],
    expressionVibes: [],
  };
  return {
    ...current,
    consistencyNote: consistencyNote.slice(0, 140),
  };
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const profile = await db.profiles.getById(id);
  if (!profile || profile.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const formData = await req.formData();
  const photo = formData.get("photo");
  if (!(photo instanceof File)) {
    return NextResponse.json(
      { error: "Please upload a photo." },
      { status: 400 }
    );
  }
  if (formData.get("photoConsent") !== "yes") {
    return NextResponse.json(
      {
        error:
          "Please confirm you have permission to use this photo and understand it will be used once to create an illustrated reference.",
      },
      { status: 400 }
    );
  }
  const adjustment = String(formData.get("adjustment") ?? "")
    .trim()
    .slice(0, 240);
  const isRedo = Boolean(profile.avatarImageUrl);
  let charged = false;

  try {
    if (isRedo) {
      const charge = await chargeReferenceRedoCredit(userId);
      charged = charge.charged;
    }
    const avatar = await createChildProfileAvatar({
      profile,
      file: photo,
      adjustment,
    });
    const updated = await db.profiles.update(id, {
      avatarImageUrl: avatar.avatarImageUrl,
      appearanceSummary: avatar.appearanceSummary,
      appearance: mergeConsistencyNote(
        profile.appearance,
        avatar.consistencyNote
      ),
    });
    return NextResponse.json(updated);
  } catch (err) {
    if (charged) await refundReferenceRedoCredit(userId);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Could not create the child reference.",
      },
      { status: 502 }
    );
  }
}
