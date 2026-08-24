import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { storeBookAsset } from "@/lib/print-books/storage";
import { validateStoryPersonPhoto } from "@/lib/storyPeopleAvatars";

/** Upload/replace a reusable location fixture's reference photo. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const fixture = await db.locationFixtures.getById(id);
  if (!fixture || fixture.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const form = await req.formData();
  const photo = form.get("photo");
  if (!(photo instanceof File)) {
    return NextResponse.json({ error: "photo is required" }, { status: 400 });
  }
  if (form.get("photoConsent") !== "yes") {
    return NextResponse.json(
      { error: "Photo consent is required." },
      { status: 400 }
    );
  }
  const validationError = validateStoryPersonPhoto(photo);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const source = Buffer.from(await photo.arrayBuffer());
  const webImage = await sharp(source)
    .rotate()
    .resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 82 })
    .toBuffer();

  const referenceImageUrl = await storeBookAsset({
    pathname: `location-fixtures/${userId}/${id}-${Date.now()}.jpg`,
    body: webImage,
    contentType: "image/jpeg",
  });

  const updated = await db.locationFixtures.update(id, { referenceImageUrl });
  return NextResponse.json({ referenceImageUrl, fixture: updated });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const fixture = await db.locationFixtures.getById(id);
  if (!fixture || fixture.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updated = await db.locationFixtures.update(id, {
    referenceImageUrl: undefined,
  });
  return NextResponse.json({ fixture: updated });
}
