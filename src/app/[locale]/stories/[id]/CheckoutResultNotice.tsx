"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

export default function CheckoutResultNotice({
  tone,
  title,
  body,
}: {
  tone: "success" | "warning";
  title: string;
  body: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const classes =
    tone === "success"
      ? "border-green-200 bg-green-50 text-green-900"
      : "border-star-200 bg-star-50 text-night-700";

  function dismiss() {
    const next = new URLSearchParams(searchParams.toString());
    next.delete("download_success");
    next.delete("download_canceled");
    next.delete("print_success");
    next.delete("print_canceled");
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  }

  return (
    <div className={`mb-8 rounded-3xl border p-6 shadow-sm ${classes}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-display text-2xl font-bold">{title}</p>
          <p className="mt-2 leading-7">{body}</p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/75 text-lg font-bold text-night-500 shadow-sm transition hover:bg-white"
          aria-label="Dismiss message"
        >
          X
        </button>
      </div>
    </div>
  );
}
