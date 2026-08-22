"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { usePendingUI } from "@/components/GlobalPending";
import { useConfirmDialog } from "@/components/ui/useConfirmDialog";

export default function DeleteBookButton({
  bookId,
  redirectTo,
  compact = false,
}: {
  bookId: string;
  redirectTo?: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const t = useTranslations("books");
  const { startPending } = usePendingUI();
  const [deleting, setDeleting] = useState(false);
  const { confirm, alert, ConfirmDialog } = useConfirmDialog();

  async function handleDelete() {
    const confirmed = await confirm({
      title: t("deleteBook"),
      message: t("deleteConfirm"),
      confirmLabel: t("deleteBook"),
      variant: "danger",
    });
    if (!confirmed) return;

    setDeleting(true);
    const stopPending = startPending(t("deleting"), 12000);
    try {
      const res = await fetch(`/api/books/${bookId}`, { method: "DELETE" });
      if (!res.ok) throw new Error(t("deleteError"));
      if (redirectTo) router.push(redirectTo as never);
      router.refresh();
    } catch {
      stopPending();
      setDeleting(false);
      await alert({
        title: t("deleteError"),
        message: t("deleteError"),
        variant: "danger",
      });
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleDelete}
        disabled={deleting}
        className={`storycot-btn storycot-btn-danger ${compact ? "storycot-btn-compact" : ""}`}
      >
        {deleting ? t("deleting") : t("deleteBook")}
      </button>
      <ConfirmDialog />
    </>
  );
}
