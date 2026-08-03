import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import {
  chargeReferenceRedoCredit,
  refundReferenceRedoCredit,
} from "@/lib/credits";
import { FREE_REFERENCE_AVATAR_LIMIT } from "@/lib/pricing";
import {
  createStoryPersonAvatar,
  redoStoryPersonAvatar,
} from "@/lib/storyPeopleAvatars";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const person = await db.storyPeople.getById(id);
  if (!person || person.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const contentType = req.headers?.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const payload = (await req.json().catch(() => ({}))) as {
      adjustment?: string;
    };
    let charged = false;
    try {
      const charge = await chargeReferenceRedoCredit(userId);
      charged = charge.charged;
      const avatar = await redoStoryPersonAvatar({
        person,
        adjustment: payload.adjustment ?? "",
      });
      const updated = await db.storyPeople.update(id, {
        avatarImageUrl: avatar.avatarImageUrl,
        appearance: avatar.appearance,
        appearanceSummary: avatar.appearanceSummary,
      });
      return NextResponse.json(updated);
    } catch (err) {
      if (charged) await refundReferenceRedoCredit(userId);
      const message =
        err instanceof Error
          ? err.message
          : "Could not redo the illustrated reference.";
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
  const isRedo = Boolean(person.avatarImageUrl);
  let charged = false;

  try {
    const existingReferenceCount = isRedo
      ? FREE_REFERENCE_AVATAR_LIMIT
      : await db.storyPeople.countAvatarReferencesByUserId(userId);
    const shouldCharge =
      isRedo || existingReferenceCount >= FREE_REFERENCE_AVATAR_LIMIT;
    if (shouldCharge) {
      const charge = await chargeReferenceRedoCredit(userId);
      charged = charge.charged;
    }
    const avatar = await createStoryPersonAvatar({
      person,
      file: photo,
      adjustment,
    });
    const updated = await db.storyPeople.update(id, {
      avatarImageUrl: avatar.avatarImageUrl,
      appearance: avatar.appearance,
      appearanceSummary: avatar.appearanceSummary,
    });
    return NextResponse.json(updated);
  } catch (err) {
    if (charged) await refundReferenceRedoCredit(userId);
    const message =
      err instanceof Error
        ? err.message
        : "Could not create the illustrated reference.";
    return NextResponse.json(
      {
        error: message,
      },
      { status: /insufficient credits/i.test(message) ? 402 : 502 }
    );
  }
}
