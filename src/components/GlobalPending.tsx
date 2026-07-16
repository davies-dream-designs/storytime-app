"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "@/i18n/navigation";
import { useTranslations } from "next-intl";

type PendingContextValue = {
  startPending: (label?: ReactNode, timeoutMs?: number) => () => void;
  stopPending: () => void;
};

const PendingContext = createContext<PendingContextValue | null>(null);

export function usePendingUI() {
  const context = useContext(PendingContext);
  if (!context) {
    return {
      startPending: () => () => undefined,
      stopPending: () => undefined,
    };
  }
  return context;
}

export function GlobalPendingProvider({ children }: { children: ReactNode }) {
  const t = useTranslations("common");
  const pathname = usePathname();
  const [label, setLabel] = useState<ReactNode>(t("loading"));
  const [active, setActive] = useState(false);
  const tokensRef = useRef(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  }, []);

  const stopPending = useCallback(() => {
    tokensRef.current = 0;
    clearTimer();
    setActive(false);
  }, [clearTimer]);

  const startPending = useCallback(
    (nextLabel?: ReactNode, timeoutMs = 12000) => {
      tokensRef.current += 1;
      const token = tokensRef.current;
      setLabel(nextLabel ?? t("loading"));
      setActive(true);
      clearTimer();
      timeoutRef.current = setTimeout(() => {
        if (tokensRef.current === token) stopPending();
      }, timeoutMs);

      return () => {
        if (tokensRef.current === token) stopPending();
      };
    },
    [clearTimer, stopPending, t]
  );

  useEffect(() => {
    stopPending();
  }, [pathname, stopPending]);

  useEffect(() => {
    const onPageShow = () => stopPending();
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, [stopPending]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }

      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;

      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname.startsWith("/api/")) return;
      if (
        url.pathname === window.location.pathname &&
        url.search === window.location.search
      ) {
        return;
      }

      startPending(t("navigating"), 8000);
    };

    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
    };
  }, [startPending, t]);

  const value = useMemo(
    () => ({ startPending, stopPending }),
    [startPending, stopPending]
  );

  return (
    <PendingContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-hidden={!active}
        className={`fixed inset-0 z-50 flex items-center justify-center bg-night-900/28 px-5 backdrop-blur-sm transition duration-300 ${
          active
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0"
        }`}
      >
        <div
          className={`storycot-loader rounded-3xl border border-night-100 bg-parchment/95 px-8 py-7 text-center shadow-2xl shadow-night-900/20 transition duration-300 ${
            active ? "scale-100 opacity-100" : "scale-95 opacity-0"
          }`}
        >
          <div className="storycot-loader-scene" aria-hidden="true">
            <div className="storycot-loader-moon" />
            <div className="storycot-loader-book">
              <div className="storycot-loader-page storycot-loader-page-left" />
              <div className="storycot-loader-page storycot-loader-page-right" />
            </div>
            <div className="storycot-loader-star storycot-loader-star-a" />
            <div className="storycot-loader-star storycot-loader-star-b" />
          </div>
          <span className="mt-4 block font-display text-xl font-bold text-night-800">
            {label}
          </span>
        </div>
      </div>
    </PendingContext.Provider>
  );
}
