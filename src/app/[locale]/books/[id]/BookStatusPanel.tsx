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
>;

function isTerminal(status: BookProject["status"]): boolean {
  return status === "ready" || status === "failed";
}

export default function BookStatusPanel({
  initialProject,
}: {
  initialProject: BookProject;
}) {
  const t = useTranslations("books");
  const router = useRouter();
  const [project, setProject] = useState(initialProject);
  const [retrying, setRetrying] = useState(false);
  const [repairingArt, setRepairingArt] = useState(false);
  const [startingBuild, setStartingBuild] = useState(false);
  const buildStartedRef = useRef(false);
  const activeJobStatus = project.assets.activeJobStatus;

  useEffect(() => {
    if (project.status !== "queued" || buildStartedRef.current) return;

    buildStartedRef.current = true;
    setStartingBuild(true);

    void fetch(`/api/books/${project.id}/build`, {
      method: "POST",
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
    if (isTerminal(project.status) && !activeJobStatus) return;

    const interval = window.setInterval(async () => {
      const res = await fetch(`/api/books/${project.id}/status`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const next = (await res.json()) as BookStatusPayload;
      setProject((current) => ({ ...current, ...next }));

      if (
        (next.status === "ready" || next.status === "failed") &&
        !next.assets.activeJobStatus
      ) {
        router.refresh();
      }
    }, 4000);

    return () => window.clearInterval(interval);
  }, [activeJobStatus, project.id, project.status, router]);

  async function handleRetry() {
    setRetrying(true);
    const res = await fetch(`/api/books/${project.id}/build`, {
      method: "POST",
    });
    if (res.ok) {
      const next = (await res.json()) as BookProject;
      setProject(next);
    }
    setRetrying(false);
  }

  async function handleRepairArt() {
    setRepairingArt(true);
    const res = await fetch(`/api/books/${project.id}/build`, {
      method: "POST",
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
            disabled={retrying}
            className="mt-4"
          >
            {retrying ? t("retryingButton") : t("retryButton")}
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
    </section>
  );
}
