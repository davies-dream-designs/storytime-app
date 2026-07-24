"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import Button from "@/components/ui/Button";

export default function ShareButton({ storyId }: { storyId: string }) {
  const [state, setState] = useState<"idle" | "loading" | "copied">("idle");
  const t = useTranslations("stories");

  async function handleShare() {
    setState("loading");
    try {
      const res = await fetch(`/api/stories/${storyId}/share`, {
        method: "POST",
      });
      const { token } = await res.json();
      const url = `${window.location.origin}/s/${token}`;
      await navigator.clipboard.writeText(url);
      setState("copied");
      setTimeout(() => setState("idle"), 2500);
    } catch {
      setState("idle");
    }
  }

  return (
    <>
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
      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {state === "copied" ? t("shareLinkCopied") : ""}
      </span>
    </>
  );
}
