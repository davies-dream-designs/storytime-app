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
  const [error, setError] = useState<string | null>(null);
  // Pre-fetch the blob so it's ready before the user taps.
  // iOS Safari loses the user-gesture context after any await, which silently
  // kills navigator.share. Caching the blob here means handleClick can call
  // navigator.share with no async ops in between.
  const cachedBlob = useRef<Blob | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(href)
      .then((res) => (res.ok ? res.blob() : null))
      .then((blob) => {
        if (!cancelled) cachedBlob.current = blob;
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
      let blob = cachedBlob.current;

      if (!blob) {
        // Pre-fetch didn't finish yet — fall back to async fetch.
        // navigator.share won't work on iOS in this path, so we'll download.
        const res = await fetch(href);
        if (!res.ok) throw new Error("Could not load the EPUB file.");
        blob = await res.blob();

        // Async path: download only (can't share on iOS without pre-cached blob)
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        return;
      }

      const file = new File([blob], filename, { type: "application/epub+zip" });

      // Synchronous check — no await between click and share call
      if (typeof navigator !== "undefined" && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file] });
      } else {
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
      <button onClick={handleClick} disabled={pending} className={className}>
        {pending ? pendingLabel : label}
      </button>
      {error ? (
        <p className="mt-1 w-full text-xs text-red-600">{error}</p>
      ) : null}
    </div>
  );
}
