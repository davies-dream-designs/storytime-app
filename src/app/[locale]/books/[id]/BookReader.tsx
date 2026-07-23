"use client";

import { useState } from "react";
import type { BookProject, BookSpread } from "@/types/printBook";

type ReaderSpread = {
  id: string;
  sequence: number;
  title?: string;
  leftPageText: string;
  rightPageText: string;
  imageUrl?: string;
  layoutType: BookSpread["layoutType"];
};

function getReaderSpreads(project: BookProject): ReaderSpread[] {
  return project.spreads
    .filter(
      (s) =>
        s.layoutType === "text_art" ||
        s.layoutType === "hero" ||
        s.layoutType === "quiet" ||
        s.layoutType === "front_matter"
    )
    .sort((a, b) => a.sequence - b.sequence)
    .map((s) => ({
      id: s.id,
      sequence: s.sequence,
      title: s.title,
      leftPageText: s.leftPageText,
      rightPageText: s.rightPageText,
      imageUrl: s.leftPageImageUrl ?? s.imageUrl,
      layoutType: s.layoutType,
    }));
}

function isPlaceholder(url?: string): boolean {
  if (!url) return true;
  const lower = url.toLowerCase();
  return lower.startsWith("data:image/svg") || lower.endsWith(".svg");
}

export default function BookReader({
  project,
}: {
  project: BookProject;
}) {
  const spreads = getReaderSpreads(project);
  const [index, setIndex] = useState(0);
  const [expanded, setExpanded] = useState(false);

  if (spreads.length === 0) return null;

  const spread = spreads[index]!;
  const total = spreads.length;
  const hasImage = spread.imageUrl && !isPlaceholder(spread.imageUrl);
  const pageText = spread.leftPageText || spread.rightPageText;

  return (
    <div className="select-none">
      {/* Main reader card */}
      <div className="overflow-hidden rounded-3xl border border-night-100 bg-white shadow-xl">
        {/* Image panel */}
        {hasImage ? (
          <div
            className="relative w-full cursor-pointer bg-night-900"
            style={{ paddingBottom: "100%" }}
            onClick={() => setExpanded(true)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={spread.imageUrl!}
              alt={spread.title ?? `Page ${spread.sequence}`}
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-6 pb-5 pt-10">
              {spread.title ? (
                <p className="font-display text-lg font-bold leading-tight text-white drop-shadow">
                  {spread.title}
                </p>
              ) : null}
            </div>
            <div className="absolute right-3 top-3 rounded-full bg-black/30 px-2.5 py-1 text-xs font-bold text-white backdrop-blur-sm">
              {index + 1} / {total}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center bg-moon-50 px-8 py-16">
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

        {/* Text panel */}
        {pageText ? (
          <div className="border-t border-night-50 px-7 pb-8 pt-6">
            <p className="font-display text-xl font-medium leading-relaxed text-night-800">
              {pageText}
            </p>
          </div>
        ) : null}

        {/* Page indicator */}
        <div className="border-t border-night-50 px-7 py-3 text-center">
          <p className="text-xs text-night-300">
            Page {index + 1} of {total}
          </p>
        </div>
      </div>

      {/* Navigation */}
      <div className="mt-5 flex items-center justify-between">
        <button
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
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
          onClick={() => setIndex((i) => Math.min(total - 1, i + 1))}
          disabled={index === total - 1}
          className="flex items-center gap-2 rounded-full border border-night-200 px-6 py-3 font-bold text-night-600 transition hover:bg-night-50 disabled:cursor-not-allowed disabled:opacity-30"
        >
          Next →
        </button>
      </div>

      {/* Expanded lightbox */}
      {expanded && hasImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setExpanded(false)}
        >
          <div
            className="relative max-h-full max-w-2xl w-full"
            onClick={(e) => e.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={spread.imageUrl!}
              alt={spread.title ?? `Page ${spread.sequence}`}
              className="h-auto max-h-[80vh] w-full rounded-2xl object-contain shadow-2xl"
            />
            {pageText ? (
              <div className="mt-4 rounded-2xl bg-white/10 px-5 py-4 backdrop-blur-sm">
                <p className="font-display text-lg leading-relaxed text-white">
                  {pageText}
                </p>
              </div>
            ) : null}
            <button
              onClick={() => setExpanded(false)}
              className="absolute -right-2 -top-2 flex h-9 w-9 items-center justify-center rounded-full bg-white text-night-800 shadow-lg hover:bg-night-100"
              aria-label="Close"
            >
              ×
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
