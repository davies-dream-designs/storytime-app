"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import Button from "@/components/ui/Button";

export default function CreatePrintBookButton({
  storyId,
  credits,
  pageCount,
  illustrationCount,
  userCredits,
  isAdmin,
  storyPreset,
}: {
  storyId: string;
  credits: number;
  pageCount: number;
  illustrationCount: number;
  userCredits: number;
  isAdmin: boolean;
  storyPreset?: string;
}) {
  const t = useTranslations("books");
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasEnoughCredits = isAdmin || userCredits >= credits;

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

  const estimateBodyText =
    storyPreset === "tiny-tales"
      ? t("estimateBodyTinyTales", {
          credits,
          pages: pageCount,
          illustrations: illustrationCount,
        })
      : storyPreset === "moonlit-adventures"
        ? t("estimateBodyMoonlitAdventures", {
            credits,
            pages: pageCount,
            illustrations: illustrationCount,
          })
        : storyPreset === "epic-sagas"
          ? t("estimateBodyEpicSagas", {
              credits,
              pages: pageCount,
              illustrations: illustrationCount,
            })
          : t("estimateBody", {
              credits,
              pages: pageCount,
              illustrations: illustrationCount,
            });

  const estimateBox = (
    <div className="mb-3 max-w-md rounded-2xl border border-star-200 bg-star-50 px-4 py-3 text-sm text-night-600">
      <p className="font-bold text-night-800">{t("estimateTitle")}</p>
      <p className="mt-1">{estimateBodyText}</p>
    </div>
  );

  if (!hasEnoughCredits) {
    return (
      <div className="basis-full sm:basis-auto">
        {estimateBox}
        <div className="mb-3 max-w-md rounded-2xl border border-blush-200 bg-blush-100 px-4 py-3 text-sm">
          <p className="font-bold text-blush-700">Not enough credits</p>
          <p className="mt-1 text-blush-600">
            You have {userCredits} credit{userCredits === 1 ? "" : "s"} — this
            book costs {credits}. Top up to unlock illustrations.
          </p>
        </div>
        <Link href="/account" className="storycot-btn storycot-btn-primary">
          Top up credits →
        </Link>
      </div>
    );
  }

  return (
    <div className={error ? "basis-full sm:basis-auto" : ""}>
      {estimateBox}
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
          {/insufficient credits/i.test(error) ? (
            <Link
              href="/account"
              className="storycot-btn storycot-btn-primary mt-3 inline-block text-sm"
            >
              Top up credits →
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
