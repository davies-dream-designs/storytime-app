"use client";

import type { AnchorHTMLAttributes, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

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

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
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
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => setPending(false), 4500);
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
