import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { inngest, INNGEST_EVENTS } from "@/lib/inngest/client";
import { generateLocationEstablishingFromPhotos } from "@/lib/print-books/locationEstablishing";
import { deleteBookAssetUrls, storeBookAsset } from "@/lib/print-books/storage";
import type {
  LocationEstablishingStatus,
  LocationFixture,
  LocationBible,
  SceneLocation,
} from "@/types/printBook";

export type LocationEstablishingTarget =
  | { kind: "location_fixture"; fixtureId: string }
  | { kind: "book_location"; projectId: string; locationId: string };

export type LocationEstablishingJobData = {
  jobId: string;
  userId: string;
  target: LocationEstablishingTarget;
  photoUrls: string[];
};

function isDataUrl(url: string): boolean {
  return url.startsWith("data:");
}

function parseDataUrl(url: string): { body: Buffer; contentType: string } {
  const match = url.match(/^data:([^;,]+)(?:;base64)?,(.*)$/);
  if (!match) throw new Error("Temporary photo is unavailable");
  const [, contentType, payload] = match;
  return {
    contentType: contentType || "image/png",
    body: Buffer.from(decodeURIComponent(payload), "base64"),
  };
}

async function fileFromUrl(url: string, index: number): Promise<File> {
  if (isDataUrl(url)) {
    const { body, contentType } = parseDataUrl(url);
    const arrayBuffer = body.buffer.slice(
      body.byteOffset,
      body.byteOffset + body.byteLength
    ) as ArrayBuffer;
    return new File([arrayBuffer], `location-reference-${index + 1}.png`, {
      type: contentType,
    });
  }

  const response = await fetch(url);
  if (!response.ok) throw new Error("Temporary photo is unavailable");
  const contentType = response.headers.get("content-type") || "image/png";
  return new File(
    [await response.arrayBuffer()],
    `location-reference-${index + 1}.png`,
    {
      type: contentType,
    }
  );
}

async function loadPhotoFiles(photoUrls: string[]): Promise<File[]> {
  return Promise.all(photoUrls.map((url, index) => fileFromUrl(url, index)));
}

export async function storeTemporaryLocationPhotos(input: {
  userId: string;
  jobId: string;
  files: File[];
  targetLabel: string;
}): Promise<string[]> {
  return Promise.all(
    input.files.map(async (file, index) => {
      const extension = file.type.includes("webp")
        ? "webp"
        : file.type.includes("png")
          ? "png"
          : "jpg";
      return storeBookAsset({
        pathname: `tmp/location-establishing/${input.userId}/${input.jobId}/${input.targetLabel}-${index + 1}.${extension}`,
        body: await file.arrayBuffer(),
        contentType: file.type || "image/jpeg",
      });
    })
  );
}

function withLocationStatus(
  location: SceneLocation,
  updates: {
    status?: LocationEstablishingStatus;
    error?: string;
    jobId?: string;
    establishingImageUrl?: string;
    clearImage?: boolean;
  }
): SceneLocation {
  return {
    ...location,
    establishingImageUrl: updates.clearImage
      ? undefined
      : (updates.establishingImageUrl ?? location.establishingImageUrl),
    referenceImageUrl: updates.establishingImageUrl
      ? undefined
      : location.referenceImageUrl,
    establishingImageStatus: updates.status,
    establishingImageError: updates.error,
    establishingImageJobId: updates.jobId,
  };
}

async function updateBookLocation(input: {
  projectId: string;
  locationId: string;
  jobId: string;
  userId: string;
  status?: LocationEstablishingStatus;
  error?: string;
  establishingImageUrl?: string;
  clearImage?: boolean;
}): Promise<SceneLocation | undefined> {
  const project = await db.bookProjects.getById(input.projectId);
  if (!project || project.userId !== input.userId) return undefined;
  const bible = project.locationBible;
  const location = bible?.locations.find((loc) => loc.id === input.locationId);
  if (!bible || !location) return undefined;
  if (
    input.status !== "queued" &&
    location.establishingImageJobId !== input.jobId
  ) {
    return undefined;
  }

  const nextLocation = withLocationStatus(location, {
    status: input.status,
    error: input.error,
    jobId: input.status === "ready" ? undefined : input.jobId,
    establishingImageUrl: input.establishingImageUrl,
    clearImage: input.clearImage,
  });
  const nextBible: LocationBible = {
    ...bible,
    locations: bible.locations.map((loc) =>
      loc.id === input.locationId ? nextLocation : loc
    ),
  };
  await db.bookProjects.update(input.projectId, { locationBible: nextBible });
  return nextLocation;
}

async function getBookLocation(input: {
  projectId: string;
  locationId: string;
  jobId: string;
  userId: string;
}): Promise<SceneLocation | undefined> {
  const project = await db.bookProjects.getById(input.projectId);
  if (!project || project.userId !== input.userId) return undefined;
  const location = project.locationBible?.locations.find(
    (loc) => loc.id === input.locationId
  );
  if (!location) return undefined;
  if (location.establishingImageJobId !== input.jobId) {
    return undefined;
  }
  return location;
}

async function updateFixtureStatus(input: {
  fixtureId: string;
  jobId: string;
  userId: string;
  status?: LocationEstablishingStatus;
  error?: string;
  establishingImageUrl?: string;
  clearImage?: boolean;
}): Promise<LocationFixture | undefined> {
  const fixture = await db.locationFixtures.getById(input.fixtureId);
  if (!fixture || fixture.userId !== input.userId) return undefined;
  if (
    input.status !== "queued" &&
    fixture.establishingImageJobId !== input.jobId
  ) {
    return undefined;
  }
  return db.locationFixtures.update(input.fixtureId, {
    establishingImageUrl: input.clearImage
      ? undefined
      : (input.establishingImageUrl ?? fixture.establishingImageUrl),
    referenceImageUrl: input.establishingImageUrl
      ? undefined
      : fixture.referenceImageUrl,
    establishingImageStatus: input.status,
    establishingImageError: input.error,
    establishingImageJobId: input.status === "ready" ? undefined : input.jobId,
  });
}

async function getFixture(input: {
  fixtureId: string;
  jobId: string;
  userId: string;
}): Promise<LocationFixture | undefined> {
  const fixture = await db.locationFixtures.getById(input.fixtureId);
  if (!fixture || fixture.userId !== input.userId) return undefined;
  if (fixture.establishingImageJobId !== input.jobId) {
    return undefined;
  }
  return fixture;
}

async function markTarget(
  input: LocationEstablishingJobData & {
    status?: LocationEstablishingStatus;
    error?: string;
    establishingImageUrl?: string;
  }
): Promise<void> {
  if (input.target.kind === "location_fixture") {
    await updateFixtureStatus({
      fixtureId: input.target.fixtureId,
      userId: input.userId,
      jobId: input.jobId,
      status: input.status,
      error: input.error,
      establishingImageUrl: input.establishingImageUrl,
    });
    return;
  }

  await updateBookLocation({
    projectId: input.target.projectId,
    locationId: input.target.locationId,
    userId: input.userId,
    jobId: input.jobId,
    status: input.status,
    error: input.error,
    establishingImageUrl: input.establishingImageUrl,
  });
}

async function getTargetLocation(
  input: LocationEstablishingJobData
): Promise<SceneLocation | LocationFixture | undefined> {
  if (input.target.kind === "location_fixture") {
    return getFixture({
      fixtureId: input.target.fixtureId,
      userId: input.userId,
      jobId: input.jobId,
    });
  }

  return getBookLocation({
    projectId: input.target.projectId,
    locationId: input.target.locationId,
    userId: input.userId,
    jobId: input.jobId,
  });
}

export async function enqueueLocationEstablishingJob(input: {
  userId: string;
  target: LocationEstablishingTarget;
  files: File[];
  targetLabel: string;
}): Promise<{ jobId: string; photoUrls: string[] }> {
  const jobId = randomUUID();
  const photoUrls = await storeTemporaryLocationPhotos({
    userId: input.userId,
    jobId,
    files: input.files,
    targetLabel: input.targetLabel,
  });

  const jobData: LocationEstablishingJobData = {
    jobId,
    userId: input.userId,
    target: input.target,
    photoUrls,
  };

  try {
    await markTarget({ ...jobData, status: "queued", error: undefined });
    await inngest.send({
      name: INNGEST_EVENTS.locationEstablishingRequested,
      data: jobData,
    });
  } catch (err) {
    await markTarget({
      ...jobData,
      status: "failed",
      error: "Could not start background drawing. Please try again.",
    }).catch(() => undefined);
    await deleteBookAssetUrls(photoUrls).catch(() => 0);
    throw err;
  }

  return { jobId, photoUrls };
}

export async function processLocationEstablishingJob(
  input: LocationEstablishingJobData
): Promise<{ jobId: string; status: LocationEstablishingStatus | "stale" }> {
  try {
    await markTarget({ ...input, status: "running", error: undefined });
    const location = await getTargetLocation(input);
    if (!location) return { jobId: input.jobId, status: "stale" };

    const files = await loadPhotoFiles(input.photoUrls);
    const { establishingImageUrl } =
      await generateLocationEstablishingFromPhotos({
        location,
        files,
        pathnamePrefix:
          input.target.kind === "location_fixture"
            ? `location-fixtures/${input.userId}/${input.target.fixtureId}`
            : `book-locations/${input.userId}/${input.target.projectId}/${input.target.locationId}`,
      });

    await markTarget({
      ...input,
      status: "ready",
      error: undefined,
      establishingImageUrl,
    });
    return { jobId: input.jobId, status: "ready" };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Generation failed";
    await markTarget({ ...input, status: "failed", error: message }).catch(
      () => undefined
    );
    return { jobId: input.jobId, status: "failed" };
  } finally {
    await deleteBookAssetUrls(input.photoUrls).catch(() => 0);
  }
}
