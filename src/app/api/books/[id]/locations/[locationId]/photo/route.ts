import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { storeBookAsset } from "@/lib/print-books/storage";
import { validateStoryPersonPhoto } from "@/lib/storyPeopleAvatars";

/**
 * Upload a parent's reference photo for one location in the book's location
 * bible. Multipart body: `photo` (File) + `photoConsent` = "yes". The photo is
 * normalised and stored, and its URL is written to the location's
 * `referenceImageUrl` so it is added to the illustration conditioning sheet.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; locationId: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, locationId } = await params;
  const project = await db.bookProjects.getById(id);
  if (!project || project.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const bible = project.locationBible;
  const location = bible?.locations.find((loc) => loc.id === locationId);
  if (!bible || !location) {
    return NextResponse.json({ error: "Location not found" }, { status: 404 });
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
    pathname: `book-locations/${userId}/${project.id}/${locationId}-${Date.now()}.jpg`,
    body: webImage,
    contentType: "image/jpeg",
  });

  const locations = bible.locations.map((loc) =>
    loc.id === locationId ? { ...loc, referenceImageUrl } : loc
  );
  const updated = await db.bookProjects.update(id, {
    locationBible: { ...bible, locations },
  });
  return NextResponse.json({
    referenceImageUrl,
    locationBible: updated?.locationBible,
  });
}

/** Remove a location's reference photo. */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; locationId: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, locationId } = await params;
  const project = await db.bookProjects.getById(id);
  if (!project || project.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const bible = project.locationBible;
  if (!bible?.locations.some((loc) => loc.id === locationId)) {
    return NextResponse.json({ error: "Location not found" }, { status: 404 });
  }

  const locations = bible.locations.map((loc) =>
    loc.id === locationId ? { ...loc, referenceImageUrl: undefined } : loc
  );
  const updated = await db.bookProjects.update(id, {
    locationBible: { ...bible, locations },
  });
  return NextResponse.json({ locationBible: updated?.locationBible });
}
