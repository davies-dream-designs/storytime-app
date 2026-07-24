"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BookProject, BookSpread } from "@/types/printBook";
import { DEFAULT_NARRATION_VOICE_ID, type WordTiming } from "@/lib/elevenlabs";

type ReaderSpread = {
  id: string;
  sequence: number;
  title?: string;
  leftPageText: string;
  rightPageText: string;
  imageUrl?: string;
};

function isPlaceholder(url?: string): boolean {
  if (!url) return true;
  const lower = url.toLowerCase();
  return lower.startsWith("data:image/svg") || lower.endsWith(".svg");
}

function getReaderSpreads(project: BookProject): ReaderSpread[] {
  const story: ReaderSpread[] = project.spreads
    .filter(
      (s: BookSpread) =>
        s.layoutType === "text_art" ||
        s.layoutType === "hero" ||
        s.layoutType === "quiet"
    )
    .sort((a, b) => a.sequence - b.sequence)
    .map((s) => ({
      id: s.id,
      sequence: s.sequence,
      title: s.title,
      leftPageText: s.leftPageText,
      rightPageText: s.rightPageText,
      imageUrl: s.leftPageImageUrl ?? s.imageUrl,
    }));

  // Prepend cover as first page if available
  const coverUrl = project.assets.coverImageUrl;
  if (coverUrl && !isPlaceholder(coverUrl)) {
    story.unshift({
      id: "cover",
      sequence: 0,
      title: undefined,
      leftPageText: "",
      rightPageText: "",
      imageUrl: coverUrl,
    });
  }

  return story;
}

export default function BookReader({ project, isAdmin = false }: { project: BookProject; isAdmin?: boolean }) {
  const spreads = useMemo(() => getReaderSpreads(project), [project]);
  const [index, setIndex] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);

  // Narration
  const [narrating, setNarrating] = useState(false);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const [words, setWords] = useState<WordTiming[]>([]);
  const [currentWordIndex, setCurrentWordIndex] = useState(-1);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const wordsRef = useRef<WordTiming[]>([]);

  const total = spreads.length;
  const spread = spreads[index];

  function stopAudio() {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
  }

  const prev = useCallback(() => {
    setNarrating(false);
    stopAudio();
    setIndex((i) => Math.max(0, i - 1));
  }, []);

  const next = useCallback(() => {
    setNarrating(false);
    stopAudio();
    setIndex((i) => Math.min(total - 1, i + 1));
  }, [total]);

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

  // Narration engine — runs whenever narrating, index, or voice changes
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
    setIsLoadingAudio(true);

    const run = async () => {
      try {
        const url = `/api/books/${project.id}/narrate?spreadId=${encodeURIComponent(currentSpread.id)}&voiceId=${encodeURIComponent(DEFAULT_NARRATION_VOICE_ID)}`;
        const res = await fetch(url);
        if (!res.ok || cancelled) {
          if (!cancelled) setNarrating(false);
          return;
        }

        const { audioUrl, words: pageWords } = (await res.json()) as {
          audioUrl: string;
          words: WordTiming[];
        };
        if (cancelled) return;

        wordsRef.current = pageWords ?? [];
        setWords(pageWords ?? []);

        const audio = new Audio(audioUrl);
        audioRef.current = audio;

        audio.addEventListener("timeupdate", () => {
          const t = audio.currentTime;
          const ws = wordsRef.current;
          const idx = ws.findIndex((w) => t >= w.start && t < w.end);
          setCurrentWordIndex(idx);
        });

        audio.addEventListener("ended", () => {
          audioRef.current = null;
          if (cancelled) return;
          setCurrentWordIndex(-1);
          setIndex((i) => {
            if (i < spreads.length - 1) return i + 1;
            setNarrating(false);
            return i;
          });
        });

        await audio.play();
      } catch {
        if (!cancelled) setNarrating(false);
      } finally {
        if (!cancelled) setIsLoadingAudio(false);
      }
    };

    void run();

    return () => {
      cancelled = true;
      stopAudio();
      setIsLoadingAudio(false);
      wordsRef.current = [];
      setWords([]);
      setCurrentWordIndex(-1);
    };
  }, [narrating, index, spreads, project.id]);

  if (!spread || total === 0) return null;

  const hasImage = spread.imageUrl && !isPlaceholder(spread.imageUrl);
  const pageText = [spread.leftPageText, spread.rightPageText].filter(Boolean).join(" ").trim();
  const hasPurchased = isAdmin || Boolean(project.assets.digitalDownloadUnlockedAt);
  const canNarrate = hasPurchased && spreads.some((s) => s.leftPageText || s.rightPageText);
  const showNarrationUpsell = !hasPurchased && spreads.some((s) => s.leftPageText || s.rightPageText);

  return (
    <div className="select-none">
      {/* Main reader card */}
      <div className="overflow-hidden rounded-3xl border border-night-100 bg-white shadow-xl lg:flex lg:min-h-[480px]">
        {/* Image panel */}
        {hasImage ? (
          <div className="relative aspect-square w-full overflow-hidden max-h-[55vh] lg:aspect-auto lg:max-h-none lg:w-[55%] lg:shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={spread.imageUrl!}
              alt={spread.title ?? `Page ${index + 1}`}
              className="pointer-events-none h-full w-full object-cover select-none"
              draggable={false}
              style={
                { userSelect: "none", WebkitUserDrag: "none" } as React.CSSProperties
              }
              onContextMenu={(e) => e.preventDefault()}
            />
            {/* Transparent overlay — blocks right-click/long-press, captures expand tap */}
            <div
              className="absolute inset-0 cursor-pointer"
              onClick={() => setFullscreen(true)}
              onContextMenu={(e) => e.preventDefault()}
              role="button"
              tabIndex={0}
              aria-label="View full screen"
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
              Tap to expand
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center bg-moon-50 px-8 py-16 lg:w-[55%] lg:shrink-0">
            <div className="text-center">
              <span className="text-5xl" aria-hidden="true">
                🎨
              </span>
              <p className="mt-3 text-sm font-medium text-night-400">
                Illustration coming soon
              </p>
            </div>
          </div>
        )}

        {/* Text + indicator (right side on desktop) */}
        <div className="flex flex-col lg:flex-1">
          {/* Story text */}
          {pageText ? (
            <div className="flex-1 border-t border-night-50 px-7 pb-8 pt-6 lg:border-t-0 lg:border-l lg:flex lg:items-center">
              <p className="font-display text-xl font-medium leading-relaxed text-night-800">
                {words.length > 0
                  ? words.map((w, i) => (
                      <span
                        key={i}
                        className={
                          i === currentWordIndex
                            ? "rounded-sm bg-yellow-200 transition-colors"
                            : "transition-colors"
                        }
                      >
                        {w.word}{" "}
                      </span>
                    ))
                  : pageText}
              </p>
            </div>
          ) : (
            <div className="flex-1" />
          )}

          {/* Page indicator */}
          <div className="border-t border-night-50 px-7 py-3 text-center">
            <p className="text-xs text-night-300">
              Page {index + 1} of {total}
            </p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="mt-5 flex items-center justify-between">
        <button
          onClick={prev}
          disabled={index === 0}
          className="flex items-center gap-2 rounded-full border border-night-200 px-6 py-3 font-bold text-night-600 transition hover:bg-night-50 disabled:cursor-not-allowed disabled:opacity-30"
        >
          ← Previous
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
              aria-label={`Go to page ${i + 1}`}
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
          Next →
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
              aria-label={narrating ? "Pause narration" : "Listen to story"}
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
                    ? "Loading…"
                    : "Reading aloud — auto-advances each page"
                  : "Listen to the story read aloud"}
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
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5 translate-x-0.5">
              <path d="M6.3 2.841A1.5 1.5 0 004 4.11v11.78a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-night-800">Hear your story read aloud</p>
            <p className="text-xs text-night-400">Included with Digital Download · $9.99</p>
          </div>
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0 text-night-300">
            <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
          </svg>
        </a>
      ) : null}

      {/* Fullscreen reader overlay */}
      {fullscreen ? (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-black"
          style={{ WebkitTouchCallout: "none" } as React.CSSProperties}
        >
          {/* Top bar */}
          <div className="flex items-center justify-between px-4 py-3">
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
                  aria-label={narrating ? "Pause narration" : "Listen"}
                >
                  {isLoadingAudio ? (
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  ) : narrating ? (
                    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                      <rect x="4" y="3" width="4" height="14" rx="1" />
                      <rect x="12" y="3" width="4" height="14" rx="1" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 translate-x-0.5">
                      <path d="M6.3 2.841A1.5 1.5 0 004 4.11v11.78a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                    </svg>
                  )}
                </button>
              ) : null}
              <button
                onClick={() => setFullscreen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Image */}
          <div className="relative min-h-0 flex-1">
            {hasImage ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={spread.imageUrl!}
                  alt={spread.title ?? `Page ${index + 1}`}
                  className="pointer-events-none h-full w-full object-contain select-none"
                  draggable={false}
                  style={
                    {
                      userSelect: "none",
                      WebkitUserDrag: "none",
                    } as React.CSSProperties
                  }
                  onContextMenu={(e) => e.preventDefault()}
                />
              </>
            ) : (
              <div className="flex h-full items-center justify-center">
                <p className="text-white/40">No illustration for this page</p>
              </div>
            )}

            {/* Prev / next tap zones */}
            <button
              onClick={prev}
              disabled={index === 0}
              className="absolute inset-y-0 left-0 w-1/3 opacity-0"
              aria-label="Previous page"
            />
            <button
              onClick={next}
              disabled={index === total - 1}
              className="absolute inset-y-0 right-0 w-1/3 opacity-0"
              aria-label="Next page"
            />

            {/* Visible arrow hints */}
            {index > 0 ? (
              <button
                onClick={prev}
                className="absolute left-3 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm hover:bg-black/60"
                aria-label="Previous page"
              >
                ‹
              </button>
            ) : null}
            {index < total - 1 ? (
              <button
                onClick={next}
                className="absolute right-3 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm hover:bg-black/60"
                aria-label="Next page"
              >
                ›
              </button>
            ) : null}

            {/* Story text overlay */}
            {pageText ? (
              <div
                className="absolute inset-x-0 bottom-0 max-h-[45%] overflow-y-auto bg-gradient-to-t from-black/85 via-black/60 to-transparent px-5 pb-4 pt-10"
                onContextMenu={(e) => e.preventDefault()}
              >
                <p className="font-display text-sm leading-relaxed text-white/95 drop-shadow">
                  {words.length > 0
                    ? words.map((w, i) => (
                        <span
                          key={i}
                          className={
                            i === currentWordIndex
                              ? "font-bold text-yellow-300 transition-colors"
                              : "transition-colors"
                          }
                        >
                          {w.word}{" "}
                        </span>
                      ))
                    : pageText}
                </p>
              </div>
            ) : null}
          </div>

          {/* Bottom nav dots */}
          <div className="flex flex-nowrap items-center gap-1.5 overflow-x-auto px-4 py-3 [&::-webkit-scrollbar]:hidden">
            {spreads.map((_, i) => (
              <button
                key={i}
                onClick={() => {
                  setNarrating(false);
                  stopAudio();
                  setIndex(i);
                }}
                aria-label={`Go to page ${i + 1}`}
                className={`h-1.5 shrink-0 rounded-full transition-all ${
                  i === index
                    ? "w-5 bg-white"
                    : "w-1.5 bg-white/30 hover:bg-white/50"
                }`}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
