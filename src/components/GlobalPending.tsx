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
        className={`pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4 transition duration-300 ${
          active ? "translate-y-0 opacity-100" : "-translate-y-3 opacity-0"
        }`}
      >
        <div className="storycot-loader rounded-full border border-night-100 bg-parchment/95 px-4 py-3 shadow-xl shadow-night-900/10 backdrop-blur">
          <div className="storycot-loader-scene" aria-hidden="true">
            <div className="storycot-loader-book" />
            <div className="storycot-loader-moon" />
            <div className="storycot-loader-star storycot-loader-star-a" />
            <div className="storycot-loader-star storycot-loader-star-b" />
          </div>
          <span className="font-display text-sm font-bold text-night-700">
            {label}
          </span>
        </div>
      </div>
    </PendingContext.Provider>
  );
}
