"use client";

import { useState } from "react";
import { useLocale } from "next-intl";
import { useTranslations } from "next-intl";
import Button from "@/components/ui/Button";
import { buildFacebookShareUrl, buildSharedStoryUrl } from "@/lib/shareLinks";

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

  async function shareToFacebook() {
    await withShareUrl((url) => {
      window.open(
        buildFacebookShareUrl(url),
        "_blank",
        "noopener,noreferrer,width=680,height=560"
      );
      setState("idle");
    }).catch(() => {
      // Keep sharing non-blocking; the user can still copy the link.
      setState("idle");
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
    <div className="flex flex-wrap items-center gap-2">
      <Button
        onClick={handleShare}
        disabled={state === "loading"}
        variant="secondary"
      >
        {state === "copied"
          ? t("shareLinkCopied")
          : state === "loading"
            ? "…"
            : t("shareIdle")}
      </Button>
      <Button
        onClick={shareToFacebook}
        disabled={state === "loading"}
        variant="secondary"
        aria-label={t("shareFacebook")}
      >
        {t("shareFacebook")}
      </Button>
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
