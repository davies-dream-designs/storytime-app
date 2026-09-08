import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { inngest, INNGEST_EVENTS } from "@/lib/inngest/client";
import { generateLocationEstablishingFromPhotos } from "@/lib/print-books/locationEstablishing";
import {
  deleteTemporaryPrivateAssets,
  readTemporaryPrivateAsset,
  storeTemporaryPrivateAsset,
} from "@/lib/print-books/storage";
import type {
  LocationEstablishingStatus,
  LocationFixture,
  LocationBible,
  LocationView,
  SceneLocation,
} from "@/types/printBook";

export type LocationEstablishingTarget =
  | { kind: "location_fixture"; fixtureId: string }
  | { kind: "book_location"; projectId: string; locationId: string };

export type LocationEstablishingJobData = {
  jobId: string;
  userId: string;
  target: LocationEstablishingTarget;
  /** Private temporary asset refs (pathnames or inline data) for the photos. */
  photoRefs: string[];
  /** Optional perspective this job draws. Absent = the primary/only view. */
  viewId?: string;
  viewLabel?: string;
};

/**
 * A failure the scheduler should retry (e.g. a transient provider/network
 * error). Throwing this from a worker lets Inngest re-run the step with the
 * private input photos still intact, instead of the old behaviour of returning
 * `{ status: "failed" }` (which the scheduler saw as success and never retried).
 */
export class RetryableLocationJobError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RetryableLocationJobError";
  }
}

function isRetryable(error: unknown): boolean {
  if (error instanceof RetryableLocationJobError) return true;
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return (
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("network") ||
    message.includes("econnreset") ||
    message.includes("rate limit") ||
    message.includes("etimedout") ||
    message.includes("temporarily") ||
    message.includes("503") ||
    message.includes("502") ||
    message.includes("429")
  );
}

async function loadPhotoFiles(photoRefs: string[]): Promise<File[]> {
  return Promise.all(
    photoRefs.map(async (ref, index) => {
      const { buffer, contentType } = await readTemporaryPrivateAsset(ref);
      const arrayBuffer = buffer.buffer.slice(
        buffer.byteOffset,
        buffer.byteOffset + buffer.byteLength
      ) as ArrayBuffer;
      return new File([arrayBuffer], `location-reference-${index + 1}.png`, {
        type: contentType,
      });
    })
  );
}

/**
 * Store uploaded room photos privately, tracking every object we successfully
 * created so a partial-batch failure still cleans up rather than leaking a
 * public family photo (the old flow uploaded publicly and only cleaned up from
 * inside a later try block).
 */
export async function storeTemporaryLocationPhotos(input: {
  userId: string;
  jobId: string;
  files: File[];
  targetLabel: string;
}): Promise<string[]> {
  const created: string[] = [];
  try {
    for (const [index, file] of input.files.entries()) {
      const extension = file.type.includes("webp")
        ? "webp"
        : file.type.includes("png")
          ? "png"
          : "jpg";
      const { ref } = await storeTemporaryPrivateAsset({
        pathname: `tmp/location-establishing/${input.userId}/${input.jobId}/${input.targetLabel}-${index + 1}.${extension}`,
        body: await file.arrayBuffer(),
        contentType: file.type || "image/jpeg",
      });
      created.push(ref);
    }
    return created;
  } catch (err) {
    await deleteTemporaryPrivateAssets(created).catch(() => undefined);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// View helpers (multi-perspective support)
// ---------------------------------------------------------------------------

function upsertView(
  views: LocationView[] | undefined,
  view: LocationView
): LocationView[] {
  const existing = views ?? [];
  const without = existing.filter((v) => v.id !== view.id);
  const next = [...without, view];
  // Exactly one primary. If none marked, the first becomes primary.
  const hasPrimary = next.some((v) => v.isPrimary);
  return next.map((v, index) => ({
    ...v,
    isPrimary: hasPrimary ? v.isPrimary === true : index === 0,
  }));
}

function primaryImageUrl(views: LocationView[]): string | undefined {
  return (
    views.find((v) => v.isPrimary && v.imageUrl)?.imageUrl ??
    views.find((v) => v.imageUrl)?.imageUrl
  );
}

// ---------------------------------------------------------------------------
// Fixture target (atomic, compare-and-swap on job id)
// ---------------------------------------------------------------------------

async function markFixture(input: {
  fixtureId: string;
  jobId: string;
  userId: string;
  viewId?: string;
  viewLabel?: string;
  status: LocationEstablishingStatus;
  error?: string;
  establishingImageUrl?: string;
}): Promise<LocationFixture | undefined> {
  const fixture = await db.locationFixtures.getById(input.fixtureId);
  if (!fixture || fixture.userId !== input.userId) return undefined;

  // Queuing claims the fixture for this job. Any later transition must still own
  // it, or a newer upload/deletion has superseded us.
  if (
    input.status !== "queued" &&
    fixture.establishingImageJobId !== input.jobId
  ) {
    return undefined;
  }

  const viewId = input.viewId ?? "primary";
  const priorView = fixture.views?.find((v) => v.id === viewId);
  const nextView: LocationView = {
    id: viewId,
    label: input.viewLabel ?? priorView?.label ?? "Wide",
    imageUrl:
      input.status === "ready"
        ? (input.establishingImageUrl ?? priorView?.imageUrl)
        : priorView?.imageUrl,
    status: input.status,
    error: input.error,
    jobId: input.status === "ready" ? undefined : input.jobId,
    isPrimary: priorView?.isPrimary ?? (fixture.views ?? []).length === 0,
    createdAt: priorView?.createdAt ?? new Date().toISOString(),
  };
  const views = upsertView(fixture.views, nextView);
  const establishingImageUrl = primaryImageUrl(views);

  const updates: Partial<LocationFixture> = {
    views,
    establishingImageUrl:
      input.status === "ready"
        ? establishingImageUrl
        : fixture.establishingImageUrl,
    referenceImageUrl:
      input.status === "ready" && input.establishingImageUrl
        ? undefined
        : fixture.referenceImageUrl,
    establishingImageStatus: input.status,
    establishingImageError: input.error,
    establishingImageJobId: input.status === "ready" ? undefined : input.jobId,
  };

  if (input.status === "queued") {
    // First claim: an unconditional owner-scoped write is safe because no other
    // job holds this fixture yet.
    return db.locationFixtures.update(input.fixtureId, updates);
  }
  // Later transitions must win the compare-and-swap against the claimed job id.
  return db.locationFixtures.updateIfJob(
    input.fixtureId,
    input.jobId,
    input.userId,
    updates
  );
}

type RenderedView = {
  id: string;
  label: string;
  imageUrl?: string;
  status: LocationEstablishingStatus;
  error?: string;
};

/**
 * Atomically write one-or-more rendered perspectives to a fixture in a single
 * compare-and-swap update (owned by this job). Used for multi-photo uploads
 * where each photo becomes its own view/render — writing them together avoids
 * concurrent read-modify-write races on the `views` jsonb array.
 */
async function finalizeFixtureViews(input: {
  fixtureId: string;
  jobId: string;
  userId: string;
  rendered: RenderedView[];
}): Promise<LocationFixture | undefined> {
  const fixture = await db.locationFixtures.getById(input.fixtureId);
  if (!fixture || fixture.userId !== input.userId) return undefined;
  if (fixture.establishingImageJobId !== input.jobId) return undefined;

  let views = fixture.views ?? [];
  for (const r of input.rendered) {
    const prior = views.find((v) => v.id === r.id);
    views = upsertView(views, {
      id: r.id,
      label: r.label,
      imageUrl: r.status === "ready" ? r.imageUrl : prior?.imageUrl,
      status: r.status,
      error: r.error,
      jobId: undefined,
      isPrimary: prior?.isPrimary,
      createdAt: prior?.createdAt ?? new Date().toISOString(),
    });
  }

  // Drop the placeholder view the generic "running" marker created (no image,
  // still queued/running) so fan-out doesn't leave an empty extra angle.
  views = views.filter(
    (v) =>
      v.imageUrl ||
      v.status === "failed" ||
      input.rendered.some((r) => r.id === v.id)
  );
  // Filtering may have removed the primary; re-establish exactly one, in order.
  const hasPrimary = views.some((v) => v.isPrimary);
  views = views.map((v, i) => ({
    ...v,
    isPrimary: hasPrimary ? v.isPrimary === true : i === 0,
  }));

  const anyReady = input.rendered.some((r) => r.status === "ready");
  const establishingImageUrl = primaryImageUrl(views);
  return db.locationFixtures.updateIfJob(
    input.fixtureId,
    input.jobId,
    input.userId,
    {
      views,
      establishingImageUrl: anyReady
        ? establishingImageUrl
        : fixture.establishingImageUrl,
      referenceImageUrl: anyReady ? undefined : fixture.referenceImageUrl,
      establishingImageStatus: anyReady ? "ready" : "failed",
      establishingImageError: anyReady
        ? undefined
        : (input.rendered.find((r) => r.error)?.error ?? "Generation failed"),
      establishingImageJobId: undefined,
    }
  );
}

async function getFixtureForJob(input: {
  fixtureId: string;
  jobId: string;
  userId: string;
}): Promise<LocationFixture | undefined> {
  const fixture = await db.locationFixtures.getById(input.fixtureId);
  if (!fixture || fixture.userId !== input.userId) return undefined;
  if (fixture.establishingImageJobId !== input.jobId) return undefined;
  return fixture;
}

// ---------------------------------------------------------------------------
// Book-location target
// ---------------------------------------------------------------------------

function withLocationStatus(
  location: SceneLocation,
  updates: {
    status: LocationEstablishingStatus;
    error?: string;
    jobId?: string;
    establishingImageUrl?: string;
  }
): SceneLocation {
  const drewImage =
    updates.status === "ready" && Boolean(updates.establishingImageUrl);
  return {
    ...location,
    establishingImageUrl: drewImage
      ? updates.establishingImageUrl
      : location.establishingImageUrl,
    referenceImageUrl: drewImage ? undefined : location.referenceImageUrl,
    // A drawn book-location image is a book-specific correction; protect it from
    // later fixture re-application.
    hasBookOverrides: drewImage ? true : location.hasBookOverrides,
    establishingImageStatus: updates.status,
    establishingImageError: updates.error,
    establishingImageJobId:
      updates.status === "ready" ? undefined : updates.jobId,
  };
}

async function markBookLocation(input: {
  projectId: string;
  locationId: string;
  jobId: string;
  userId: string;
  status: LocationEstablishingStatus;
  error?: string;
  establishingImageUrl?: string;
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
    jobId: input.jobId,
    establishingImageUrl: input.establishingImageUrl,
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

async function getBookLocationForJob(input: {
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
  if (!location || location.establishingImageJobId !== input.jobId) {
    return undefined;
  }
  return location;
}

// ---------------------------------------------------------------------------
// Unified target dispatch
// ---------------------------------------------------------------------------

async function markTarget(
  input: LocationEstablishingJobData & {
    status: LocationEstablishingStatus;
    error?: string;
    establishingImageUrl?: string;
  }
): Promise<LocationFixture | SceneLocation | undefined> {
  if (input.target.kind === "location_fixture") {
    return markFixture({
      fixtureId: input.target.fixtureId,
      userId: input.userId,
      jobId: input.jobId,
      viewId: input.viewId,
      viewLabel: input.viewLabel,
      status: input.status,
      error: input.error,
      establishingImageUrl: input.establishingImageUrl,
    });
  }

  return markBookLocation({
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
    return getFixtureForJob({
      fixtureId: input.target.fixtureId,
      userId: input.userId,
      jobId: input.jobId,
    });
  }
  return getBookLocationForJob({
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
  viewId?: string;
  viewLabel?: string;
}): Promise<{ jobId: string; photoRefs: string[] }> {
  const jobId = randomUUID();
  const photoRefs = await storeTemporaryLocationPhotos({
    userId: input.userId,
    jobId,
    files: input.files,
    targetLabel: input.targetLabel,
  });

  const jobData: LocationEstablishingJobData = {
    jobId,
    userId: input.userId,
    target: input.target,
    photoRefs,
    viewId: input.viewId,
    viewLabel: input.viewLabel,
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
    await deleteTemporaryPrivateAssets(photoRefs).catch(() => undefined);
    throw err;
  }

  return { jobId, photoRefs };
}

/**
 * Draw the establishing illustration for one location perspective.
 *
 * On a transient failure this throws (retryable) and leaves the private input
 * photos in place so Inngest can retry. Terminal failure and the final cleanup
 * are handled here or via {@link finalizeFailedLocationJob} (called from the
 * Inngest onFailure handler) so photos are never deleted before retries are
 * exhausted.
 */
export async function processLocationEstablishingJob(
  input: LocationEstablishingJobData
): Promise<{ jobId: string; status: LocationEstablishingStatus | "stale" }> {
  await markTarget({ ...input, status: "running", error: undefined });
  const location = await getTargetLocation(input);
  if (!location) {
    // Superseded or removed: nothing to draw. Clean up inputs.
    await deleteTemporaryPrivateAssets(input.photoRefs).catch(() => undefined);
    return { jobId: input.jobId, status: "stale" };
  }

  // Fixture uploads without an explicit view render one perspective per photo.
  const fanOut =
    input.target.kind === "location_fixture" &&
    !input.viewId &&
    input.photoRefs.length > 1;

  if (fanOut && input.target.kind === "location_fixture") {
    const fixture = location as LocationFixture;
    const existingCount = (fixture.views ?? []).length;
    const files = await loadPhotoFiles(input.photoRefs);
    const rendered: RenderedView[] = [];
    for (let i = 0; i < files.length; i++) {
      // Deterministic view id keyed to this job so a retry updates the same
      // views rather than creating duplicates.
      const viewId = `${input.jobId}-${i}`;
      const label = input.viewLabel
        ? `${input.viewLabel} ${i + 1}`
        : `Angle ${existingCount + i + 1}`;
      try {
        const { establishingImageUrl } =
          await generateLocationEstablishingFromPhotos({
            location,
            files: [files[i]],
            pathnamePrefix: `location-fixtures/${input.userId}/${input.target.fixtureId}-${viewId}`,
          });
        rendered.push({ id: viewId, label, imageUrl: establishingImageUrl, status: "ready" });
      } catch (err) {
        if (isRetryable(err)) {
          // Keep inputs; retry the whole job (deterministic ids make this safe).
          throw err instanceof Error ? err : new Error(String(err));
        }
        rendered.push({
          id: viewId,
          label,
          status: "failed",
          error: err instanceof Error ? err.message : "Generation failed",
        });
      }
    }
    await finalizeFixtureViews({
      fixtureId: input.target.fixtureId,
      jobId: input.jobId,
      userId: input.userId,
      rendered,
    });
    await deleteTemporaryPrivateAssets(input.photoRefs).catch(() => undefined);
    return {
      jobId: input.jobId,
      status: rendered.some((r) => r.status === "ready") ? "ready" : "failed",
    };
  }

  let establishingImageUrl: string;
  try {
    const files = await loadPhotoFiles(input.photoRefs);
    ({ establishingImageUrl } = await generateLocationEstablishingFromPhotos({
      location,
      files,
      pathnamePrefix:
        input.target.kind === "location_fixture"
          ? `location-fixtures/${input.userId}/${input.target.fixtureId}${
              input.viewId ? `-${input.viewId}` : ""
            }`
          : `book-locations/${input.userId}/${input.target.projectId}/${input.target.locationId}`,
    }));
  } catch (err) {
    if (isRetryable(err)) {
      // Keep inputs; let the scheduler retry this step.
      throw err instanceof Error ? err : new Error(String(err));
    }
    const message = err instanceof Error ? err.message : "Generation failed";
    await finalizeFailedLocationJob(input, message);
    return { jobId: input.jobId, status: "failed" };
  }

  await markTarget({
    ...input,
    status: "ready",
    error: undefined,
    establishingImageUrl,
  });
  await deleteTemporaryPrivateAssets(input.photoRefs).catch(() => undefined);
  return { jobId: input.jobId, status: "ready" };
}

/** Record terminal failure and clean up private inputs (retries exhausted). */
export async function finalizeFailedLocationJob(
  input: LocationEstablishingJobData,
  message: string
): Promise<void> {
  await markTarget({ ...input, status: "failed", error: message }).catch(
    () => undefined
  );
  await deleteTemporaryPrivateAssets(input.photoRefs).catch(() => undefined);
}
