"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import Button from "@/components/ui/Button";
import Icon from "@/components/ui/Icon";
import {
  getBookProjectDisplayStageLabel,
  getBookProjectProgress,
} from "@/lib/print-books/status";
import { hasResolvedImageFailure } from "@/lib/print-books/readiness";
import type { BookProject } from "@/types/printBook";

type SpreadPreview = {
  id: string;
  sequence: number;
  title?: string;
  thumbnailUrl?: string;
  webImageUrl?: string;
  leftPageImageUrl?: string;
  rightPageImageUrl?: string;
  leftPageImageError?: string;
  rightPageImageError?: string;
  leftPageQa?: BookProject["spreads"][number]["leftPageQa"];
  rightPageQa?: BookProject["spreads"][number]["rightPageQa"];
};

type ExpandedImage = {
  spreadId: string;
  sequence: number;
  title?: string;
  side: "left" | "right";
  url?: string;
  displayLabel?: string;
  index?: number;
};

type ArtworkPreview = {
  preview: SpreadPreview;
  side: "left" | "right";
  url?: string;
  error?: string;
};

type BookStatusPayload = Pick<
  BookProject,
  | "id"
  | "status"
  | "currentStageLabel"
  | "completedSpreads"
  | "totalSpreads"
  | "updatedAt"
  | "readyAt"
  | "errorCode"
  | "errorMessage"
  | "assets"
> & {
  spreadPreviews?: SpreadPreview[];
  referencesAreStale?: boolean;
  referenceImageCount?: number;
};

function getFailedImageTargets(spreads: SpreadPreview[]): ExpandedImage[] {
  return spreads
    .filter(
      (preview) =>
        Boolean(preview.leftPageImageError) || !preview.leftPageImageUrl
    )
    .map((preview) => ({
      spreadId: preview.id,
      sequence: preview.sequence,
      title: preview.title,
      side: "left",
      url: getPreviewDisplayUrl(preview),
    }));
}

function isPlaceholderImageUrl(url?: string): boolean {
  if (!url) return false;
  const lower = url.toLowerCase();
  return lower.startsWith("data:image/svg") || lower.endsWith(".svg");
}

function getPreviewDisplayUrl(preview?: SpreadPreview) {
  return (
    preview?.webImageUrl ??
    preview?.thumbnailUrl ??
    preview?.leftPageImageUrl ??
    preview?.rightPageImageUrl
  );
}

function getRepairImageTargets(spreads: SpreadPreview[]): ExpandedImage[] {
  return spreads
    .filter(
      (preview) =>
        Boolean(preview.leftPageImageError) ||
        !preview.leftPageImageUrl ||
        isPlaceholderImageUrl(preview.leftPageImageUrl)
    )
    .map((preview) => ({
      spreadId: preview.id,
      sequence: preview.sequence,
      title: preview.title,
      side: "left",
      url: getPreviewDisplayUrl(preview),
    }));
}

function isTerminal(status: BookProject["status"]): boolean {
  return status === "ready" || status === "failed";
}

function getSpreadPreviews(project: BookProject): SpreadPreview[] {
  const seen = new Set<string>();
  return project.spreads
    .filter((s) => {
      if (seen.has(s.id)) return false;
      seen.add(s.id);
      return (
        s.layoutType === "text_art" ||
        s.layoutType === "hero" ||
        s.layoutType === "quiet"
      );
    })
    .map((s) => ({
      id: s.id,
      sequence: s.sequence,
      title: s.title,
      thumbnailUrl: s.thumbnailUrl ?? s.leftPageWebImageUrl ?? s.imageUrl,
      webImageUrl: s.leftPageWebImageUrl ?? s.thumbnailUrl,
      leftPageImageUrl: s.leftPageImageUrl ?? s.imageUrl,
      rightPageImageUrl: undefined,
      leftPageImageError: s.leftPageImageError,
      rightPageImageError: undefined,
      leftPageQa: s.leftPageQa,
      rightPageQa: s.rightPageQa,
    }))
    .sort((a, b) => a.sequence - b.sequence);
}

export default function BookStatusPanel({
  initialProject,
  initialIsReady = false,
  initialReferencesAreStale = false,
  initialReferenceImageCount = 0,
  isAdmin = false,
}: {
  initialProject: BookProject;
  initialIsReady?: boolean;
  initialReferencesAreStale?: boolean;
  initialReferenceImageCount?: number;
  isAdmin?: boolean;
}) {
  const t = useTranslations("books");
  const router = useRouter();
  const [project, setProject] = useState(initialProject);
  const [spreadPreviews, setSpreadPreviews] = useState<SpreadPreview[]>(() =>
    getSpreadPreviews(initialProject)
  );
  const [retrying, setRetrying] = useState(false);
  const [repairingArt, setRepairingArt] = useState(false);
  const [regeneratingExports, setRegeneratingExports] = useState(false);
  const [rebuildingReferences, setRebuildingReferences] = useState(false);
  const [referencesAreStale, setReferencesAreStale] = useState(
    initialReferencesAreStale
  );
  const [referenceImageCount, setReferenceImageCount] = useState(
    initialReferenceImageCount
  );
  const [regeneratingImage, setRegeneratingImage] = useState<string | null>(
    null
  );
  const [redoTarget, setRedoTarget] = useState<ExpandedImage | null>(null);
  const [redoCorrectionNote, setRedoCorrectionNote] = useState("");
  const [imageError, setImageError] = useState("");
  const [expandedImage, setExpandedImage] = useState<ExpandedImage | null>(
    null
  );
  const [readyToolsOpen, setReadyToolsOpen] = useState(false);
  const [pollUntil, setPollUntil] = useState(0);
  const [startingBuild, setStartingBuild] = useState(false);
  const [readerIndex, setReaderIndex] = useState(0);
  const prevCompletedCount = useRef(0);
  const buildStartedRef = useRef(false);
  const latestProjectUpdatedAtRef = useRef(
    Date.parse(initialProject.updatedAt)
  );
  const activeJobStatus = project.assets.activeJobStatus;
  const activeJobMode = project.assets.activeJobMode;
  const isExportRefresh =
    activeJobMode === "exports" || activeJobMode === "finalize";
  const artworkPreviews: ArtworkPreview[] = useMemo(
    () =>
      spreadPreviews.map((preview) => ({
        preview,
        side: "left",
        url: getPreviewDisplayUrl(preview),
        error: preview.leftPageImageError,
      })),
    [spreadPreviews]
  );
  const completedArtworkCount = artworkPreviews.filter(
    (preview) => preview.url
  ).length;

  // Text from initial project - doesn't change during build
  const spreadTextMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of initialProject.spreads) {
      const text = s.leftPageText || s.rightPageText;
      if (text) map.set(s.id, text);
    }
    return map;
  }, [initialProject]);

  const getExpandedImageFromArtwork = useCallback(
    (index: number): ExpandedImage | null => {
      const artwork = artworkPreviews[index];
      if (!artwork?.url) return null;
      return {
        spreadId: artwork.preview.id,
        sequence: artwork.preview.sequence,
        title: artwork.preview.title,
        side: artwork.side,
        url: artwork.url,
        displayLabel: `Illustration ${index + 1}`,
        index,
      };
    },
    [artworkPreviews]
  );

  function openArtworkPreview(index: number) {
    setExpandedImage(getExpandedImageFromArtwork(index));
  }

  const moveExpandedImage = useCallback(
    (direction: -1 | 1) => {
      if (!expandedImage) return;
      let nextIndex =
        expandedImage.index ??
        artworkPreviews.findIndex(
          (artwork) =>
            artwork.preview.id === expandedImage.spreadId &&
            artwork.side === expandedImage.side
        );
      if (nextIndex < 0) nextIndex = 0;
      for (let i = 0; i < artworkPreviews.length; i += 1) {
        nextIndex =
          (nextIndex + direction + artworkPreviews.length) %
          artworkPreviews.length;
        const nextImage = getExpandedImageFromArtwork(nextIndex);
        if (nextImage) {
          setExpandedImage(nextImage);
          return;
        }
      }
    },
    [artworkPreviews, expandedImage, getExpandedImageFromArtwork]
  );

  useEffect(() => {
    if (project.status !== "queued" || buildStartedRef.current) return;

    buildStartedRef.current = true;
    setStartingBuild(true);

    void fetch(`/api/books/${project.id}/build`, {
      method: "POST",
      credentials: "same-origin",
      keepalive: true,
    })
      .then(async (res) => {
        if (!res.ok) return;
        const next = (await res.json()) as BookProject;
        setProject(next);
      })
      .catch(() => {
        buildStartedRef.current = false;
      })
      .finally(() => {
        setStartingBuild(false);
      });
  }, [project.id, project.status]);

  useEffect(() => {
    const shouldPoll =
      !isTerminal(project.status) ||
      Boolean(activeJobStatus) ||
      pollUntil > Date.now();
    if (!shouldPoll) return;

    const interval = window.setInterval(
      async () => {
        const res = await fetch(`/api/books/${project.id}/status`, {
          cache: "no-store",
          credentials: "same-origin",
        });
        if (!res.ok) return;
        const next = (await res.json()) as BookStatusPayload;
        const nextUpdatedAt = Date.parse(next.updatedAt);
        if (
          Number.isFinite(nextUpdatedAt) &&
          Number.isFinite(latestProjectUpdatedAtRef.current) &&
          nextUpdatedAt < latestProjectUpdatedAtRef.current
        ) {
          return;
        }
        if (Number.isFinite(nextUpdatedAt)) {
          latestProjectUpdatedAtRef.current = nextUpdatedAt;
        }
        setProject((current) => ({ ...current, ...next }));
        setReferencesAreStale(Boolean(next.referencesAreStale));
        setReferenceImageCount(next.referenceImageCount ?? 0);
        if (next.spreadPreviews) {
          setSpreadPreviews(
            [...next.spreadPreviews].sort((a, b) => a.sequence - b.sequence)
          );
        }

        if (
          (next.status === "ready" || next.status === "failed") &&
          !next.assets.activeJobStatus
        ) {
          if (!initialIsReady) {
            // Hard reload so the server-rendered BookReader section mounts
            // correctly - soft refresh can leave isReady stale, especially
            // when the orientation changes during the transition.
            window.location.reload();
            return;
          }
          router.refresh();
          if (Date.now() >= pollUntil) {
            window.clearInterval(interval);
          }
        }
      },
      pollUntil > Date.now() ? 2000 : 4000
    );

    return () => window.clearInterval(interval);
  }, [activeJobStatus, pollUntil, project.id, project.status, router]);

  useEffect(() => {
    if (!expandedImage) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        moveExpandedImage(-1);
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        moveExpandedImage(1);
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setExpandedImage(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [expandedImage, moveExpandedImage]);

  async function handleRetry() {
    const failedImages = getFailedImageTargets(spreadPreviews);
    if (
      project.errorCode === "illustrating:image_failed" &&
      failedImages.length > 0
    ) {
      setRetrying(true);
      for (const image of failedImages) {
        await handleRegenerateImage(image);
      }
      setRetrying(false);
      return;
    }

    setRetrying(true);
    const res = await fetch(`/api/books/${project.id}/build`, {
      method: "POST",
      credentials: "same-origin",
    });
    if (res.ok) {
      const next = (await res.json()) as BookProject;
      setProject(next);
    }
    setRetrying(false);
  }

  async function handleRegenerateExports() {
    setRegeneratingExports(true);
    const res = await fetch(`/api/books/${project.id}/build`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "exports" }),
    });
    if (res.ok) {
      const next = (await res.json()) as BookProject;
      setProject(next);
      router.refresh();
    }
    setRegeneratingExports(false);
  }

  async function handleRegenerateImage(
    image: ExpandedImage,
    correctionNote = ""
  ) {
    setRegeneratingImage(`${image.spreadId}:${image.side}`);
    setImageError("");
    const res = await fetch(`/api/books/${project.id}/images/regenerate`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        spreadId: image.spreadId,
        side: image.side,
        correctionNote,
      }),
    });
    const next = await res.json();

    if (res.ok) {
      const nextProject = next as BookProject;
      setProject(nextProject);
      setPollUntil(Date.now() + 20_000);
      const previews = getSpreadPreviews(nextProject);
      setSpreadPreviews(previews);
      const nextPreview = previews.find(
        (preview) => preview.id === image.spreadId
      );
      const nextUrl =
        image.side === "left"
          ? getPreviewDisplayUrl(nextPreview)
          : nextPreview?.rightPageImageUrl;
      if (nextUrl) setExpandedImage({ ...image, url: nextUrl });
      window.dispatchEvent(new CustomEvent("storycot:credits-updated"));
      router.refresh();
    } else {
      setImageError(
        res.status === 401
          ? "Your session expired. Refresh the page, sign in if prompted, then retry this image."
          : (next?.error ??
              "That image could not be regenerated. Please try again.")
      );
    }

    setRegeneratingImage(null);
  }

  function openRedoPrompt(image: ExpandedImage) {
    setRedoTarget(image);
    setRedoCorrectionNote("");
    setImageError("");
  }

  async function submitRedoPrompt() {
    if (!redoTarget) return;
    const correctionNote = redoCorrectionNote.trim();
    const targetPreview = spreadPreviews.find(
      (preview) => preview.id === redoTarget.spreadId
    );
    const targetUrl =
      redoTarget.side === "left"
        ? targetPreview?.leftPageImageUrl
        : targetPreview?.rightPageImageUrl;
    const targetError =
      redoTarget.side === "left"
        ? targetPreview?.leftPageImageError
        : targetPreview?.rightPageImageError;
    const isPaidRedo =
      Boolean(targetUrl) && !targetError && !isPlaceholderImageUrl(targetUrl);

    if (isPaidRedo && !correctionNote) {
      setImageError("Tell us what to fix before spending a redo credit.");
      return;
    }

    const target = redoTarget;
    setRedoTarget(null);
    setRedoCorrectionNote("");
    await handleRegenerateImage(target, correctionNote);
  }

  async function handleRepairArt() {
    const repairTargets = getRepairImageTargets(spreadPreviews);
    if (repairTargets.length > 0) {
      setRepairingArt(true);
      for (const image of repairTargets) {
        await handleRegenerateImage(image);
      }
      setRepairingArt(false);
      return;
    }

    setRepairingArt(true);
    const res = await fetch(`/api/books/${project.id}/build`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "art" }),
    });
    if (res.ok) {
      const next = (await res.json()) as BookProject;
      setProject(next);
      // Refresh server render so page.tsx picks up the new non-ready status,
      // which hides BookReader and avoids the duplicate-reader state during rebuild.
      router.refresh();
    }
    setRepairingArt(false);
  }

  async function handleRebuildWithLatestReferences() {
    setRebuildingReferences(true);
    const res = await fetch(`/api/books/${project.id}/build`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "full" }),
    });
    if (res.ok) {
      const next = (await res.json()) as BookProject;
      setProject(next);
      setReferencesAreStale(false);
      setPollUntil(Date.now() + 20_000);
      router.refresh();
    }
    setRebuildingReferences(false);
  }

  const failedImageTargets = getFailedImageTargets(spreadPreviews);
  const hasLocallyResolvedImageFailure =
    hasResolvedImageFailure(project) ||
    (project.status === "failed" &&
      project.errorCode === "illustrating:image_failed" &&
      failedImageTargets.length === 0 &&
      artworkPreviews.every((preview) => preview.url));
  const displayStatus = hasLocallyResolvedImageFailure
    ? "ready"
    : project.status;
  const displayProject = hasLocallyResolvedImageFailure
    ? ({
        ...project,
        status: "ready",
        currentStageLabel: "Your illustrated book is ready to order.",
        errorCode: undefined,
        errorMessage: undefined,
      } as BookProject)
    : project;
  const fullRebuildCreditCopy = isAdmin
    ? "Admin rebuild: 0 credits."
    : project.billing?.credits
      ? `This starts a full illustrated rebuild and uses ${project.billing.credits} credits.`
      : "This starts a full illustrated rebuild and uses the normal illustrated-book credit cost.";
  const progress = getBookProjectProgress(displayProject);
  const stageLabel = getBookProjectDisplayStageLabel(displayProject);
  const isActiveBuild =
    (displayStatus !== "ready" && displayStatus !== "failed") ||
    Boolean(activeJobStatus);
  const isPreparingFinalFiles =
    displayStatus === "composing" &&
    artworkPreviews.length > 0 &&
    completedArtworkCount >= artworkPreviews.length;

  // Auto-advance reader to latest completed illustration during active builds
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!isActiveBuild) return;
    if (completedArtworkCount <= prevCompletedCount.current) return;
    prevCompletedCount.current = completedArtworkCount;
    const lastIdx = artworkPreviews.reduce(
      (last, a, i) => (a.url ? i : last),
      0
    );
    setReaderIndex(lastIdx);
  }, [completedArtworkCount, isActiveBuild, artworkPreviews]);

  // Only warn about mixed art when there are actual placeholder images that
  // need repair. A successful individual redo also sets artMode="mixed" but
  // doesn't leave any placeholders, so we must not false-positive in that case.
  const hasMixedArt =
    displayStatus === "ready" &&
    project.assets.artMode === "mixed" &&
    getRepairImageTargets(spreadPreviews).length > 0;
  const hasImageGenerationFailure =
    project.errorCode === "illustrating:image_failed" &&
    failedImageTargets.length > 0;
  const showFailedBookPanel =
    displayStatus === "failed" &&
    (project.errorCode !== "illustrating:image_failed" ||
      failedImageTargets.length > 0);
  const lastUpdated = project.updatedAt
    ? new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(new Date(project.updatedAt))
    : null;

  if (displayStatus === "ready" && !activeJobStatus) {
    return (
      <>
        <section className="rounded-3xl border border-night-100 bg-white p-5 shadow-sm sm:flex sm:items-center sm:justify-between sm:gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-star-600">
              Book tools
            </p>
            <p className="mt-1 text-sm leading-6 text-night-500">
              Your preview is ready. Open these only if you want to redo artwork
              or refresh export files.
            </p>
          </div>
          <Button
            variant="secondary"
            className="mt-4 sm:mt-0"
            onClick={() => setReadyToolsOpen(true)}
          >
            Edit artwork / exports
          </Button>
        </section>

        {readyToolsOpen ? (
          <div
            className="fixed inset-0 z-50 flex items-end bg-night-900/55 px-4 pb-4 pt-12 backdrop-blur-sm sm:items-center sm:justify-center sm:p-6"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                setReadyToolsOpen(false);
              }
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="ready-tools-title"
              className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl sm:p-6"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-star-600">
                    Book tools
                  </p>
                  <h2
                    id="ready-tools-title"
                    className="mt-1 font-display text-2xl font-bold text-night-800"
                  >
                    Edit artwork and exports
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-night-500">
                    Redo individual illustrations only when something needs
                    fixing. Refresh exports after artwork changes.
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Close book tools"
                  onClick={() => setReadyToolsOpen(false)}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-night-100 bg-white text-2xl font-bold leading-none text-night-800 shadow-sm transition hover:bg-night-50"
                >
                  ×
                </button>
              </div>

              {artworkPreviews.length > 0 ? (
                <div className="mt-6">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-bold uppercase tracking-wide text-night-400">
                      {completedArtworkCount} of {artworkPreviews.length}{" "}
                      illustrations
                    </p>
                    <p className="text-xs font-bold text-night-400">
                      Retry free · Redo finished: 1 credit
                    </p>
                  </div>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                    {artworkPreviews.map(
                      ({ preview, side, url, error }, index) => {
                        const key = `${preview.id}:${side}`;
                        const isRegenerating = regeneratingImage === key;
                        const canRegenerate =
                          !activeJobStatus &&
                          preview.title !== "Cover" &&
                          preview.title !== "Title" &&
                          preview.title !== "Back Cover";
                        const isFreeRetry = Boolean(error) || !url;
                        const displayLabel = `Illustration ${index + 1}`;
                        return (
                          <div
                            key={key}
                            className="overflow-hidden rounded-xl border border-night-100 bg-night-50"
                          >
                            <button
                              type="button"
                              onClick={() =>
                                url ? openArtworkPreview(index) : undefined
                              }
                              className="block aspect-square w-full overflow-hidden bg-night-100"
                              aria-label={`Open ${displayLabel}`}
                            >
                              {url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={url}
                                  alt={displayLabel}
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center bg-night-100 text-center text-xs font-bold text-night-400">
                                  {error ? "!" : "..."}
                                </div>
                              )}
                            </button>
                            {canRegenerate ? (
                              <div className="px-1 py-1.5 text-center">
                                <button
                                  type="button"
                                  onClick={() =>
                                    openRedoPrompt({
                                      spreadId: preview.id,
                                      sequence: preview.sequence,
                                      title: preview.title,
                                      side,
                                      url,
                                      displayLabel,
                                      index,
                                    })
                                  }
                                  disabled={
                                    Boolean(regeneratingImage) ||
                                    Boolean(activeJobStatus)
                                  }
                                  className="w-full rounded-full bg-white px-1 py-0.5 text-xs font-bold text-night-600 shadow-sm disabled:opacity-50"
                                >
                                  {isRegenerating
                                    ? "..."
                                    : isFreeRetry
                                      ? "Retry"
                                      : "Redo"}
                                </button>
                              </div>
                            ) : null}
                          </div>
                        );
                      }
                    )}
                  </div>
                </div>
              ) : null}

              {imageError ? (
                <p
                  role="alert"
                  className="mt-4 rounded-xl bg-blush-100 px-4 py-3 text-sm font-bold text-blush-700"
                >
                  {imageError}
                </p>
              ) : null}

              {hasMixedArt ? (
                <div className="mt-6 rounded-2xl border border-moon-200 bg-moon-100 p-4">
                  <p className="font-bold text-night-700">
                    {t("mixedArtTitle")}
                  </p>
                  <p className="mt-1 text-sm text-night-600">
                    {t("mixedArtSub")}
                  </p>
                  <Button
                    size="compact"
                    onClick={handleRepairArt}
                    disabled={repairingArt || Boolean(activeJobStatus)}
                    className="mt-4"
                  >
                    {repairingArt
                      ? t("repairingArtButton")
                      : t("repairArtButton")}
                  </Button>
                </div>
              ) : null}

              <div className="mt-6 rounded-2xl border border-night-100 bg-night-50 p-4 sm:flex sm:items-center sm:justify-between sm:gap-4">
                <div>
                  <p className="text-sm font-bold text-night-700">
                    Export files
                  </p>
                  <p className="mt-1 text-sm text-night-500">
                    Refresh exports after artwork or layout changes.
                  </p>
                </div>
                <div className="mt-4 grid gap-2 sm:mt-0 sm:grid-cols-2">
                  <Button
                    variant="secondary"
                    onClick={handleRepairArt}
                    disabled={repairingArt}
                  >
                    {repairingArt ? "Redoing art..." : "Redo art"}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={handleRegenerateExports}
                    disabled={regeneratingExports}
                  >
                    {regeneratingExports
                      ? "Refreshing PDFs..."
                      : "Refresh PDFs"}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {redoTarget ? (
          <div
            className="fixed inset-0 z-[60] flex items-end bg-night-900/50 px-4 pb-4 sm:items-center sm:justify-center sm:p-6"
            role="dialog"
            aria-modal="true"
            aria-labelledby="redo-dialog-title"
          >
            <div className="w-full max-w-lg rounded-3xl bg-white p-5 shadow-xl">
              <h3
                id="redo-dialog-title"
                className="text-xl font-black text-night-900"
              >
                What should change?
              </h3>
              <p className="mt-2 text-sm font-medium text-night-500">
                We will keep the same story moment, character details, and
                style, then add your correction to the redo prompt.
              </p>
              <textarea
                value={redoCorrectionNote}
                onChange={(event) =>
                  setRedoCorrectionNote(event.target.value.slice(0, 500))
                }
                rows={4}
                aria-label="Correction note"
                className="mt-4 w-full rounded-2xl border border-night-200 px-4 py-3 text-base font-medium text-night-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lilac-500 focus:border-lilac-500"
                placeholder="e.g. Make the cape blue, show both boots, remove the extra toy, make Bailey face the bird..."
              />
              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setRedoTarget(null);
                    setRedoCorrectionNote("");
                  }}
                  className="rounded-full border border-night-200 bg-white px-5 py-3 text-sm font-bold text-night-700"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={submitRedoPrompt}
                  disabled={Boolean(regeneratingImage)}
                  className="rounded-full bg-night-800 px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
                >
                  Redo image
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {expandedImage ? (
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-night-900/75 p-2 sm:p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="expanded-image-dialog-title"
            onClick={() => setExpandedImage(null)}
          >
            <div
              className="relative flex max-h-[92dvh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl sm:rounded-3xl"
              onClick={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                aria-label="Close artwork preview"
                onClick={() => setExpandedImage(null)}
                className="absolute right-2 top-2 z-20 flex h-11 w-11 items-center justify-center rounded-full border border-night-100 bg-white/95 text-2xl font-bold leading-none text-night-800 shadow-lg ring-1 ring-white/70 transition hover:bg-night-50"
              >
                ×
              </button>
              {expandedImage.url ? (
                <div className="relative min-h-0 bg-night-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={expandedImage.url}
                    alt={expandedImage.displayLabel ?? "Selected illustration"}
                    className="max-h-[calc(92dvh-96px)] w-full object-contain"
                  />
                </div>
              ) : null}
              <div className="shrink-0 flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5 sm:py-4">
                <p
                  id="expanded-image-dialog-title"
                  className="text-sm font-bold text-night-700"
                >
                  {expandedImage.displayLabel ?? "Selected illustration"}
                </p>
                <Button
                  variant="secondary"
                  size="compact"
                  onClick={() => setExpandedImage(null)}
                >
                  Close
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </>
    );
  }

  return (
    <section className="rounded-3xl border border-night-100 bg-white p-8 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-wide text-star-600">
            {t("statusLabel")}
          </p>
          <h2
            className="mt-2 font-display text-3xl font-bold text-night-800"
            aria-live="polite"
            aria-atomic="true"
          >
            {stageLabel}
          </h2>
          <p className="mt-2 text-night-500">
            {isExportRefresh
              ? "We’re refreshing the PDF, e-reader file, and print-order files from the existing artwork."
              : displayStatus === "ready"
                ? t("illustratedPdfReadySub")
                : displayStatus === "failed"
                  ? t("failedSafeSub")
                  : t("illustratedPdfBuildingSub")}
          </p>
          {lastUpdated ? (
            <p className="mt-2 text-xs font-medium uppercase tracking-wide text-night-400">
              {t("updatedLabel", { value: lastUpdated })}
            </p>
          ) : null}
        </div>
        <div className="rounded-2xl bg-night-50 px-4 py-3 text-right">
          <p className="text-xs font-bold uppercase tracking-wide text-night-400">
            {t("progressLabel")}
          </p>
          <p className="mt-1 font-display text-2xl font-bold text-night-700">
            {progress}%
          </p>
        </div>
      </div>

      <div
        className="mt-6 h-3 overflow-hidden rounded-full bg-night-100"
        role="progressbar"
        aria-valuenow={Math.min(progress, 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={t("progressLabel")}
      >
        <div
          className="h-full rounded-full bg-star-400 transition-all"
          style={{ width: `${Math.min(progress, 100)}%` }}
        />
      </div>

      {artworkPreviews.length > 0 && displayStatus === "ready" ? (
        /* Compact thumbnail grid - shown when ready (BookReader handles reading above) */
        <div className="mt-6">
          <div className="mb-3 flex items-center justify-between gap-4">
            <p className="text-xs font-bold uppercase tracking-wide text-night-400">
              {completedArtworkCount} of {artworkPreviews.length} illustrations
            </p>
            <p className="text-xs font-bold text-night-400">
              Retry free · Redo finished: 1 credit
            </p>
          </div>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
            {artworkPreviews.map(({ preview, side, url, error }, index) => {
              const key = `${preview.id}:${side}`;
              const isRegenerating = regeneratingImage === key;
              const canRegenerate =
                !activeJobStatus &&
                preview.title !== "Cover" &&
                preview.title !== "Title" &&
                preview.title !== "Back Cover";
              const isFreeRetry = Boolean(error) || !url;
              const displayLabel = `Illustration ${index + 1}`;
              return (
                <div
                  key={key}
                  className="overflow-hidden rounded-xl border border-night-100 bg-night-50"
                >
                  <button
                    type="button"
                    onClick={() =>
                      url ? openArtworkPreview(index) : undefined
                    }
                    className="block aspect-square w-full overflow-hidden bg-night-100"
                    aria-label={`Open ${displayLabel}`}
                  >
                    {url ? (
                      <img
                        src={url}
                        alt={displayLabel}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-night-100 text-center text-xs font-bold text-night-400">
                        {error ? "!" : "…"}
                      </div>
                    )}
                  </button>
                  {canRegenerate ? (
                    <div className="px-1 py-1.5 text-center">
                      <button
                        type="button"
                        onClick={() =>
                          openRedoPrompt({
                            spreadId: preview.id,
                            sequence: preview.sequence,
                            title: preview.title,
                            side,
                            url,
                            displayLabel,
                            index,
                          })
                        }
                        disabled={
                          Boolean(regeneratingImage) || Boolean(activeJobStatus)
                        }
                        className="w-full rounded-full bg-white px-1 py-0.5 text-xs font-bold text-night-600 shadow-sm disabled:opacity-50"
                      >
                        {isRegenerating ? "…" : isFreeRetry ? "Retry" : "Redo"}
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
          {imageError ? (
            <p
              role="alert"
              className="mt-3 rounded-xl bg-blush-100 px-4 py-3 text-sm font-bold text-blush-700"
            >
              {imageError}
            </p>
          ) : null}
          {redoTarget ? (
            <div
              className="fixed inset-0 z-50 flex items-end bg-night-900/50 px-4 pb-4 sm:items-center sm:justify-center sm:p-6"
              role="dialog"
              aria-modal="true"
              aria-labelledby="redo-dialog-title"
            >
              <div className="w-full max-w-lg rounded-3xl bg-white p-5 shadow-xl">
                <h3
                  id="redo-dialog-title"
                  className="text-xl font-black text-night-900"
                >
                  What should change?
                </h3>
                <p className="mt-2 text-sm font-medium text-night-500">
                  We will keep the same story moment, character details, and
                  style, then add your correction to the redo prompt.
                </p>
                <textarea
                  value={redoCorrectionNote}
                  onChange={(event) =>
                    setRedoCorrectionNote(event.target.value.slice(0, 500))
                  }
                  rows={4}
                  aria-label="Correction note"
                  className="mt-4 w-full rounded-2xl border border-night-200 px-4 py-3 text-base font-medium text-night-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lilac-500 focus:border-lilac-500"
                  placeholder="e.g. Make the cape blue, show both boots, remove the extra toy, make Bailey face the bird..."
                />
                <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setRedoTarget(null);
                      setRedoCorrectionNote("");
                    }}
                    className="rounded-full border border-night-200 bg-white px-5 py-3 text-sm font-bold text-night-700"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={submitRedoPrompt}
                    disabled={Boolean(regeneratingImage)}
                    className="rounded-full bg-night-800 px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
                  >
                    Redo image
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {artworkPreviews.length > 0 && displayStatus !== "ready" ? (
        <div className="mt-6">
          {/* Progress header */}
          <div className="mb-3 flex items-center justify-between gap-4">
            <p className="text-xs font-bold uppercase tracking-wide text-night-400">
              {isPreparingFinalFiles
                ? "Preparing final book files..."
                : `${completedArtworkCount} of ${artworkPreviews.length} illustrations${isActiveBuild ? " loading..." : " complete"}`}
            </p>
            {!isActiveBuild ? (
              <p className="text-xs font-bold text-night-400">
                Retry free · Redo finished: 1 credit
              </p>
            ) : null}
          </div>

          {/* Streaming reader card */}
          {(() => {
            const artwork = artworkPreviews[readerIndex];
            if (!artwork) return null;
            const imgKey = `${artwork.preview.id}:${artwork.side}`;
            const isRegeneratingThis = regeneratingImage === imgKey;
            const isFreeRetry = !artwork.url || Boolean(artwork.error);
            const canRegenerate =
              !isActiveBuild &&
              !activeJobStatus &&
              artwork.preview.title !== "Cover" &&
              artwork.preview.title !== "Title" &&
              artwork.preview.title !== "Back Cover";
            const pageText = spreadTextMap.get(artwork.preview.id) ?? "";

            return (
              <div className="overflow-hidden rounded-2xl border border-night-100 bg-white shadow-sm">
                {/* Image */}
                <div
                  className="relative w-full bg-night-50"
                  style={{ paddingBottom: "100%" }}
                >
                  {artwork.url ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={artwork.url}
                        alt={`Illustration ${readerIndex + 1}`}
                        className="absolute inset-0 h-full w-full cursor-pointer object-cover"
                        draggable={false}
                        onContextMenu={(e) => e.preventDefault()}
                        onClick={() => openArtworkPreview(readerIndex)}
                      />
                      <div className="pointer-events-none absolute right-3 top-3 rounded-full bg-black/30 px-2.5 py-1 text-xs font-bold text-white backdrop-blur-sm">
                        {readerIndex + 1} / {artworkPreviews.length}
                      </div>
                      {artwork.preview.title ? (
                        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-5 pb-4 pt-10">
                          <p className="font-display text-base font-bold text-white">
                            {artwork.preview.title}
                          </p>
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="text-center px-6">
                        {isActiveBuild ? (
                          <>
                            <div
                              className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-night-200 border-t-star-500"
                              aria-hidden="true"
                            />
                            <p className="mt-3 text-sm font-medium text-night-400">
                              Illustration {readerIndex + 1} in progress…
                            </p>
                          </>
                        ) : (
                          <>
                            <Icon
                              name="image"
                              className="mx-auto h-8 w-8 text-night-300"
                            />
                            <p className="mt-2 text-sm font-medium text-night-400">
                              {artwork.error ?? "Illustration pending"}
                            </p>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Story text */}
                {pageText ? (
                  <div className="border-t border-night-50 px-6 py-5">
                    <p className="font-display text-lg font-medium leading-relaxed text-night-800">
                      {pageText}
                    </p>
                  </div>
                ) : null}

                {/* Redo row */}
                {artwork.error || canRegenerate ? (
                  <div className="flex items-center justify-between gap-3 border-t border-night-50 px-5 py-3">
                    {artwork.error ? (
                      <p className="flex-1 text-xs font-medium text-blush-700">
                        {artwork.error}
                      </p>
                    ) : (
                      <span />
                    )}
                    {canRegenerate ? (
                      <button
                        type="button"
                        onClick={() =>
                          openRedoPrompt({
                            spreadId: artwork.preview.id,
                            sequence: artwork.preview.sequence,
                            title: artwork.preview.title,
                            side: artwork.side,
                            url: artwork.url,
                            displayLabel: `Illustration ${readerIndex + 1}`,
                            index: readerIndex,
                          })
                        }
                        disabled={
                          Boolean(regeneratingImage) || Boolean(activeJobStatus)
                        }
                        className="shrink-0 rounded-full bg-night-100 px-3 py-1.5 text-xs font-bold text-night-700 hover:bg-night-200 disabled:opacity-50"
                      >
                        {isRegeneratingThis
                          ? "Working…"
                          : isFreeRetry
                            ? "Retry free"
                            : "Redo - 1 credit"}
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })()}

          {/* Navigation */}
          <div className="mt-4 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setReaderIndex((i) => Math.max(0, i - 1))}
              disabled={readerIndex === 0}
              className="flex items-center gap-1.5 rounded-full border border-night-200 px-5 py-2.5 text-sm font-bold text-night-600 transition hover:bg-night-50 disabled:cursor-not-allowed disabled:opacity-30"
            >
              ← Prev
            </button>

            <div className="flex max-w-[40%] flex-wrap justify-center gap-1">
              {artworkPreviews.map((a, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setReaderIndex(i)}
                  aria-label={`Illustration ${i + 1}`}
                  className={`h-2 rounded-full transition-all ${
                    i === readerIndex
                      ? "w-5 bg-night-700"
                      : a.url
                        ? "w-2 bg-night-300 hover:bg-night-500"
                        : "w-2 bg-night-100"
                  }`}
                />
              ))}
            </div>

            <button
              type="button"
              onClick={() =>
                setReaderIndex((i) =>
                  Math.min(artworkPreviews.length - 1, i + 1)
                )
              }
              disabled={readerIndex === artworkPreviews.length - 1}
              className="flex items-center gap-1.5 rounded-full border border-night-200 px-5 py-2.5 text-sm font-bold text-night-600 transition hover:bg-night-50 disabled:cursor-not-allowed disabled:opacity-30"
            >
              Next →
            </button>
          </div>

          {imageError ? (
            <p
              role="alert"
              className="mt-4 rounded-xl bg-blush-100 px-4 py-3 text-sm font-bold text-blush-700"
            >
              {imageError}
            </p>
          ) : null}

          {redoTarget ? (
            <div
              className="fixed inset-0 z-50 flex items-end bg-night-900/50 px-4 pb-4 sm:items-center sm:justify-center sm:p-6"
              role="dialog"
              aria-modal="true"
              aria-labelledby="redo-dialog-title"
            >
              <div className="w-full max-w-lg rounded-3xl bg-white p-5 shadow-xl">
                <h3
                  id="redo-dialog-title"
                  className="text-xl font-black text-night-900"
                >
                  What should change?
                </h3>
                <p className="mt-2 text-sm font-medium text-night-500">
                  We will keep the same story moment, character details, and
                  style, then add your correction to the redo prompt.
                </p>
                <textarea
                  value={redoCorrectionNote}
                  onChange={(event) =>
                    setRedoCorrectionNote(event.target.value.slice(0, 500))
                  }
                  rows={4}
                  aria-label="Correction note"
                  className="mt-4 w-full rounded-2xl border border-night-200 px-4 py-3 text-base font-medium text-night-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lilac-500 focus:border-lilac-500"
                  placeholder="e.g. Make the cape blue, show both boots, remove the extra toy, make Bailey face the bird..."
                />
                <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setRedoTarget(null);
                      setRedoCorrectionNote("");
                    }}
                    className="rounded-full border border-night-200 bg-white px-5 py-3 text-sm font-bold text-night-700"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={submitRedoPrompt}
                    disabled={Boolean(regeneratingImage)}
                    className="rounded-full bg-night-800 px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
                  >
                    Redo image
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {isActiveBuild ? (
        <div className="mt-6 rounded-2xl border border-star-200 bg-star-50 p-4">
          <div className="flex items-start gap-3">
            <div
              className="mt-0.5 h-5 w-5 animate-spin rounded-full border-2 border-star-200 border-t-star-600"
              aria-hidden="true"
            />
            <div className="flex-1">
              <p className="font-bold text-star-800">
                {startingBuild && project.status === "queued"
                  ? t("startingTitle")
                  : t("activeTitle")}
              </p>
              <p className="mt-1 text-sm text-star-900">
                {isExportRefresh
                  ? "This should not regenerate illustrations or spend story/art credits."
                  : startingBuild && project.status === "queued"
                    ? t("startingSub")
                    : t("activeSub")}
              </p>
              <p className="mt-2 text-xs font-medium uppercase tracking-wide text-star-700">
                {t("safeToLeave")}
              </p>
              {!startingBuild ? (
                <button
                  type="button"
                  onClick={handleRetry}
                  disabled={retrying}
                  className="mt-3 text-xs font-bold text-star-700 underline underline-offset-2 hover:text-star-900 disabled:opacity-50"
                >
                  {retrying ? "Retrying…" : "Stuck? Retry build"}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {showFailedBookPanel ? (
        <div className="mt-6 rounded-2xl border border-blush-200 bg-blush-100 p-4">
          <p className="font-bold text-blush-700">{t("failedTitle")}</p>
          <p className="mt-1 text-sm text-blush-600">
            {project.errorMessage && !project.errorMessage.includes("<")
              ? project.errorMessage
              : t("failedFallback")}
          </p>
          <p className="mt-2 text-sm text-blush-600">
            {t("failedPaymentNote")}
          </p>
          <a
            href="mailto:hello@storycot.com"
            className="mt-2 inline-block text-sm font-bold text-blush-700 underline underline-offset-2 hover:text-blush-900"
          >
            {t("failedContactLink")}
          </a>
          <Button
            variant="danger"
            size="compact"
            onClick={handleRetry}
            disabled={retrying || Boolean(regeneratingImage)}
            className="mt-4"
          >
            {hasImageGenerationFailure
              ? retrying
                ? "Retrying failed images..."
                : "Retry failed images only"
              : retrying
                ? t("retryingButton")
                : t("retryButton")}
          </Button>
        </div>
      ) : null}

      {referencesAreStale && !activeJobStatus ? (
        <div className="mt-6 rounded-2xl border border-star-200 bg-star-50 p-4 sm:flex sm:items-center sm:justify-between sm:gap-4">
          <div>
            <p className="text-sm font-bold text-star-800">
              Newer Character References Are Available
            </p>
            <p className="mt-1 text-sm text-star-900">
              Rebuild the character setup and artwork with the latest child and
              Family & Friends references
              {referenceImageCount > 0
                ? `, including ${referenceImageCount} illustrated reference ${
                    referenceImageCount === 1 ? "image" : "images"
                  }`
                : ""}
              . {fullRebuildCreditCopy}
            </p>
          </div>
          <Button
            variant="secondary"
            onClick={handleRebuildWithLatestReferences}
            disabled={rebuildingReferences}
            className="mt-4 sm:mt-0"
          >
            {rebuildingReferences
              ? "Rebuilding..."
              : "Rebuild With Latest References"}
          </Button>
        </div>
      ) : null}

      {(displayStatus === "ready" || displayStatus === "failed") &&
      !activeJobStatus ? (
        <div className="mt-6 rounded-2xl border border-night-100 bg-night-50 p-4 sm:flex sm:items-center sm:justify-between sm:gap-4">
          <div>
            <p className="text-sm font-bold text-night-700">Export actions</p>
            <p className="mt-1 text-sm text-night-500">
              Refresh exports after layout or artwork changes.
            </p>
          </div>
          <div className="mt-4 grid gap-2 sm:mt-0 sm:grid-cols-2">
            <Button
              variant="secondary"
              onClick={handleRepairArt}
              disabled={repairingArt}
            >
              {repairingArt ? "Redoing art..." : "Redo art"}
            </Button>
            <Button
              variant="secondary"
              onClick={handleRegenerateExports}
              disabled={regeneratingExports}
            >
              {regeneratingExports ? "Refreshing PDFs..." : "Refresh PDFs"}
            </Button>
          </div>
        </div>
      ) : null}

      {hasMixedArt ? (
        <div className="mt-6 rounded-2xl border border-moon-200 bg-moon-100 p-4">
          <p className="font-bold text-night-700">{t("mixedArtTitle")}</p>
          <p className="mt-1 text-sm text-night-600">{t("mixedArtSub")}</p>
          <Button
            size="compact"
            onClick={handleRepairArt}
            disabled={repairingArt || Boolean(activeJobStatus)}
            className="mt-4"
          >
            {repairingArt ? t("repairingArtButton") : t("repairArtButton")}
          </Button>
        </div>
      ) : null}

      {expandedImage ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-night-900/75 p-2 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="expanded-image-dialog-title"
          onClick={() => setExpandedImage(null)}
        >
          <div
            className="relative flex max-h-[92dvh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl sm:rounded-3xl"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              aria-label="Close artwork preview"
              onClick={() => setExpandedImage(null)}
              className="absolute right-2 top-2 z-20 flex h-11 w-11 items-center justify-center rounded-full border border-night-100 bg-white/95 text-2xl font-bold leading-none text-night-800 shadow-lg ring-1 ring-white/70 transition hover:bg-night-50"
            >
              ×
            </button>
            {expandedImage.url ? (
              <div className="relative min-h-0 bg-night-100">
                <img
                  src={expandedImage.url}
                  alt={expandedImage.displayLabel ?? "Selected illustration"}
                  className="max-h-[calc(92dvh-112px)] w-full object-contain"
                />
                {artworkPreviews.length > 1 ? (
                  <>
                    <button
                      type="button"
                      onClick={() => moveExpandedImage(-1)}
                      className="absolute left-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-2xl font-bold text-night-800 shadow-lg"
                      aria-label="Previous illustration"
                    >
                      ‹
                    </button>
                    <button
                      type="button"
                      onClick={() => moveExpandedImage(1)}
                      className="absolute right-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-2xl font-bold text-night-800 shadow-lg"
                      aria-label="Next illustration"
                    >
                      ›
                    </button>
                  </>
                ) : null}
              </div>
            ) : null}
            <div className="shrink-0 flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5 sm:py-4">
              <p
                id="expanded-image-dialog-title"
                className="text-sm font-bold text-night-700"
              >
                {expandedImage.displayLabel ?? "Selected illustration"}
                {expandedImage.index !== undefined ? (
                  <span className="ml-2 font-medium text-night-400">
                    {expandedImage.index + 1} of {artworkPreviews.length}
                  </span>
                ) : null}
              </p>
              <div className="flex items-center gap-2">
                {(displayStatus === "ready" || displayStatus === "failed") &&
                expandedImage.title !== "Cover" &&
                expandedImage.title !== "Title" &&
                expandedImage.title !== "Back Cover" ? (
                  <Button
                    variant="secondary"
                    size="compact"
                    onClick={() => openRedoPrompt(expandedImage)}
                    disabled={
                      Boolean(regeneratingImage) || Boolean(activeJobStatus)
                    }
                  >
                    {regeneratingImage ===
                    `${expandedImage.spreadId}:${expandedImage.side}`
                      ? "Regenerating…"
                      : "Redo"}
                  </Button>
                ) : null}
                <Button
                  variant="secondary"
                  size="compact"
                  onClick={() => setExpandedImage(null)}
                >
                  Close
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
