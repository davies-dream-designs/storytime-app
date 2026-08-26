import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import {
  assertReferenceRedoAffordable,
  chargeReferenceRedoCredit,
} from "@/lib/credits";
import { logEvent } from "@/lib/logEvent";
import { FREE_REFERENCE_AVATAR_LIMIT } from "@/lib/pricing";
import {
  createChildProfileAvatarFromDescription,
  createChildProfileAvatar,
  redoChildProfileAvatar,
} from "@/lib/storyPeopleAvatars";
import { getChildProfileReferenceTraitHash } from "@/lib/characterReferenceContext";
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

/** See story-people avatar route: charge only after the avatar is delivered. */
async function chargeForDeliveredAvatar(userId: string, entityId: string) {
  try {
    await chargeReferenceRedoCredit(userId);
  } catch (err) {
    await logEvent({
      error: err,
      code: "credits.post_charge_failed",
      userId,
      entityType: "profile",
      entityId,
      source: "profiles/avatar",
    });
  }
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

  const contentType = req.headers?.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const payload = (await req.json().catch(() => ({}))) as {
      adjustment?: string;
      source?: "description";
    };
    try {
      const isDescriptionCreate =
        payload.source === "description" && !profile.avatarImageUrl;
      const existingReferenceCount = isDescriptionCreate
        ? await db.profiles.countAvatarReferencesByUserId(userId)
        : FREE_REFERENCE_AVATAR_LIMIT;
      const shouldCharge =
        !isDescriptionCreate ||
        existingReferenceCount >= FREE_REFERENCE_AVATAR_LIMIT;
      if (shouldCharge) await assertReferenceRedoAffordable(userId);
      const avatar = isDescriptionCreate
        ? await createChildProfileAvatarFromDescription({
            profile,
            adjustment: payload.adjustment ?? "",
          })
        : await redoChildProfileAvatar({
            profile,
            adjustment: payload.adjustment ?? "",
          });
      const appearance = mergeConsistencyNote(
        profile.appearance,
        avatar.consistencyNote
      );
      const nextProfile = {
        ...profile,
        avatarImageUrl: avatar.avatarImageUrl,
        appearanceSummary: avatar.appearanceSummary,
        appearance,
      };
      const updated = await db.profiles.update(id, {
        avatarImageUrl: avatar.avatarImageUrl,
        appearanceSummary: avatar.appearanceSummary,
        appearance,
        avatarTraitHash: getChildProfileReferenceTraitHash(nextProfile),
        avatarGeneratedAt: new Date().toISOString(),
      });
      if (shouldCharge) await chargeForDeliveredAvatar(userId, id);
      return NextResponse.json(updated);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Could not redo the child reference.";
      return NextResponse.json(
        { error: message },
        { status: /insufficient credits/i.test(message) ? 402 : 502 }
      );
    }
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

  try {
    const existingReferenceCount = isRedo
      ? FREE_REFERENCE_AVATAR_LIMIT
      : await db.profiles.countAvatarReferencesByUserId(userId);
    const shouldCharge =
      isRedo || existingReferenceCount >= FREE_REFERENCE_AVATAR_LIMIT;
    if (shouldCharge) await assertReferenceRedoAffordable(userId);
    const avatar = await createChildProfileAvatar({
      profile,
      file: photo,
      adjustment,
    });
    const appearance = mergeConsistencyNote(
      profile.appearance,
      avatar.consistencyNote
    );
    const nextProfile = {
      ...profile,
      avatarImageUrl: avatar.avatarImageUrl,
      appearanceSummary: avatar.appearanceSummary,
      appearance,
    };
    const updated = await db.profiles.update(id, {
      avatarImageUrl: avatar.avatarImageUrl,
      appearanceSummary: avatar.appearanceSummary,
      appearance,
      avatarTraitHash: getChildProfileReferenceTraitHash(nextProfile),
      avatarGeneratedAt: new Date().toISOString(),
    });
    if (shouldCharge) await chargeForDeliveredAvatar(userId, id);
    return NextResponse.json(updated);
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Could not create the child reference.";
    return NextResponse.json(
      {
        error: message,
      },
      { status: /insufficient credits/i.test(message) ? 402 : 502 }
    );
  }
}
