"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import Nav from "@/components/Nav";
import ErrorState from "@/components/ErrorState";

export default function LocaleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("errors");

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <>
      <Nav />
      <ErrorState
        eyebrow={t("errorEyebrow")}
        title={t("errorTitle")}
        body={t("errorBody")}
        actions={[
          { href: "/dashboard", label: t("dashboardButton") },
          { href: "/stories", label: t("storiesButton"), variant: "secondary" },
        ]}
        secondaryAction={
          <button
            type="button"
            onClick={reset}
            className="storycot-btn storycot-btn-secondary"
          >
            {t("tryAgainButton")}
          </button>
        }
      />
    </>
  );
}
