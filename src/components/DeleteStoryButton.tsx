"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { usePendingUI } from "@/components/GlobalPending";

function TrashIcon() {
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
      <path d="M3 6h18 M8 6V4h8v2 M6 6l1 15h10l1-15 M10 11v6 M14 11v6" />
    </svg>
  );
}

export default function DeleteStoryButton({
  storyId,
  redirectTo,
  compact = false,
}: {
  storyId: string;
  redirectTo?: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const t = useTranslations("stories");
  const { startPending } = usePendingUI();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!confirm(t("deleteConfirm"))) return;

    setDeleting(true);
    const stopPending = startPending(t("deleting"), 12000);
    try {
      const res = await fetch(`/api/stories/${storyId}`, { method: "DELETE" });
      if (!res.ok) throw new Error(t("deleteError"));
      if (redirectTo) router.push(redirectTo as never);
      router.refresh();
    } catch {
      stopPending();
      setDeleting(false);
      alert(t("deleteError"));
    }
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={deleting}
      className={`storycot-btn storycot-btn-danger ${compact ? "storycot-btn-compact" : ""}`}
    >
      <TrashIcon />
      {deleting ? t("deleting") : t("deleteStory")}
    </button>
  );
}
