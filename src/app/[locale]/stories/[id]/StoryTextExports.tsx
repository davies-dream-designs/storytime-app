"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import DownloadLink from "@/components/DownloadLink";
import FileDownloadButton from "@/components/FileDownloadButton";

export default function StoryTextExports({
  storyId,
  storyTitle,
}: {
  storyId: string;
  storyTitle: string;
}) {
  const t = useTranslations("stories");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="storycot-btn storycot-btn-secondary text-sm flex items-center gap-1.5"
      >
        {t("exportText")}
        <svg
          viewBox="0 0 12 12"
          fill="currentColor"
          className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        >
          <path d="M6 8L1 3h10L6 8z" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-20 mt-1.5 min-w-[160px] overflow-hidden rounded-2xl border border-night-100 bg-white py-1 shadow-xl">
          <DownloadLink
            href={`/stories/${storyId}/print`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-night-700 hover:bg-night-50"
            pendingLabel={t("downloadStarting")}
            onClick={() => setOpen(false)}
          >
            {t("printButton")}
          </DownloadLink>
          <FileDownloadButton
            href={`/api/stories/${storyId}/epub`}
            shareTitle={storyTitle}
            label={t("textEpubButton")}
            pendingLabel={t("downloadStarting")}
            className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-night-700 hover:bg-night-50 text-left"
            shareWhenAvailable
          />
        </div>
      )}
    </div>
  );
}
