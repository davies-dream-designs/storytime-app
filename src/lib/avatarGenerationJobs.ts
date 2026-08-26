import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { inngest, INNGEST_EVENTS } from "@/lib/inngest/client";
import { getChildProfileReferenceTraitHash, getStoryPersonReferenceTraitHash } from "@/lib/characterReferenceContext";
import { assertReferenceRedoAffordable, chargeReferenceRedoCredit } from "@/lib/credits";
import { logEvent } from "@/lib/logEvent";
import { deleteBookAssetUrls, storeBookAsset } from "@/lib/print-books/storage";
import { FREE_REFERENCE_AVATAR_LIMIT } from "@/lib/pricing";
import {
  createChildProfileAvatar,
  createChildProfileAvatarFromDescription,
  createStoryPersonAvatar,
  createStoryPersonAvatarFromDescription,
  redoChildProfileAvatar,
  redoStoryPersonAvatar,
} from "@/lib/storyPeopleAvatars";
import type { ChildProfile, StoryPerson } from "@/types";
import type { ChildAppearance } from "@/types/profileAppearance";

type AvatarTarget =
  | { kind: "profile"; id: string }
  | { kind: "story_person"; id: string };

type AvatarSource = "photo" | "description" | "redo";

export type AvatarGenerationJobData = {
  jobId: string;
  userId: string;
  target: AvatarTarget;
  source: AvatarSource;
  adjustment: string;
  attemptKey: string;
  shouldCharge: boolean;
  tempPhotoUrl?: string;
};

export type AvatarGenerationEnqueueResult = {
  jobId: string;
  status: "queued" | "running";
  attemptKey: string;
  existing: boolean;
};

function isActiveAvatarStatus(status?: string) {
  return status === "queued" || status === "running";
}

function sanitizeAttemptKey(value?: string | null) {
  const cleaned = value?.trim().slice(0, 160);
  return cleaned || randomUUID();
}

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

function extensionForFile(file: File) {
  const type = file.type.toLowerCase();
  if (type.includes("webp")) return "webp";
  if (type.includes("png")) return "png";
  return "jpg";
}

async function storeTemporaryAvatarPhoto(input: {
  userId: string;
  jobId: string;
  file: File;
}) {
  return storeBookAsset({
    pathname: `tmp/avatar-generation/${input.userId}/${input.jobId}/source.${extensionForFile(input.file)}`,
    body: await input.file.arrayBuffer(),
    contentType: input.file.type || "image/jpeg",
  });
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

async function fileFromTemporaryUrl(url: string): Promise<File> {
  if (url.startsWith("data:")) {
    const { body, contentType } = parseDataUrl(url);
    const arrayBuffer = body.buffer.slice(
      body.byteOffset,
      body.byteOffset + body.byteLength
    ) as ArrayBuffer;
    return new File([arrayBuffer], "avatar-source.png", { type: contentType });
  }

  const response = await fetch(url);
  if (!response.ok) throw new Error("Temporary photo is unavailable");
  return new File([await response.arrayBuffer()], "avatar-source.jpg", {
    type: response.headers.get("content-type") || "image/jpeg",
  });
}

async function chargeForDeliveredAvatar(input: {
  userId: string;
  entityType: "profile" | "story_person";
  entityId: string;
  source: string;
}) {
  try {
    await chargeReferenceRedoCredit(input.userId);
  } catch (err) {
    await logEvent({
      error: err,
      code: "credits.post_charge_failed",
      userId: input.userId,
      entityType: input.entityType,
      entityId: input.entityId,
      source: input.source,
    });
  }
}

async function deleteAfterCommit(url?: string) {
  if (!url) return;
  await deleteBookAssetUrls([url]).catch((err) => {
    console.warn("Could not delete previous illustrated reference.", {
      error: err instanceof Error ? err.message : String(err),
    });
  });
}

async function enqueueProfileAvatar(input: {
  profile: ChildProfile;
  source: AvatarSource;
  adjustment: string;
  attemptKey: string;
  file?: File;
}): Promise<AvatarGenerationEnqueueResult> {
  if (isActiveAvatarStatus(input.profile.avatarGenerationStatus)) {
    return {
      jobId: input.profile.avatarGenerationJobId ?? input.attemptKey,
      status: input.profile.avatarGenerationStatus as "queued" | "running",
      attemptKey: input.profile.avatarGenerationAttemptKey ?? input.attemptKey,
      existing: true,
    };
  }

  const isDescriptionCreate =
    input.source === "description" && !input.profile.avatarImageUrl;
  const existingReferenceCount = isDescriptionCreate
    ? await db.profiles.countAvatarReferencesByUserId(input.profile.userId)
    : FREE_REFERENCE_AVATAR_LIMIT;
  const shouldCharge =
    !isDescriptionCreate || existingReferenceCount >= FREE_REFERENCE_AVATAR_LIMIT;
  if (shouldCharge) await assertReferenceRedoAffordable(input.profile.userId);

  const jobId = randomUUID();
  const tempPhotoUrl = input.file
    ? await storeTemporaryAvatarPhoto({
        userId: input.profile.userId,
        jobId,
        file: input.file,
      })
    : undefined;
  const jobData: AvatarGenerationJobData = {
    jobId,
    userId: input.profile.userId,
    target: { kind: "profile", id: input.profile.id },
    source: input.source,
    adjustment: input.adjustment,
    attemptKey: input.attemptKey,
    shouldCharge,
    tempPhotoUrl,
  };

  try {
    await db.profiles.markAvatarGeneration(input.profile.id, {
      avatarGenerationStatus: "queued",
      avatarGenerationError: undefined,
      avatarGenerationJobId: jobId,
      avatarGenerationAttemptKey: input.attemptKey,
      avatarGenerationUpdatedAt: new Date().toISOString(),
    });
    await inngest.send({
      name: INNGEST_EVENTS.avatarGenerationRequested,
      data: jobData,
    });
  } catch (err) {
    await db.profiles
      .markAvatarGenerationIfCurrent(input.profile.id, input.profile.userId, jobId, {
        avatarGenerationStatus: "failed",
        avatarGenerationError:
          "Could not start background drawing. Please try again.",
        avatarGenerationJobId: undefined,
        avatarGenerationAttemptKey: input.attemptKey,
        avatarGenerationUpdatedAt: new Date().toISOString(),
      })
      .catch(() => undefined);
    if (tempPhotoUrl) await deleteBookAssetUrls([tempPhotoUrl]).catch(() => 0);
    throw err;
  }

  return { jobId, status: "queued", attemptKey: input.attemptKey, existing: false };
}

async function enqueueStoryPersonAvatar(input: {
  person: StoryPerson;
  source: AvatarSource;
  adjustment: string;
  attemptKey: string;
  file?: File;
}): Promise<AvatarGenerationEnqueueResult> {
  if (isActiveAvatarStatus(input.person.avatarGenerationStatus)) {
    return {
      jobId: input.person.avatarGenerationJobId ?? input.attemptKey,
      status: input.person.avatarGenerationStatus as "queued" | "running",
      attemptKey: input.person.avatarGenerationAttemptKey ?? input.attemptKey,
      existing: true,
    };
  }

  const isDescriptionCreate =
    input.source === "description" && !input.person.avatarImageUrl;
  const existingReferenceCount = isDescriptionCreate
    ? await db.storyPeople.countAvatarReferencesByUserId(input.person.userId)
    : FREE_REFERENCE_AVATAR_LIMIT;
  const shouldCharge =
    !isDescriptionCreate || existingReferenceCount >= FREE_REFERENCE_AVATAR_LIMIT;
  if (shouldCharge) await assertReferenceRedoAffordable(input.person.userId);

  const jobId = randomUUID();
  const tempPhotoUrl = input.file
    ? await storeTemporaryAvatarPhoto({
        userId: input.person.userId,
        jobId,
        file: input.file,
      })
    : undefined;
  const jobData: AvatarGenerationJobData = {
    jobId,
    userId: input.person.userId,
    target: { kind: "story_person", id: input.person.id },
    source: input.source,
    adjustment: input.adjustment,
    attemptKey: input.attemptKey,
    shouldCharge,
    tempPhotoUrl,
  };

  try {
    await db.storyPeople.markAvatarGeneration(input.person.id, {
      avatarGenerationStatus: "queued",
      avatarGenerationError: undefined,
      avatarGenerationJobId: jobId,
      avatarGenerationAttemptKey: input.attemptKey,
      avatarGenerationUpdatedAt: new Date().toISOString(),
    });
    await inngest.send({
      name: INNGEST_EVENTS.avatarGenerationRequested,
      data: jobData,
    });
  } catch (err) {
    await db.storyPeople
      .markAvatarGenerationIfCurrent(input.person.id, input.person.userId, jobId, {
        avatarGenerationStatus: "failed",
        avatarGenerationError:
          "Could not start background drawing. Please try again.",
        avatarGenerationJobId: undefined,
        avatarGenerationAttemptKey: input.attemptKey,
        avatarGenerationUpdatedAt: new Date().toISOString(),
      })
      .catch(() => undefined);
    if (tempPhotoUrl) await deleteBookAssetUrls([tempPhotoUrl]).catch(() => 0);
    throw err;
  }

  return { jobId, status: "queued", attemptKey: input.attemptKey, existing: false };
}

export async function enqueueChildProfileAvatarGeneration(input: {
  profile: ChildProfile;
  source: AvatarSource;
  adjustment?: string;
  attemptKey?: string | null;
  file?: File;
}) {
  const adjustment = (input.adjustment ?? "").trim().slice(0, 240);
  if (input.source === "redo" && !adjustment) {
    throw new Error("Tell us what should change before redoing the reference.");
  }
  return enqueueProfileAvatar({
    profile: input.profile,
    source: input.source,
    adjustment,
    attemptKey: sanitizeAttemptKey(input.attemptKey),
    file: input.file,
  });
}

export async function enqueueStoryPersonAvatarGeneration(input: {
  person: StoryPerson;
  source: AvatarSource;
  adjustment?: string;
  attemptKey?: string | null;
  file?: File;
}) {
  const adjustment = (input.adjustment ?? "").trim().slice(0, 240);
  if (input.source === "redo" && !adjustment) {
    throw new Error("Tell us what should change before redoing the reference.");
  }
  return enqueueStoryPersonAvatar({
    person: input.person,
    source: input.source,
    adjustment,
    attemptKey: sanitizeAttemptKey(input.attemptKey),
    file: input.file,
  });
}

async function processProfileAvatarJob(input: AvatarGenerationJobData) {
  await db.profiles.markAvatarGenerationIfCurrent(
    input.target.id,
    input.userId,
    input.jobId,
    {
      avatarGenerationStatus: "running",
      avatarGenerationError: undefined,
      avatarGenerationJobId: input.jobId,
      avatarGenerationAttemptKey: input.attemptKey,
      avatarGenerationUpdatedAt: new Date().toISOString(),
    }
  );
  const profile = await db.profiles.getById(input.target.id);
  if (!profile || profile.userId !== input.userId) return "stale";
  if (profile.avatarGenerationJobId !== input.jobId) return "stale";

  const oldAvatarUrl = profile.avatarImageUrl;
  const avatar =
    input.source === "description"
      ? await createChildProfileAvatarFromDescription({
          profile,
          adjustment: input.adjustment,
        })
      : input.source === "redo"
        ? await redoChildProfileAvatar({ profile, adjustment: input.adjustment })
        : await createChildProfileAvatar({
            profile,
            file: await fileFromTemporaryUrl(input.tempPhotoUrl ?? ""),
            adjustment: input.adjustment,
          });
  const appearance = mergeConsistencyNote(profile.appearance, avatar.consistencyNote);
  const nextProfile = {
    ...profile,
    avatarImageUrl: avatar.avatarImageUrl,
    appearanceSummary: avatar.appearanceSummary,
    appearance,
  };
  const committed = await db.profiles.completeAvatarGenerationIfCurrent(
    profile.id,
    input.userId,
    input.jobId,
    {
      avatarImageUrl: avatar.avatarImageUrl,
      appearanceSummary: avatar.appearanceSummary,
      appearance,
      avatarTraitHash: getChildProfileReferenceTraitHash(nextProfile),
      avatarGeneratedAt: new Date().toISOString(),
    }
  );
  if (!committed) {
    await deleteBookAssetUrls([avatar.avatarImageUrl]).catch(() => 0);
    return "stale";
  }
  if (input.shouldCharge) {
    await chargeForDeliveredAvatar({
      userId: input.userId,
      entityType: "profile",
      entityId: profile.id,
      source: "profiles/avatar",
    });
  }
  await deleteAfterCommit(oldAvatarUrl);
  return "ready";
}

async function processStoryPersonAvatarJob(input: AvatarGenerationJobData) {
  await db.storyPeople.markAvatarGenerationIfCurrent(
    input.target.id,
    input.userId,
    input.jobId,
    {
      avatarGenerationStatus: "running",
      avatarGenerationError: undefined,
      avatarGenerationJobId: input.jobId,
      avatarGenerationAttemptKey: input.attemptKey,
      avatarGenerationUpdatedAt: new Date().toISOString(),
    }
  );
  const person = await db.storyPeople.getById(input.target.id);
  if (!person || person.userId !== input.userId) return "stale";
  if (person.avatarGenerationJobId !== input.jobId) return "stale";

  const oldAvatarUrl = person.avatarImageUrl;
  const avatar =
    input.source === "description"
      ? await createStoryPersonAvatarFromDescription({
          person,
          adjustment: input.adjustment,
        })
      : input.source === "redo"
        ? await redoStoryPersonAvatar({ person, adjustment: input.adjustment })
        : await createStoryPersonAvatar({
            person,
            file: await fileFromTemporaryUrl(input.tempPhotoUrl ?? ""),
            adjustment: input.adjustment,
          });
  const nextPerson = {
    ...person,
    avatarImageUrl: avatar.avatarImageUrl,
    appearance: avatar.appearance,
    appearanceSummary: avatar.appearanceSummary,
  };
  const committed = await db.storyPeople.completeAvatarGenerationIfCurrent(
    person.id,
    input.userId,
    input.jobId,
    {
      avatarImageUrl: avatar.avatarImageUrl,
      appearance: avatar.appearance,
      appearanceSummary: avatar.appearanceSummary,
      avatarTraitHash: getStoryPersonReferenceTraitHash(nextPerson),
      avatarGeneratedAt: new Date().toISOString(),
    }
  );
  if (!committed) {
    await deleteBookAssetUrls([avatar.avatarImageUrl]).catch(() => 0);
    return "stale";
  }
  if (input.shouldCharge) {
    await chargeForDeliveredAvatar({
      userId: input.userId,
      entityType: "story_person",
      entityId: person.id,
      source: "story-people/avatar",
    });
  }
  await deleteAfterCommit(oldAvatarUrl);
  return "ready";
}

async function markAvatarFailed(input: AvatarGenerationJobData, message: string) {
  const updates = {
    avatarGenerationStatus: "failed" as const,
    avatarGenerationError: message,
    avatarGenerationJobId: undefined,
    avatarGenerationAttemptKey: input.attemptKey,
    avatarGenerationUpdatedAt: new Date().toISOString(),
  };
  if (input.target.kind === "profile") {
    await db.profiles
      .markAvatarGenerationIfCurrent(input.target.id, input.userId, input.jobId, updates)
      .catch(() => undefined);
    return;
  }
  await db.storyPeople
    .markAvatarGenerationIfCurrent(input.target.id, input.userId, input.jobId, updates)
    .catch(() => undefined);
}

export async function processAvatarGenerationJob(
  input: AvatarGenerationJobData
): Promise<{ jobId: string; status: "ready" | "failed" | "stale" }> {
  try {
    const status =
      input.target.kind === "profile"
        ? await processProfileAvatarJob(input)
        : await processStoryPersonAvatarJob(input);
    return { jobId: input.jobId, status };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Generation failed";
    await markAvatarFailed(input, message);
    await logEvent({
      error: err,
      fallbackCode: "system.unknown",
      userId: input.userId,
      entityType: input.target.kind === "profile" ? "profile" : "story_person",
      entityId: input.target.id,
      source:
        input.target.kind === "profile"
          ? "profiles/avatar"
          : "story-people/avatar",
      context: { jobId: input.jobId, source: input.source },
    });
    return { jobId: input.jobId, status: "failed" };
  } finally {
    if (input.tempPhotoUrl) {
      await deleteBookAssetUrls([input.tempPhotoUrl]).catch(() => 0);
    }
  }
}
