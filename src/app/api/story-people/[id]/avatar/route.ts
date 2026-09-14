import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { enqueueStoryPersonAvatarGeneration } from "@/lib/avatarGenerationJobs";

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

  const attemptKey = req.headers.get("Idempotency-Key");
  const contentType = req.headers?.get("content-type") ?? "";

  try {
    if (contentType.includes("application/json")) {
      const payload = (await req.json().catch(() => ({}))) as {
        adjustment?: string;
        source?: "description";
        attemptKey?: string;
      };
      const source =
        payload.source === "description" && !person.avatarImageUrl
          ? "description"
          : "redo";
      const result = await enqueueStoryPersonAvatarGeneration({
        person,
        source,
        adjustment: payload.adjustment ?? "",
        attemptKey: payload.attemptKey ?? attemptKey,
      });
      return NextResponse.json(result, { status: result.existing ? 200 : 202 });
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

    const result = await enqueueStoryPersonAvatarGeneration({
      person,
      source: "photo",
      file: photo,
      adjustment: String(formData.get("adjustment") ?? ""),
      attemptKey: String(formData.get("attemptKey") ?? "") || attemptKey,
    });
    return NextResponse.json(result, { status: result.existing ? 200 : 202 });
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Could not start the illustrated reference.";
    return NextResponse.json(
      { error: message },
      { status: /insufficient credits/i.test(message) ? 402 : 502 }
    );
  }
}
