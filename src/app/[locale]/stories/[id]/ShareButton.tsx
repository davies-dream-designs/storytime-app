"use client";

import { useState } from "react";
import { useLocale } from "next-intl";
import { useTranslations } from "next-intl";
import { buildSharedStoryUrl } from "@/lib/shareLinks";

export default function ShareButton({ storyId }: { storyId: string }) {
  const [state, setState] = useState<"idle" | "loading" | "copied">("idle");
  const t = useTranslations("stories");
  const locale = useLocale();

  async function getShareUrl() {
    const res = await fetch(`/api/stories/${storyId}/share`, {
      method: "POST",
    });
    if (!res.ok) throw new Error("Could not create share link");

    const { token } = (await res.json()) as { token: string };
    return buildSharedStoryUrl({
      origin: window.location.origin,
      locale,
      token,
    });
  }

  async function withShareUrl(action: (url: string) => Promise<void> | void) {
    if (state === "loading") return;
    setState("loading");
    await action(await getShareUrl());
  }

  async function copyShareLink() {
    await withShareUrl(async (url) => {
      await navigator.clipboard.writeText(url);
      setState("copied");
      setTimeout(() => setState("idle"), 2500);
    });
  }

  async function handleShare() {
    if (navigator.share) {
      await withShareUrl(async (url) => {
        await navigator.share({
          title: document.title,
          url,
        });
        setState("idle");
      }).catch(() => {
        setState("idle");
      });
      return;
    }

    await copyShareLink();
  }

  return (
    <div className="inline-flex overflow-hidden rounded-full border border-night-100 bg-white shadow-sm">
      <button
        type="button"
        onClick={handleShare}
        disabled={state === "loading"}
        className="px-4 py-2 text-sm font-bold text-night-700 transition hover:bg-night-50 disabled:opacity-50"
      >
        {state === "copied"
          ? t("shareLinkCopied")
          : state === "loading"
            ? "…"
            : t("shareIdle")}
      </button>
      <button
        type="button"
        onClick={() => void copyShareLink()}
        disabled={state === "loading"}
        className="border-l border-night-100 px-4 py-2 text-sm font-bold text-night-500 transition hover:bg-night-50 disabled:opacity-50"
      >
        Copy link
      </button>
      <span
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {state === "copied" ? t("shareLinkCopied") : ""}
      </span>
    </div>
  );
}
