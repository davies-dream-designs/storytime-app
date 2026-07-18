"use client";

import { useState } from "react";
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

  async function handleClick() {
    setPending(true);
    try {
      const res = await fetch(href);
      if (!res.ok) return;
      const blob = await res.blob();
      const filename = toEpubFilename(title);
      const file = new File([blob], filename, { type: "application/epub+zip" });

      if (
        typeof navigator !== "undefined" &&
        navigator.canShare?.({ files: [file] })
      ) {
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
    } finally {
      setPending(false);
    }
  }

  return (
    <button onClick={handleClick} disabled={pending} className={className}>
      {pending ? pendingLabel : label}
    </button>
  );
}
