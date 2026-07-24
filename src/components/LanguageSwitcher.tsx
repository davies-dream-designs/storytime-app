"use client";

import { useState, useRef, useEffect } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useRouter, usePathname } from "@/i18n/navigation";
import { getLocaleConfig, localeConfigs, type Locale } from "@/i18n/locales";

export default function LanguageSwitcher({
  variant = "light",
}: {
  variant?: "light" | "dark";
}) {
  const t = useTranslations("nav");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const currentLocale = getLocaleConfig(locale);

  function switchLocale(l: Locale) {
    router.replace(pathname, { locale: l });
    setOpen(false);
  }

  const btnClass =
    variant === "dark"
      ? "flex items-center gap-1.5 rounded-full border border-white/30 bg-white/10 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-white/20"
      : "flex items-center gap-1.5 rounded-full border border-night-200 bg-parchment px-3 py-1.5 text-xs font-bold text-night-600 transition hover:bg-night-50";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={t("language")}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls="language-listbox"
        className={btnClass}
      >
        {/* Globe icon */}
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="2" y1="12" x2="22" y2="12" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
        <span>{currentLocale?.shortLabel ?? locale.toUpperCase()}</span>
        {/* Chevron */}
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          aria-hidden
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div id="language-listbox" role="listbox" className="absolute right-0 top-full z-50 mt-2 w-36 overflow-hidden rounded-xl border border-night-100 bg-white shadow-lg">
          {localeConfigs.map((l) => (
            <button
              key={l.code}
              type="button"
              role="option"
              aria-selected={l.code === locale}
              onClick={() => switchLocale(l.code)}
              className={`flex w-full items-center gap-2.5 px-4 py-2.5 text-sm transition hover:bg-night-50 ${l.code === locale ? "font-bold text-night-800 bg-night-50" : "text-night-600"}`}
            >
              <span className="w-6 shrink-0 text-xs font-bold text-night-400">
                {l.shortLabel}
              </span>
              <span>{l.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
