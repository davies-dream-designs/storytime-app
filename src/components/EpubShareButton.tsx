"use client";

import { useState, useEffect, useRef } from "react";
import { toEpubFilename } from "@/lib/print-books/filename";

export default function EpubShareButton({
  href,
  title,
  label,
  pendingLabel,
  className,
}: {
  href: string;
  title: string;
  label: string;
  pendingLabel: string;
  className?: string;
}) {
  const [pending, setPending] = useState(false);
  const [blobReady, setBlobReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Pre-fetch the blob so it's ready before the user taps.
  // iOS Safari loses the user-gesture context after any await, which silently
  // kills navigator.share. Caching the blob here means handleClick can call
  // navigator.share with no async ops in between.
  const cachedBlob = useRef<Blob | null>(null);

  useEffect(() => {
    let cancelled = false;
    setBlobReady(false);
    fetch(href)
      .then((res) => (res.ok ? res.blob() : null))
      .then((blob) => {
        if (!cancelled) {
          cachedBlob.current = blob;
          setBlobReady(blob !== null);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [href]);

  function handleClick() {
    if (pending) return;
    setPending(true);
    setError(null);

    const filename = toEpubFilename(title);

    const run = async () => {
      const blob = cachedBlob.current;
      if (!blob) {
        // Blob not ready — fall back to a direct navigation download.
        // Programmatic .click() after any await is blocked on iOS Safari, so
        // window.location.href is the only safe fallback in this path.
        window.location.href = href;
        return;
      }

      const file = new File([blob], filename, { type: "application/epub+zip" });

      // Synchronous check — no await between click and share call
      if (typeof navigator !== "undefined" && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file] });
      } else {
        // Share not supported — download via object URL.
        // This path is synchronous (no await before it) so iOS doesn't block it.
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    };

    run()
      .catch((err) => {
        if (err instanceof Error && err.name === "AbortError") return; // user cancelled share
        setError("Couldn't prepare the EPUB — try again.");
      })
      .finally(() => setPending(false));
  }

  return (
    <div className="contents">
      <button onClick={handleClick} disabled={pending || !blobReady} className={className}>
        {pending ? pendingLabel : !blobReady ? "Loading…" : label}
      </button>
      {error ? (
        <p className="mt-1 w-full text-xs text-red-600">{error}</p>
      ) : null}
    </div>
  );
}
