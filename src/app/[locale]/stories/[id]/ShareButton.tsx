"use client";

import { useState } from "react";
import { useLocale } from "next-intl";
import { useTranslations } from "next-intl";
import { buildSharedStoryUrl } from "@/lib/shareLinks";

function ShareIcon({ name }: { name: "link" | "share" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4 shrink-0"
      aria-hidden="true"
    >
      {name === "share" ? (
        <path d="M4 12v7a1 1 0 001 1h14a1 1 0 001-1v-7 M16 6l-4-4-4 4 M12 2v14" />
      ) : (
        <path d="M10 13a5 5 0 007.1 0l2-2a5 5 0 00-7.1-7.1l-1.1 1.1 M14 11a5 5 0 00-7.1 0l-2 2A5 5 0 0012 20.1l1.1-1.1" />
      )}
    </svg>
  );
}

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
    <>
      <button
        type="button"
        onClick={handleShare}
        disabled={state === "loading"}
        className="storycot-btn storycot-btn-secondary storycot-btn-compact"
      >
        <ShareIcon name="share" />
        {state === "copied"
          ? t("shareLinkCopied")
          : state === "loading"
            ? "…"
            : "Share"}
      </button>
      <button
        type="button"
        onClick={() => void copyShareLink()}
        disabled={state === "loading"}
        className="storycot-btn storycot-btn-secondary storycot-btn-compact"
      >
        <ShareIcon name="link" />
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
    </>
  );
}
