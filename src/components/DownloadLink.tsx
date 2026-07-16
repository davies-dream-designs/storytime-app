"use client";

import type { AnchorHTMLAttributes, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { usePendingUI } from "@/components/GlobalPending";

type DownloadLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  children: ReactNode;
  pendingLabel: ReactNode;
};

export default function DownloadLink({
  children,
  pendingLabel,
  onClick,
  className = "",
  ...props
}: DownloadLinkProps) {
  const [pending, setPending] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopGlobalPendingRef = useRef<(() => void) | null>(null);
  const { startPending } = usePendingUI();

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      stopGlobalPendingRef.current?.();
    };
  }, []);

  return (
    <a
      {...props}
      aria-busy={pending}
      className={`${className} inline-flex items-center justify-center gap-2`}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented) return;

        setPending(true);
        stopGlobalPendingRef.current?.();
        stopGlobalPendingRef.current = startPending(pendingLabel, 4500);
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => {
          setPending(false);
          stopGlobalPendingRef.current?.();
          stopGlobalPendingRef.current = null;
        }, 4500);
      }}
    >
      <span
        className={`h-2 w-2 rounded-full bg-current transition ${
          pending ? "animate-pulse opacity-80" : "opacity-0"
        }`}
        aria-hidden="true"
      />
      <span>{pending ? pendingLabel : children}</span>
    </a>
  );
}
