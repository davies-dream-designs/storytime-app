"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import Button from "@/components/ui/Button";

export default function CreatePrintBookButton({
  storyId,
}: {
  storyId: string;
}) {
  const t = useTranslations("books");
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function getErrorMessage(
    res: Response,
    fallback: string
  ): Promise<string> {
    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const data = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      return data?.error ?? fallback;
    }

    const text = await res.text().catch(() => "");
    if (text.includes("<")) return fallback;
    return text || fallback;
  }

  async function handleCreate() {
    setLoading(true);
    setError(null);

    try {
      const createRes = await fetch("/api/books", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceStoryId: storyId }),
      });

      if (!createRes.ok) {
        throw new Error(await getErrorMessage(createRes, t("createError")));
      }

      const project = (await createRes.json()) as { id: string };
      router.push(`/books/${project.id}` as string);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("createError"));
      setLoading(false);
    }
  }

  return (
    <div className={error ? "basis-full sm:basis-auto" : ""}>
      <Button
        variant="secondary"
        size="compact"
        onClick={handleCreate}
        disabled={loading}
        className={`border-star-200 bg-star-50 text-star-700 hover:bg-star-100 ${
          error ? "w-full sm:w-auto" : ""
        }`}
      >
        {loading ? t("creatingButton") : t("createButton")}
      </Button>
      {error ? (
        <div className="mt-3 max-w-md rounded-2xl border border-blush-200 bg-blush-100 px-4 py-3 text-sm text-blush-700 sm:max-w-sm">
          <p className="font-bold">{t("createErrorTitle")}</p>
          <p className="mt-1">{error}</p>
        </div>
      ) : null}
    </div>
  );
}
