"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import Button from "@/components/ui/Button";
import {
  getBookProjectDisplayStageLabel,
  getBookProjectProgress,
} from "@/lib/print-books/status";
import type { BookProject } from "@/types/printBook";

type SpreadPreview = {
  id: string;
  sequence: number;
  title?: string;
  thumbnailUrl?: string;
  leftPageImageUrl?: string;
  rightPageImageUrl?: string;
  leftPageImageError?: string;
  rightPageImageError?: string;
};

type ExpandedImage = {
  spreadId: string;
  sequence: number;
  title?: string;
  side: "left" | "right";
  url?: string;
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
> & { spreadPreviews?: SpreadPreview[] };

function getFailedImageTargets(spreads: SpreadPreview[]): ExpandedImage[] {
  return spreads.flatMap((preview) => {
    const images: Array<{
      side: "left" | "right";
      url?: string;
      error?: string;
    }> = [
      {
        side: "left",
        url: preview.leftPageImageUrl,
        error: preview.leftPageImageError,
      },
      {
        side: "right",
        url: preview.rightPageImageUrl,
        error: preview.rightPageImageError,
      },
    ];

    return images
      .filter(({ url, error }) => Boolean(error) || !url)
      .map(({ side, url }) => ({
        spreadId: preview.id,
        sequence: preview.sequence,
        title: preview.title,
        side,
        url,
      }));
  });
}

function isPlaceholderImageUrl(url?: string): boolean {
  if (!url) return false;
  const lower = url.toLowerCase();
  return lower.startsWith("data:image/svg") || lower.endsWith(".svg");
}

function getRepairImageTargets(spreads: SpreadPreview[]): ExpandedImage[] {
  return spreads.flatMap((preview) => {
    const images: Array<{
      side: "left" | "right";
      url?: string;
      error?: string;
    }> = [
      {
        side: "left",
        url: preview.leftPageImageUrl,
        error: preview.leftPageImageError,
      },
      {
        side: "right",
        url: preview.rightPageImageUrl,
        error: preview.rightPageImageError,
      },
    ];

    return images
      .filter(
        ({ url, error }) => Boolean(error) || !url || isPlaceholderImageUrl(url)
      )
      .map(({ side, url }) => ({
        spreadId: preview.id,
        sequence: preview.sequence,
        title: preview.title,
        side,
        url,
      }));
  });
}

function isTerminal(status: BookProject["status"]): boolean {
  return status === "ready" || status === "failed";
}

function getSpreadPreviews(project: BookProject): SpreadPreview[] {
  return project.spreads
    .filter(
      (s) =>
        s.layoutType === "text_art" ||
        s.layoutType === "hero" ||
        s.layoutType === "quiet"
    )
    .map((s) => ({
      id: s.id,
      sequence: s.sequence,
      title: s.title,
      thumbnailUrl: s.thumbnailUrl ?? s.imageUrl,
      leftPageImageUrl: s.leftPageImageUrl ?? s.imageUrl,
      rightPageImageUrl: s.rightPageImageUrl ?? s.imageUrl,
      leftPageImageError: s.leftPageImageError,
      rightPageImageError: s.rightPageImageError,
    }))
    .sort((a, b) => a.sequence - b.sequence);
}

export default function BookStatusPanel({
  initialProject,
}: {
  initialProject: BookProject;
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
  const [regeneratingImage, setRegeneratingImage] = useState<string | null>(
    null
  );
  const [imageError, setImageError] = useState("");
  const [expandedImage, setExpandedImage] = useState<ExpandedImage | null>(
    null
  );
  const [pollUntil, setPollUntil] = useState(0);
  const [startingBuild, setStartingBuild] = useState(false);
  const buildStartedRef = useRef(false);
  const activeJobStatus = project.assets.activeJobStatus;

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
        setProject((current) => ({ ...current, ...next }));
        if (next.spreadPreviews) {
          setSpreadPreviews(
            [...next.spreadPreviews].sort((a, b) => a.sequence - b.sequence)
          );
        }

        if (
          (next.status === "ready" || next.status === "failed") &&
          !next.assets.activeJobStatus
        ) {
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

  async function handleRegenerateImage(image: ExpandedImage) {
    setRegeneratingImage(`${image.spreadId}:${image.side}`);
    setImageError("");
    const res = await fetch(`/api/books/${project.id}/images/regenerate`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ spreadId: image.spreadId, side: image.side }),
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
          ? nextPreview?.leftPageImageUrl
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
    }
    setRepairingArt(false);
  }

  const progress = getBookProjectProgress(project);
  const stageLabel = getBookProjectDisplayStageLabel(project);
  const isActiveBuild =
    (project.status !== "ready" && project.status !== "failed") ||
    Boolean(activeJobStatus);
  const hasMixedArt =
    project.status === "ready" && project.assets.artMode === "mixed";
  const failedImageTargets = getFailedImageTargets(spreadPreviews);
  const hasImageGenerationFailure =
    project.errorCode === "illustrating:image_failed" &&
    failedImageTargets.length > 0;
  const showSpreadGrid =
    project.status === "illustrating" ||
    project.status === "failed" ||
    spreadPreviews.some((p) => p.thumbnailUrl);
  const lastUpdated = project.updatedAt
    ? new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(new Date(project.updatedAt))
    : null;

  return (
    <section className="rounded-3xl border border-night-100 bg-white p-8 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-wide text-star-600">
            {t("statusLabel")}
          </p>
          <h2 className="mt-2 font-display text-3xl font-bold text-night-800">
            {stageLabel}
          </h2>
          <p className="mt-2 text-night-500">
            {project.status === "ready"
              ? t("illustratedPdfReadySub")
              : project.status === "failed"
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

      <div className="mt-6 h-3 overflow-hidden rounded-full bg-night-100">
        <div
          className="h-full rounded-full bg-star-400 transition-all"
          style={{ width: `${Math.min(progress, 100)}%` }}
        />
      </div>

      {showSpreadGrid && spreadPreviews.length > 0 ? (
        <div className="mt-6">
          <div className="mb-3 flex items-end justify-between gap-4">
            <p className="text-xs font-bold uppercase tracking-wide text-night-400">
              {t("spreadProgress", {
                completed: spreadPreviews.filter(
                  (preview) =>
                    preview.leftPageImageUrl && preview.rightPageImageUrl
                ).length,
                total: spreadPreviews.length,
              })}
            </p>
            {project.status === "ready" || project.status === "failed" ? (
              <p className="text-xs font-bold text-night-400">
                Retry failed images free · Redo finished images: 1 credit
              </p>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {spreadPreviews.map((preview) => {
              const images: Array<{
                side: "left" | "right";
                url?: string;
                error?: string;
              }> = [
                {
                  side: "left",
                  url: preview.leftPageImageUrl,
                  error: preview.leftPageImageError,
                },
                {
                  side: "right",
                  url: preview.rightPageImageUrl,
                  error: preview.rightPageImageError,
                },
              ];

              return images.map(({ side, url, error }) => {
                const key = `${preview.id}:${side}`;
                const isRegenerating = regeneratingImage === key;
                const isEditableStatus =
                  project.status === "ready" || project.status === "failed";
                const isGeneratedPage =
                  preview.title !== "Cover" &&
                  preview.title !== "Title" &&
                  preview.title !== "Back Cover";
                const isFreeRetry = Boolean(error) || !url;
                const canRegenerate =
                  isEditableStatus && isGeneratedPage && !activeJobStatus;
                return (
                  <div
                    key={key}
                    className="overflow-hidden rounded-2xl border border-night-100 bg-night-50"
                  >
                    <button
                      type="button"
                      onClick={() =>
                        url
                          ? setExpandedImage({
                              spreadId: preview.id,
                              sequence: preview.sequence,
                              title: preview.title,
                              side,
                              url: url!,
                            })
                          : undefined
                      }
                      className="block aspect-square w-full overflow-hidden bg-night-100"
                      aria-label={`Open spread ${preview.sequence} ${side} image`}
                    >
                      {url ? (
                        <img
                          src={url}
                          alt={`${t("spreadNumberLabel", {
                            sequence: preview.sequence,
                          })} ${side}`}
                          className="h-full w-full object-cover transition hover:scale-105"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-night-100 px-3 text-center text-xs font-bold text-night-400">
                          {error ? "Image failed" : "Waiting for image"}
                        </div>
                      )}
                    </button>
                    {error ? (
                      <p className="px-3 pt-2 text-xs font-medium text-blush-700">
                        {error}
                      </p>
                    ) : null}
                    <div className="flex items-center justify-between gap-2 px-3 py-2">
                      <span className="text-xs font-bold uppercase tracking-wide text-night-500">
                        {preview.sequence} · {side}
                      </span>
                      {canRegenerate ? (
                        <button
                          type="button"
                          onClick={() =>
                            handleRegenerateImage({
                              spreadId: preview.id,
                              sequence: preview.sequence,
                              title: preview.title,
                              side,
                              url,
                            })
                          }
                          disabled={
                            Boolean(regeneratingImage) ||
                            Boolean(activeJobStatus)
                          }
                          className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-night-700 shadow-sm disabled:opacity-50"
                        >
                          {isRegenerating
                            ? "Working…"
                            : isFreeRetry
                              ? "Retry"
                              : "Redo"}
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              });
            })}
          </div>
          {imageError ? (
            <p className="mt-4 rounded-xl bg-blush-100 px-4 py-3 text-sm font-bold text-blush-700">
              {imageError}
            </p>
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
            <div>
              <p className="font-bold text-star-800">
                {startingBuild && project.status === "queued"
                  ? t("startingTitle")
                  : t("activeTitle")}
              </p>
              <p className="mt-1 text-sm text-star-900">
                {startingBuild && project.status === "queued"
                  ? t("startingSub")
                  : t("activeSub")}
              </p>
              <p className="mt-2 text-xs font-medium uppercase tracking-wide text-star-700">
                {t("safeToLeave")}
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {project.status === "failed" ? (
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

      {project.status === "ready" && !activeJobStatus ? (
        <div className="mt-4 flex justify-end gap-2">
          <Button
            variant="secondary"
            size="compact"
            onClick={handleRepairArt}
            disabled={repairingArt}
          >
            {repairingArt ? "Redoing Art…" : "Redo Art"}
          </Button>
          <Button
            variant="secondary"
            size="compact"
            onClick={handleRegenerateExports}
            disabled={regeneratingExports}
          >
            {regeneratingExports ? "Refreshing PDF…" : "Refresh PDF"}
          </Button>
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-night-900/75 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setExpandedImage(null)}
        >
          <div
            className="max-h-[92vh] w-full max-w-4xl overflow-hidden rounded-3xl bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            {expandedImage.url ? (
              <img
                src={expandedImage.url}
                alt={`Spread ${expandedImage.sequence} ${expandedImage.side} image`}
                className="max-h-[76vh] w-full bg-night-100 object-contain"
              />
            ) : null}
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <p className="text-sm font-bold text-night-700">
                Spread {expandedImage.sequence} · {expandedImage.side} image
              </p>
              <div className="flex items-center gap-2">
                {(project.status === "ready" || project.status === "failed") &&
                expandedImage.title !== "Cover" &&
                expandedImage.title !== "Title" &&
                expandedImage.title !== "Back Cover" ? (
                  <Button
                    variant="secondary"
                    size="compact"
                    onClick={() => handleRegenerateImage(expandedImage)}
                    disabled={
                      Boolean(regeneratingImage) || Boolean(activeJobStatus)
                    }
                  >
                    {regeneratingImage ===
                    `${expandedImage.spreadId}:${expandedImage.side}`
                      ? "Regenerating…"
                      : "Regenerate for 1 credit"}
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
