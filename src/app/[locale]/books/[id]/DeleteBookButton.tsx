"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { usePendingUI } from "@/components/GlobalPending";

export default function DeleteBookButton({
  bookId,
  storyId,
}: {
  bookId: string;
  storyId: string;
}) {
  const router = useRouter();
  const t = useTranslations("books");
  const { startPending } = usePendingUI();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!confirm(t("deleteConfirm"))) return;

    setDeleting(true);
    const stopPending = startPending(t("deleting"), 12000);
    try {
      const res = await fetch(`/api/books/${bookId}`, { method: "DELETE" });
      if (!res.ok) throw new Error(t("deleteError"));
      router.push(`/stories/${storyId}` as string);
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
      className="rounded-full border border-blush-300 px-4 py-2 text-sm font-bold text-blush-500 transition hover:bg-blush-50 disabled:opacity-60"
    >
      {deleting ? t("deleting") : t("deleteBook")}
    </button>
  );
}
