"use client";

import { useEffect, useRef, useState } from "react";

type FileDownloadButtonProps = {
  href: string;
  label: string;
  pendingLabel: string;
  className?: string;
  shareTitle?: string;
  shareWhenAvailable?: boolean;
};

function getFilenameFromHeaders(headers: Headers, fallback: string) {
  const disposition = headers.get("Content-Disposition");
  const match = disposition?.match(/filename="([^"]+)"/i);
  if (!match?.[1]) return fallback;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

function getFallbackFilename(href: string) {
  if (href.includes("asset=luluPrintPdf")) return "storycot-lulu-interior.pdf";
  if (href.includes("asset=luluCoverPdf")) return "storycot-lulu-cover.pdf";
  if (href.includes("asset=printPdf")) return "storycot-illustrated.pdf";
  return "storycot.epub";
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export default function FileDownloadButton({
  href,
  label,
  pendingLabel,
  className,
  shareTitle,
  shareWhenAvailable = false,
}: FileDownloadButtonProps) {
  const [pending, setPending] = useState(false);
  const [prefetchReady, setPrefetchReady] = useState(!shareWhenAvailable);
  const [error, setError] = useState<string | null>(null);
  const cachedFile = useRef<{ blob: Blob; filename: string } | null>(null);

  useEffect(() => {
    if (!shareWhenAvailable) return;

    let cancelled = false;
    setPrefetchReady(false);
    setError(null);
    cachedFile.current = null;

    fetch(href, { credentials: "same-origin" })
      .then(async (res) => {
        if (!res.ok) return null;
        return {
          blob: await res.blob(),
          filename: getFilenameFromHeaders(
            res.headers,
            getFallbackFilename(href)
          ),
        };
      })
      .then((file) => {
        if (cancelled) return;
        cachedFile.current = file;
        setPrefetchReady(Boolean(file));
      })
      .catch(() => {
        if (cancelled) return;
        cachedFile.current = null;
        setPrefetchReady(false);
      });

    return () => {
      cancelled = true;
    };
  }, [href, shareWhenAvailable]);

  async function fetchFile() {
    const res = await fetch(href, { credentials: "same-origin" });
    if (!res.ok) throw new Error("Download failed");
    return {
      blob: await res.blob(),
      filename: getFilenameFromHeaders(res.headers, getFallbackFilename(href)),
    };
  }

  async function handleClick() {
    if (pending) return;
    setPending(true);
    setError(null);

    try {
      const file = cachedFile.current ?? (await fetchFile());
      cachedFile.current = file;
      setPrefetchReady(true);

      const shareFile = new File([file.blob], file.filename, {
        type: file.blob.type || "application/octet-stream",
      });

      if (
        shareWhenAvailable &&
        typeof navigator !== "undefined" &&
        navigator.canShare?.({ files: [shareFile] })
      ) {
        try {
          await navigator.share({
            title: shareTitle,
            files: [shareFile],
          });
          return;
        } catch (err) {
          if (err instanceof Error && err.name === "AbortError") return;
        }
      }

      downloadBlob(file.blob, file.filename);
    } catch {
      setError("Could not prepare the file. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="contents">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        aria-busy={pending}
        className={`${className ?? ""} inline-flex items-center justify-center gap-2 disabled:opacity-70`}
      >
        <span
          className={`h-2 w-2 rounded-full bg-current transition ${
            pending ? "animate-pulse opacity-80" : "opacity-0"
          }`}
          aria-hidden="true"
        />
        <span>
          {pending
            ? pendingLabel
            : shareWhenAvailable && !prefetchReady
              ? "Preparing..."
              : label}
        </span>
      </button>
      {error ? (
        <p className="mt-1 w-full text-xs font-medium text-blush-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
