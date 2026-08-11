"use client";

import Image from "next/image";
import { useAuth } from "@clerk/nextjs";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

export default function AuthReadyBoundary({
  children,
}: {
  children: ReactNode;
}) {
  const { isLoaded } = useAuth();
  const t = useTranslations("common");

  if (!isLoaded) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-parchment px-5 text-ink">
        <div
          role="status"
          aria-live="polite"
          className="storycot-loader flex max-w-xs flex-col items-center text-center"
        >
          <Image
            src="/icon-dark.svg"
            alt=""
            width={88}
            height={88}
            className="rounded-2xl shadow-xl shadow-night-900/15"
            priority
          />
          <span className="mt-5 font-display text-2xl font-bold text-night-800">
            Storycot
          </span>
          <span className="mt-2 text-base font-bold text-lavender-700">
            {t("loading")}
          </span>
          <span
            aria-hidden="true"
            className="mt-5 h-8 w-8 rounded-full border-4 border-lavender-200 border-t-night-700 motion-safe:animate-spin"
          />
        </div>
      </main>
    );
  }

  return <>{children}</>;
}
