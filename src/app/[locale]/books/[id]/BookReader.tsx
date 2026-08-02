"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import Icon from "@/components/ui/Icon";
import type { BookProject, BookSpread } from "@/types/printBook";
import { DEFAULT_NARRATION_VOICE_ID, type WordTiming } from "@/lib/elevenlabs";

type ReaderSpread = {
  id: string;
  sequence: number;
  title?: string;
  layoutType?: BookSpread["layoutType"];
  leftPageText: string;
  rightPageText: string;
  imageUrl?: string;
  webImageUrl?: string;
};

type NarrationPayload = {
  audioUrl: string;
  words: WordTiming[];
};

function isPlaceholder(url?: string): boolean {
  if (!url) return true;
  const lower = url.toLowerCase();
  return lower.startsWith("data:image/svg") || lower.endsWith(".svg");
}

function getReaderSpreads(project: BookProject): ReaderSpread[] {
  const seen = new Set<string>();
  const story: ReaderSpread[] = project.spreads
    .filter((s: BookSpread) => {
      if (seen.has(s.id)) return false;
      seen.add(s.id);
      return (
        s.layoutType === "text_art" ||
        s.layoutType === "hero" ||
        s.layoutType === "quiet" ||
        s.layoutType === "text_only"
      );
    })
    .sort((a, b) => a.sequence - b.sequence)
    .map((s) => ({
      id: s.id,
      sequence: s.sequence,
      title: s.title,
      layoutType: s.layoutType,
      leftPageText: s.leftPageText,
      rightPageText: s.rightPageText,
      imageUrl: s.leftPageWebImageUrl ?? s.leftPageImageUrl ?? s.imageUrl,
      webImageUrl: s.leftPageWebImageUrl,
    }));

  // Prepend cover as first page if available
  const coverUrl =
    project.assets.coverWebImageUrl ?? project.assets.coverImageUrl;
  if (coverUrl && !isPlaceholder(coverUrl)) {
    story.unshift({
      id: "cover",
      sequence: 0,
      title: undefined,
      leftPageText: "",
      rightPageText: "",
      imageUrl: coverUrl,
      webImageUrl: project.assets.coverWebImageUrl,
    });
  }

  return story;
}

export default function BookReader({
  project,
  isAdmin = false,
}: {
  project: BookProject;
  isAdmin?: boolean;
}) {
  const spreads = useMemo(() => getReaderSpreads(project), [project]);
  const [index, setIndex] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [isLandscape, setIsLandscape] = useState(false);

  // Narration
  const [narrating, setNarrating] = useState(false);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const [words, setWords] = useState<WordTiming[]>([]);
  const [currentWordIndex, setCurrentWordIndex] = useState(-1);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const wordsRef = useRef<WordTiming[]>([]);
  const preloadCache = useRef<Map<string, Promise<NarrationPayload | null>>>(
    new Map()
  );

  const total = spreads.length;
  const spread = spreads[index];
  const t = useTranslations("books");
  const tc = useTranslations("common");

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.removeAttribute("src");
      audioRef.current.load();
      audioRef.current = null;
    }
  }, []);

  const getNarrationUrl = useCallback(
    (spreadId: string) =>
      `/api/books/${project.id}/narrate?spreadId=${encodeURIComponent(spreadId)}&voiceId=${encodeURIComponent(DEFAULT_NARRATION_VOICE_ID)}`,
    [project.id]
  );

  const fetchNarration = useCallback(
    async (spreadId: string): Promise<NarrationPayload | null> => {
      const cached = preloadCache.current.get(spreadId);
      if (cached) {
        const cachedResult = await cached;
        if (cachedResult) return cachedResult;
        preloadCache.current.delete(spreadId);
      }

      const res = await fetch(getNarrationUrl(spreadId));
      if (!res.ok) return null;
      return (await res.json()) as NarrationPayload;
    },
    [getNarrationUrl]
  );

  const preloadNarration = useCallback(
    (nextSpread: ReaderSpread | undefined) => {
      if (!nextSpread || nextSpread.id === "cover") return;
      if (preloadCache.current.has(nextSpread.id)) return;

      const nextText = [nextSpread.leftPageText, nextSpread.rightPageText]
        .filter(Boolean)
        .join(" ")
        .trim();
      if (!nextText) return;

      const promise = fetch(getNarrationUrl(nextSpread.id))
        .then((r) => (r.ok ? (r.json() as Promise<NarrationPayload>) : null))
        .catch(() => null)
        .then((data) => {
          if (!data) preloadCache.current.delete(nextSpread.id);
          return data;
        });
      preloadCache.current.set(nextSpread.id, promise);

      void promise.then((data) => {
        if (data?.audioUrl) {
          const hint = new Audio();
          hint.preload = "auto";
          hint.src = data.audioUrl;
        }
      });
    },
    [getNarrationUrl]
  );

  const prev = useCallback(() => {
    setNarrating(false);
    stopAudio();
    setIndex((i) => Math.max(0, i - 1));
  }, [stopAudio]);

  const next = useCallback(() => {
    setNarrating(false);
    stopAudio();
    setIndex((i) => Math.min(total - 1, i + 1));
  }, [stopAudio, total]);

  // Keyboard navigation in fullscreen
  useEffect(() => {
    if (!fullscreen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight" || e.key === "ArrowDown") next();
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") prev();
      if (e.key === "Escape") setFullscreen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen, next, prev]);

  // Track orientation for fullscreen split-panel layout
  useEffect(() => {
    if (!fullscreen) return;
    function update() {
      setIsLandscape(window.innerWidth > window.innerHeight);
    }
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [fullscreen]);

  // Narration engine - runs whenever narrating, index, or voice changes
  useEffect(() => {
    if (!narrating) return;

    const currentSpread = spreads[index];
    if (!currentSpread) {
      setNarrating(false);
      return;
    }

    const text = [currentSpread.leftPageText, currentSpread.rightPageText]
      .filter(Boolean)
      .join(" ")
      .trim();

    // Skip pages without text (e.g. cover) and advance
    if (!text || currentSpread.id === "cover") {
      if (index < spreads.length - 1) {
        setIndex((i) => i + 1);
      } else {
        setNarrating(false);
      }
      return;
    }

    let cancelled = false;
    let activeAudio: HTMLAudioElement | null = null;
    const onTimeUpdate = () => {
      if (!activeAudio) return;
      const t = activeAudio.currentTime;
      const ws = wordsRef.current;
      // Highlight the last word whose start time has passed (no gaps between words)
      let idx = -1;
      for (let i = ws.length - 1; i >= 0; i--) {
        if (ws[i]!.start <= t) {
          idx = i;
          break;
        }
      }
      setCurrentWordIndex(idx);
    };
    const onEnded = () => {
      if (cancelled) return;
      setCurrentWordIndex(-1);
      setIndex((i) => {
        if (i < spreads.length - 1) return i + 1;
        setNarrating(false);
        return i;
      });
    };
    setIsLoadingAudio(true);

    const narrate = async () => {
      try {
        const result = await fetchNarration(currentSpread.id);

        if (!result || cancelled) {
          if (!cancelled) setNarrating(false);
          return;
        }

        const { audioUrl, words: pageWords } = result as {
          audioUrl: string;
          words: WordTiming[];
        };
        if (cancelled) return;

        wordsRef.current = pageWords ?? [];
        setWords(pageWords ?? []);

        const audio = audioRef.current ?? new Audio();
        audio.preload = "auto";
        audio.src = audioUrl;
        audio.currentTime = 0;
        activeAudio = audio;
        audioRef.current = audio;

        // Preload the next spread's audio while this one plays
        preloadNarration(spreads[index + 1]);

        audio.addEventListener("timeupdate", onTimeUpdate);
        audio.addEventListener("ended", onEnded);

        await audio.play();
      } catch {
        if (!cancelled) setNarrating(false);
      } finally {
        if (!cancelled) setIsLoadingAudio(false);
      }
    };

    void narrate();

    return () => {
      cancelled = true;
      const audio = activeAudio;
      if (audio) {
        audio.removeEventListener("timeupdate", onTimeUpdate);
        audio.removeEventListener("ended", onEnded);
        if (!audio.ended && audioRef.current === audio) stopAudio();
      }
      setIsLoadingAudio(false);
      wordsRef.current = [];
      setWords([]);
      setCurrentWordIndex(-1);
    };
  }, [narrating, index, spreads, fetchNarration, preloadNarration, stopAudio]);

  if (!spread || total === 0) return null;

  const hasImage = spread.imageUrl && !isPlaceholder(spread.imageUrl);
  const isTextOnlyPage = spread.layoutType === "text_only";
  const pageText = [spread.leftPageText, spread.rightPageText]
    .filter(Boolean)
    .join(" ")
    .trim();
  const hasPurchased =
    isAdmin || Boolean(project.assets.digitalDownloadUnlockedAt);
  const canNarrate =
    hasPurchased && spreads.some((s) => s.leftPageText || s.rightPageText);
  const showNarrationUpsell =
    !hasPurchased && spreads.some((s) => s.leftPageText || s.rightPageText);

  return (
    <div className="select-none">
      {/* Main reader card */}
      <div
        className={`overflow-hidden rounded-3xl border border-night-100 bg-white shadow-xl${pageText && !isTextOnlyPage ? " lg:flex lg:min-h-[480px]" : ""}`}
      >
        {/* Image panel */}
        {hasImage ? (
          <div
            className={`relative aspect-square w-full overflow-hidden max-h-[55vh]${pageText ? " lg:aspect-auto lg:max-h-none lg:w-[55%] lg:shrink-0" : " lg:max-h-[75vh]"}`}
          >
            <Image
              src={spread.imageUrl!}
              alt={spread.title ?? t("pageOf", { page: index + 1, total })}
              fill
              sizes="(min-width: 1024px) 55vw, 100vw"
              className="pointer-events-none object-cover select-none"
              draggable={false}
              priority={index === 0}
              onContextMenu={(e) => e.preventDefault()}
            />
            {/* Transparent overlay - blocks right-click/long-press, captures expand tap */}
            <div
              className="absolute inset-0 cursor-pointer"
              onClick={() => setFullscreen(true)}
              onContextMenu={(e) => e.preventDefault()}
              role="button"
              tabIndex={0}
              aria-label={t("viewFullScreen")}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") setFullscreen(true);
              }}
            />
            {/* Gradient + title overlay */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-6 pb-5 pt-10">
              {spread.title ? (
                <p className="font-display text-lg font-bold leading-tight text-white drop-shadow">
                  {spread.title}
                </p>
              ) : null}
            </div>
            {/* Page counter badge */}
            <div className="pointer-events-none absolute right-3 top-3 rounded-full bg-black/30 px-2.5 py-1 text-xs font-bold text-white backdrop-blur-sm">
              {index + 1} / {total}
            </div>
            {/* Expand hint */}
            <div className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/30 px-2.5 py-1 text-xs text-white/80 backdrop-blur-sm">
              {t("tapToExpand")}
            </div>
          </div>
        ) : !isTextOnlyPage ? (
          <div className="flex items-center justify-center bg-moon-50 px-8 py-16 lg:w-[55%] lg:shrink-0">
            <div className="text-center">
              <span className="text-5xl" aria-hidden="true">
                <Icon name="image" className="h-8 w-8" />
              </span>
              <p className="mt-3 text-sm font-medium text-night-400">
                {t("illustrationComingSoon")}
              </p>
            </div>
          </div>
        ) : null}

        {/* Text + indicator (right side on desktop) - hidden for cover/pages without text */}
        {pageText ? (
          <div className="flex flex-col lg:flex-1">
            <div
              className={`flex-1 border-night-50 px-7 pb-8 pt-6 lg:flex lg:items-center ${
                isTextOnlyPage
                  ? "min-h-[420px] justify-center"
                  : "border-t lg:border-t-0 lg:border-l"
              }`}
            >
              <p className="font-display text-xl font-medium leading-relaxed text-night-800">
                {words.length > 0
                  ? words.map((w, i) => (
                      <span
                        key={i}
                        className={
                          i === currentWordIndex
                            ? "rounded-sm bg-yellow-200"
                            : ""
                        }
                      >
                        {w.word}{" "}
                      </span>
                    ))
                  : pageText}
              </p>
            </div>
            <div className="border-t border-night-50 px-7 py-3 text-center">
              <p className="text-xs text-night-300">
                {t("pageOf", { page: index + 1, total })}
              </p>
            </div>
          </div>
        ) : null}
      </div>

      {/* Navigation */}
      <div className="mt-5 flex items-center justify-between">
        <button
          onClick={prev}
          disabled={index === 0}
          className="flex items-center gap-2 rounded-full border border-night-200 px-6 py-3 font-bold text-night-600 transition hover:bg-night-50 disabled:cursor-not-allowed disabled:opacity-30"
        >
          {t("prevButton")}
        </button>

        <div className="flex max-w-[42%] flex-wrap justify-center gap-1.5">
          {spreads.map((_, i) => (
            <button
              key={i}
              onClick={() => {
                setNarrating(false);
                stopAudio();
                setIndex(i);
              }}
              aria-label={t("goToPage", { page: i + 1 })}
              className={`h-2 rounded-full transition-all ${
                i === index
                  ? "w-6 bg-night-700"
                  : "w-2 bg-night-200 hover:bg-night-400"
              }`}
            />
          ))}
        </div>

        <button
          onClick={next}
          disabled={index === total - 1}
          className="flex items-center gap-2 rounded-full border border-night-200 px-6 py-3 font-bold text-night-600 transition hover:bg-night-50 disabled:cursor-not-allowed disabled:opacity-30"
        >
          {t("nextButton")}
        </button>
      </div>

      {/* Narration controls */}
      {canNarrate ? (
        <div className="mt-4 rounded-2xl border border-night-100 bg-white/60 px-5 py-4 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                if (narrating) {
                  setNarrating(false);
                  stopAudio();
                } else {
                  setNarrating(true);
                }
              }}
              disabled={isLoadingAudio}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-night-800 text-white shadow-sm transition hover:bg-night-700 disabled:opacity-50"
              aria-label={narrating ? t("pauseNarration") : t("listenToStory")}
            >
              {isLoadingAudio ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : narrating ? (
                <svg
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="h-5 w-5"
                >
                  <rect x="4" y="3" width="4" height="14" rx="1" />
                  <rect x="12" y="3" width="4" height="14" rx="1" />
                </svg>
              ) : (
                <svg
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="h-5 w-5 translate-x-0.5"
                >
                  <path d="M6.3 2.841A1.5 1.5 0 004 4.11v11.78a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                </svg>
              )}
            </button>

            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-night-500">
                {narrating
                  ? isLoadingAudio
                    ? tc("loading")
                    : t("readingAloud")
                  : t("listenToStory")}
              </p>
            </div>
          </div>
        </div>
      ) : showNarrationUpsell ? (
        <a
          href="#digital-download"
          className="mt-4 flex items-center gap-3 rounded-2xl border border-night-100 bg-white/60 px-5 py-4 backdrop-blur-sm"
        >
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-night-100 text-night-500">
            <svg
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-5 w-5 translate-x-0.5"
            >
              <path d="M6.3 2.841A1.5 1.5 0 004 4.11v11.78a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-night-800">
              {t("narrationUpsellTitle")}
            </p>
            <p className="text-xs text-night-400">{t("narrationUpsellSub")}</p>
          </div>
          <svg
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-4 w-4 shrink-0 text-night-300"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
              clipRule="evenodd"
            />
          </svg>
        </a>
      ) : null}

      {/* Fullscreen reader overlay */}
      {fullscreen ? (
        <div
          className={`fixed inset-0 z-50 flex bg-black lg:flex-row lg:bg-white ${isLandscape ? "flex-row" : "flex-col"}`}
          style={{ WebkitTouchCallout: "none" } as React.CSSProperties}
        >
          {/* Portrait-only top bar - hidden in landscape (controls move to text panel) */}
          {!isLandscape ? (
            <div className="flex shrink-0 items-center justify-between px-4 py-3 lg:hidden">
              <p className="text-sm font-bold text-white/60">
                {index + 1} / {total}
              </p>
              <div className="flex items-center gap-2">
                {canNarrate ? (
                  <button
                    onClick={() => {
                      if (narrating) {
                        setNarrating(false);
                        stopAudio();
                      } else {
                        setNarrating(true);
                      }
                    }}
                    disabled={isLoadingAudio}
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 disabled:opacity-50"
                    aria-label={
                      narrating ? t("pauseNarration") : t("listenShort")
                    }
                  >
                    {isLoadingAudio ? (
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    ) : narrating ? (
                      <svg
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        className="h-4 w-4"
                      >
                        <rect x="4" y="3" width="4" height="14" rx="1" />
                        <rect x="12" y="3" width="4" height="14" rx="1" />
                      </svg>
                    ) : (
                      <svg
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        className="h-4 w-4 translate-x-0.5"
                      >
                        <path d="M6.3 2.841A1.5 1.5 0 004 4.11v11.78a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                      </svg>
                    )}
                  </button>
                ) : null}
                <button
                  onClick={() => setFullscreen(false)}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
                  aria-label={tc("close")}
                >
                  ✕
                </button>
              </div>
            </div>
          ) : null}

          {/* Image panel - portrait: full width square; landscape: full height square; desktop: full height square */}
          <div
            className={`relative min-h-0 flex-shrink-0${
              isLandscape ? " h-full aspect-square" : " w-full aspect-square"
            }${pageText ? " lg:h-screen lg:aspect-square lg:flex-none lg:shrink-0" : " lg:flex-1"}`}
          >
            {hasImage ? (
              <Image
                src={spread.imageUrl!}
                alt={spread.title ?? t("pageOf", { page: index + 1, total })}
                fill
                sizes="(min-width: 1024px) 60vw, 100vw"
                className="pointer-events-none object-contain select-none"
                draggable={false}
                priority
                onContextMenu={(e) => e.preventDefault()}
              />
            ) : (
              <div className="flex h-full items-center justify-center">
                <p className="text-white/40 lg:text-night-400">
                  {t("noIllustration")}
                </p>
              </div>
            )}

            {/* Invisible tap zones for prev/next */}
            <button
              onClick={prev}
              disabled={index === 0}
              className="absolute inset-y-0 left-0 w-1/3 opacity-0"
              aria-hidden="true"
              tabIndex={-1}
            />
            <button
              onClick={next}
              disabled={index === total - 1}
              className="absolute inset-y-0 right-0 w-1/3 opacity-0"
              aria-hidden="true"
              tabIndex={-1}
            />

            {/* Arrow hints - visible on portrait + desktop, hidden on landscape mobile */}
            {index > 0 ? (
              <button
                onClick={prev}
                className={`absolute left-3 top-1/2 -translate-y-1/2 h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm hover:bg-black/60 ${isLandscape ? "hidden lg:flex" : "flex"}`}
                aria-label={t("previousPage")}
              >
                ‹
              </button>
            ) : null}
            {index < total - 1 ? (
              <button
                onClick={next}
                className={`absolute right-3 top-1/2 -translate-y-1/2 h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm hover:bg-black/60 ${isLandscape ? "hidden lg:flex" : "flex"}`}
                aria-label={t("nextPage")}
              >
                ›
              </button>
            ) : null}
          </div>

          {/* Text + nav panel - portrait: flex-1 below image; landscape + desktop: right panel */}
          {pageText ? (
            <div
              className={`flex flex-1 flex-col overflow-hidden bg-black lg:bg-white lg:border-l lg:border-night-100${isLandscape ? " border-l border-white/10" : ""}`}
            >
              {/* Controls row - landscape mobile + desktop */}
              {isLandscape ? (
                <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-3 lg:hidden">
                  <p className="text-sm font-medium text-white/60">
                    {index + 1} / {total}
                  </p>
                  <div className="flex items-center gap-2">
                    {canNarrate ? (
                      <button
                        onClick={() => {
                          if (narrating) {
                            setNarrating(false);
                            stopAudio();
                          } else {
                            setNarrating(true);
                          }
                        }}
                        disabled={isLoadingAudio}
                        className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 disabled:opacity-50"
                        aria-label={
                          narrating ? t("pauseNarration") : t("listenShort")
                        }
                      >
                        {isLoadingAudio ? (
                          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        ) : narrating ? (
                          <svg
                            viewBox="0 0 20 20"
                            fill="currentColor"
                            className="h-4 w-4"
                          >
                            <rect x="4" y="3" width="4" height="14" rx="1" />
                            <rect x="12" y="3" width="4" height="14" rx="1" />
                          </svg>
                        ) : (
                          <svg
                            viewBox="0 0 20 20"
                            fill="currentColor"
                            className="h-4 w-4 translate-x-0.5"
                          >
                            <path d="M6.3 2.841A1.5 1.5 0 004 4.11v11.78a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                          </svg>
                        )}
                      </button>
                    ) : null}
                    <button
                      onClick={() => setFullscreen(false)}
                      className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
                      aria-label={tc("close")}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ) : null}

              {/* Desktop controls row */}
              <div className="hidden lg:flex shrink-0 items-center justify-between border-b border-night-100 px-6 py-4">
                <p className="text-sm font-medium text-night-400">
                  {index + 1} / {total}
                </p>
                <div className="flex items-center gap-2">
                  {canNarrate ? (
                    <button
                      onClick={() => {
                        if (narrating) {
                          setNarrating(false);
                          stopAudio();
                        } else {
                          setNarrating(true);
                        }
                      }}
                      disabled={isLoadingAudio}
                      className="flex h-9 w-9 items-center justify-center rounded-full border border-night-200 text-night-700 hover:bg-night-50 disabled:opacity-50"
                      aria-label={
                        narrating ? t("pauseNarration") : t("listenShort")
                      }
                    >
                      {isLoadingAudio ? (
                        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-night-700 border-t-transparent" />
                      ) : narrating ? (
                        <svg
                          viewBox="0 0 20 20"
                          fill="currentColor"
                          className="h-4 w-4"
                        >
                          <rect x="4" y="3" width="4" height="14" rx="1" />
                          <rect x="12" y="3" width="4" height="14" rx="1" />
                        </svg>
                      ) : (
                        <svg
                          viewBox="0 0 20 20"
                          fill="currentColor"
                          className="h-4 w-4 translate-x-0.5"
                        >
                          <path d="M6.3 2.841A1.5 1.5 0 004 4.11v11.78a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                        </svg>
                      )}
                    </button>
                  ) : null}
                  <button
                    onClick={() => setFullscreen(false)}
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-night-200 text-night-700 hover:bg-night-50"
                    aria-label={tc("close")}
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Story text - vertically centred, fills available space */}
              <div className="flex flex-1 items-center overflow-y-auto px-5 py-5 lg:px-8 lg:py-8">
                <p className="font-display text-lg font-medium leading-relaxed text-white/95 lg:text-2xl lg:text-night-800">
                  {words.length > 0
                    ? words.map((w, i) => (
                        <span
                          key={i}
                          className={
                            i === currentWordIndex
                              ? "font-bold text-yellow-300 lg:font-normal lg:rounded-sm lg:bg-yellow-200 lg:text-inherit"
                              : ""
                          }
                        >
                          {w.word}{" "}
                        </span>
                      ))
                    : pageText}
                </p>
              </div>

              {/* Nav dots */}
              <div className="flex shrink-0 flex-nowrap items-center gap-1.5 overflow-x-auto border-t border-white/10 px-4 py-3 lg:border-night-100 lg:px-6 lg:py-4 [&::-webkit-scrollbar]:hidden">
                {spreads.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setNarrating(false);
                      stopAudio();
                      setIndex(i);
                    }}
                    aria-label={t("goToPage", { page: i + 1 })}
                    className={`shrink-0 rounded-full transition-all ${
                      i === index
                        ? "h-1.5 w-5 bg-white lg:h-2 lg:w-6 lg:bg-night-700"
                        : "h-1.5 w-1.5 bg-white/30 hover:bg-white/50 lg:h-2 lg:w-2 lg:bg-night-200 lg:hover:bg-night-400"
                    }`}
                  />
                ))}
              </div>
            </div>
          ) : /* No text (cover page) - portrait nav dots below image */
          !isLandscape ? (
            <div className="flex shrink-0 flex-nowrap items-center gap-1.5 overflow-x-auto px-4 py-3 lg:hidden [&::-webkit-scrollbar]:hidden">
              {spreads.map((_, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setNarrating(false);
                    stopAudio();
                    setIndex(i);
                  }}
                  aria-label={t("goToPage", { page: i + 1 })}
                  className={`h-1.5 shrink-0 rounded-full transition-all ${i === index ? "w-5 bg-white" : "w-1.5 bg-white/30 hover:bg-white/50"}`}
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
