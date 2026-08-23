"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import Button from "@/components/ui/Button";
import Icon from "@/components/ui/Icon";
import type { Story } from "@/types";

type StreamStatus = "starting" | "drafting" | "polishing";

export default function StoryReader({ story }: { story: Story }) {
  const router = useRouter();
  const [liveStory, setLiveStory] = useState(story);
  const [page, setPage] = useState(0);
  const [streaming, setStreaming] = useState(story.status === "generating");
  const [streamStatus, setStreamStatus] = useState<StreamStatus>("starting");
  const [error, setError] = useState(story.generationError ?? "");
  const [polishSeconds, setPolishSeconds] = useState(0);
  const startedRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const t = useTranslations("stories");
  const locale = useLocale();
  const currentPage = liveStory.pages[page];
  const total = liveStory.pages.length;
  const streamingEyebrow =
    streamStatus === "polishing"
      ? t("streamingPolishingEyebrow")
      : t("streamingEyebrow");
  const streamingProgress =
    streamStatus === "polishing"
      ? t("streamingPolishing")
      : t("streamingPageCount", { count: total });

  const startStreaming = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStreaming(true);
    setStreamStatus("starting");
    setError("");

    try {
      const res = await fetch(
        `/api/stories/${liveStory.id}/stream?locale=${locale}`,
        {
          method: "POST",
          signal: controller.signal,
        }
      );
      if (!res.ok || !res.body) {
        throw new Error(await res.text());
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";

        for (const rawEvent of events) {
          const event =
            rawEvent
              .split("\n")
              .find((line) => line.startsWith("event: "))
              ?.slice(7) ?? "message";
          const dataLine = rawEvent
            .split("\n")
            .find((line) => line.startsWith("data: "));
          if (!dataLine) continue;

          let data: Partial<Story> & {
            error?: string;
            status?: StreamStatus;
          };
          try {
            data = JSON.parse(dataLine.slice(6));
          } catch {
            // Skip a malformed/partial SSE line rather than failing the stream.
            continue;
          }

          if (event === "status" && data.status) {
            setStreamStatus(data.status);
          }

          if (event === "snapshot" && data.pages) {
            setLiveStory((current) => ({
              ...current,
              pages: data.pages ?? current.pages,
              status: "generating",
            }));
            setPage(Math.max(0, data.pages.length - 1));
          }

          if (event === "complete" && data.id) {
            setLiveStory(data as Story);
            setPage(0);
            setStreaming(false);
            window.dispatchEvent(new CustomEvent("storycot:credits-updated"));
            router.refresh();
          }

          if (event === "error") {
            throw new Error(data.error ?? "Story generation failed");
          }
        }
      }
    } catch (err) {
      // Navigating away/unmounting aborts the fetch; that's not a real failure,
      // so don't surface an error or mark the story failed.
      if (controller.signal.aborted || (err instanceof Error && err.name === "AbortError")) {
        return;
      }
      setStreaming(false);
      setLiveStory((current) => ({ ...current, status: "failed" }));
      setError(err instanceof Error ? err.message : "Story generation failed");
    }
  }, [liveStory.id, locale, router]);

  useEffect(() => {
    if (story.status !== "generating" || startedRef.current) return;
    startedRef.current = true;
    void startStreaming();
  }, [startStreaming, story.status]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  // Elapsed-time heartbeat so the non-streamed polish step doesn't look frozen.
  useEffect(() => {
    if (!streaming || streamStatus !== "polishing") {
      setPolishSeconds(0);
      return;
    }
    const startedAt = Date.now();
    const interval = setInterval(() => {
      setPolishSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [streaming, streamStatus]);

  return (
    <div className="select-none">
      <div className="relative overflow-hidden rounded-3xl border border-night-100 bg-white shadow-xl">
        <div className="border-b border-night-50 px-6 py-3 text-center sm:px-8 sm:py-4">
          <p className="text-xs font-bold uppercase tracking-widest text-night-300">
            {streaming ? streamingEyebrow : liveStory.title}
          </p>
        </div>

        <div className="min-h-[8rem] px-6 pb-8 pt-6 sm:px-8 sm:pb-10 sm:pt-8" aria-live="polite" aria-atomic="false">
          {currentPage ? (
            <p className="font-display text-xl font-medium leading-relaxed text-night-800 sm:text-2xl">
              {currentPage.text}
              {streaming && page === total - 1 && (
                <span className="ml-1 inline-block animate-pulse text-star-500">
                  |
                </span>
              )}
            </p>
          ) : (
            <div className="flex min-h-44 flex-col items-center justify-center text-center">
              <Icon
                name="sparkle"
                className="h-10 w-10 animate-pulse text-star-500"
              />
              <p className="mt-4 font-display text-2xl font-bold text-night-800">
                {t("streamingTitle")}
              </p>
              <p className="mt-2 text-night-400">{t("generatingSub")}</p>
            </div>
          )}
        </div>

        <div className="border-t border-night-50 px-6 py-3 text-center sm:px-8 sm:py-4">
          <p className="text-sm text-night-300">
            {total > 0
              ? t("pageOf", { page: page + 1, total })
              : t("streamingPagesPending")}
          </p>
        </div>
      </div>

      {streaming && total > 0 && (
        <p className="mt-4 flex items-center justify-center gap-2 text-center text-sm font-bold text-star-600">
          {streamStatus === "polishing" && (
            <Icon name="sparkle" className="h-4 w-4 animate-spin text-star-500" />
          )}
          <span>
            {streamingProgress}
            {streamStatus === "polishing" && polishSeconds > 0
              ? ` (${polishSeconds}s)`
              : ""}
          </span>
        </p>
      )}

      {error && (
        <div className="mt-6 rounded-2xl border border-blush-200 bg-blush-50 p-5 text-center">
          <p className="font-bold text-blush-700">{error}</p>
          <Button onClick={startStreaming} className="mt-4">
            {t("tryAgainButton")}
          </Button>
        </div>
      )}

      <div className="mt-4 flex items-center gap-2">
        <button
          onClick={() => setPage((p) => Math.max(0, p - 1))}
          disabled={page === 0 || total === 0}
          className="flex shrink-0 items-center gap-2 rounded-full border border-night-200 px-5 py-2.5 font-bold text-night-600 transition hover:bg-night-50 disabled:cursor-not-allowed disabled:opacity-30"
        >
          {t("prevButton")}
        </button>

        <div className="flex min-w-0 flex-1 flex-nowrap items-center justify-center gap-1.5 overflow-x-auto [&::-webkit-scrollbar]:hidden">
          {liveStory.pages.map((_, i) => (
            <button
              key={i}
              onClick={() => setPage(i)}
              aria-label={t("goToPage", { page: i + 1 })}
              className={`h-2 shrink-0 rounded-full transition-all ${
                i === page
                  ? "w-6 bg-night-700"
                  : "w-2 bg-night-200 hover:bg-night-400"
              }`}
            />
          ))}
        </div>

        <button
          onClick={() => setPage((p) => Math.min(total - 1, p + 1))}
          disabled={total === 0 || page === total - 1}
          className="flex shrink-0 items-center gap-2 rounded-full border border-night-200 px-5 py-2.5 font-bold text-night-600 transition hover:bg-night-50 disabled:cursor-not-allowed disabled:opacity-30"
        >
          {t("nextButton")}
        </button>
      </div>

      {total > 0 && (
        <details className="mt-8 rounded-2xl border border-night-100 bg-white">
          <summary className="cursor-pointer px-6 py-4 font-bold text-night-600 hover:text-night-800">
            {t("readFullText")}
          </summary>
          <div className="border-t border-night-50 px-6 pb-6 pt-4">
            <div className="space-y-4 font-display text-lg leading-relaxed text-night-800">
              {liveStory.pages.map((p, i) => (
                <p key={i}>{p.text}</p>
              ))}
            </div>
          </div>
        </details>
      )}
    </div>
  );
}
