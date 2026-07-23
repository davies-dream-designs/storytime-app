"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import FileDownloadButton from "@/components/FileDownloadButton";

export default function DigitalDownloadSection({
  projectId,
  hasDigitalDownload,
  hasPrintPdf,
  hasEpub,
  hasIllustrationsZip,
  storyTitle,
}: {
  projectId: string;
  hasDigitalDownload: boolean;
  hasPrintPdf: boolean;
  hasEpub: boolean;
  hasIllustrationsZip: boolean;
  storyTitle: string;
}) {
  const t = useTranslations("books");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function startCheckout() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "digital_download", projectId }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      window.location.href = data.url;
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (hasDigitalDownload) {
    return (
      <div className="rounded-2xl border border-green-200 bg-green-50 p-5">
        <p className="text-xs font-bold uppercase tracking-wide text-green-700">
          Digital download — unlocked
        </p>
        <p className="mt-1 font-display text-xl font-bold text-night-800">
          {storyTitle}
        </p>
        <p className="mt-1 text-sm text-night-500">
          Your illustrated book files are ready to download.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          {hasPrintPdf ? (
            <FileDownloadButton
              href={`/api/books/${projectId}/download?asset=printPdf`}
              className="storycot-btn storycot-btn-primary"
              label={t("illustratedPdfButton")}
              pendingLabel={t("downloadStarting")}
            />
          ) : null}
          {hasEpub ? (
            <FileDownloadButton
              href={`/api/books/${projectId}/download?asset=epub`}
              shareTitle={storyTitle}
              label={t("epubButton")}
              pendingLabel={t("downloadStarting")}
              className="storycot-btn storycot-btn-secondary"
              shareWhenAvailable
            />
          ) : null}
          {hasIllustrationsZip ? (
            <FileDownloadButton
              href={`/api/books/${projectId}/download?asset=illustrationsZip`}
              label="Illustrations (ZIP)"
              pendingLabel={t("downloadStarting")}
              className="storycot-btn storycot-btn-secondary"
            />
          ) : null}
        </div>
        {hasEpub ? (
          <p className="mt-3 text-sm leading-6 text-night-500">{t("epubHelp")}</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-night-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-wide text-star-600">
        Digital download
      </p>
      <div className="mt-1 flex items-baseline gap-3">
        <p className="font-display text-2xl font-bold text-night-800">$9.95</p>
        <p className="text-sm text-night-400">AUD · one-time</p>
      </div>
      <p className="mt-2 text-sm leading-6 text-night-500">
        Download your illustrated book as a high-quality PDF and EPUB — read on
        any device, keep forever.
      </p>
      <ul className="mt-3 space-y-1.5 text-sm text-night-600">
        <li className="flex items-center gap-2">
          <span className="text-green-500" aria-hidden="true">✓</span>
          Illustrated PDF — full colour, print-ready
        </li>
        <li className="flex items-center gap-2">
          <span className="text-green-500" aria-hidden="true">✓</span>
          EPUB — for Kindle, Apple Books, or any e-reader
        </li>
        <li className="flex items-center gap-2">
          <span className="text-green-500" aria-hidden="true">✓</span>
          Illustrations ZIP — all artwork to print or share
        </li>
        <li className="flex items-center gap-2">
          <span className="text-green-500" aria-hidden="true">✓</span>
          Yours forever — no subscription needed
        </li>
      </ul>
      {error ? (
        <p className="mt-3 text-sm font-bold text-blush-600">{error}</p>
      ) : null}
      <button
        onClick={startCheckout}
        disabled={loading}
        className="storycot-btn storycot-btn-primary mt-4 w-full justify-center disabled:opacity-60"
      >
        {loading ? "Opening checkout…" : "Unlock digital download — $9.95"}
      </button>
      <p className="mt-2 text-center text-xs text-night-400">
        Secure payment via Stripe · AUD pricing · Australian customers
      </p>
    </div>
  );
}
