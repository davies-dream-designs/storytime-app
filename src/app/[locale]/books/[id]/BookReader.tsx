"use client";

import { useCallback, useEffect, useState } from "react";
import type { BookProject, BookSpread } from "@/types/printBook";

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


export default function BookReader({ project }: { project: BookProject }) {
  const spreads = getReaderSpreads(project);
  const [index, setIndex] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);

  const total = spreads.length;
  const spread = spreads[index];

  const prev = useCallback(
    () => setIndex((i) => Math.max(0, i - 1)),
    []
  );
  const next = useCallback(
    () => setIndex((i) => Math.min(total - 1, i + 1)),
    [total]
  );

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

  if (!spread || total === 0) return null;

  const hasImage = spread.imageUrl && !isPlaceholder(spread.imageUrl);
  const pageText = spread.leftPageText || spread.rightPageText;

  return (
    <div className="select-none">
      {/* Main reader card */}
      <div className="overflow-hidden rounded-3xl border border-night-100 bg-white shadow-xl">
        {/* Image panel — aspect-square avoids padding-bottom hack and any positioning conflicts */}
        {hasImage ? (
          <div className="relative aspect-square w-full overflow-hidden max-h-[70vh]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={spread.imageUrl!}
              alt={spread.title ?? `Page ${index + 1}`}
              className="pointer-events-none h-full w-full object-cover select-none"
              draggable={false}
              style={{ userSelect: "none", WebkitUserDrag: "none" } as React.CSSProperties}
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
          <div className="flex items-center justify-center bg-moon-50 px-8 py-16">
            <div className="text-center">
              <span className="text-5xl" aria-hidden="true">🎨</span>
              <p className="mt-3 text-sm font-medium text-night-400">
                Illustration coming soon
              </p>
            </div>
          </div>
        )}

        {/* Story text */}
        {pageText ? (
          <div className="border-t border-night-50 px-7 pb-8 pt-6">
            <p className="font-display text-xl font-medium leading-relaxed text-night-800">
              {pageText}
            </p>
          </div>
        ) : null}

        {/* Page indicator */}
        <div className="border-t border-night-50 px-7 py-3 text-center">
          <p className="text-xs text-night-300">Page {index + 1} of {total}</p>
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
              onClick={() => setIndex(i)}
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
            <button
              onClick={() => setFullscreen(false)}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
              aria-label="Close"
            >
              ✕
            </button>
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
                  style={{ userSelect: "none", WebkitUserDrag: "none" } as React.CSSProperties}
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
          </div>

          {/* Story text */}
          {pageText ? (
            <div
              className="max-h-[20vh] overflow-y-auto border-t border-white/10 bg-black/80 px-5 py-4 backdrop-blur-sm"
              onContextMenu={(e) => e.preventDefault()}
            >
              <p className="font-display text-base leading-relaxed text-white/90">
                {pageText}
              </p>
            </div>
          ) : null}

          {/* Bottom nav dots — horizontal scroll so they don't wrap in landscape */}
          <div className="flex flex-nowrap items-center gap-1.5 overflow-x-auto px-4 py-3 [&::-webkit-scrollbar]:hidden">
            {spreads.map((_, i) => (
              <button
                key={i}
                onClick={() => setIndex(i)}
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
