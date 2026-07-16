"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { usePendingUI } from "@/components/GlobalPending";

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
      {deleting ? t("deleting") : t("deleteStory")}
    </button>
  );
}
