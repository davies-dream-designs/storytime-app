"use client";

import { useEffect } from "react";
import "./globals.css";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body className="bg-parchment text-ink font-body antialiased">
        <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center px-5 py-16 text-center">
          <div className="mb-8 flex h-28 w-28 items-center justify-center rounded-[2rem] border-4 border-night-200 bg-white font-display text-5xl text-night-800 shadow-lg">
            ?
          </div>
          <p className="text-sm font-bold uppercase tracking-wide text-star-600">
            Story interrupted
          </p>
          <h1 className="mt-3 font-display text-4xl font-bold text-night-800">
            A page fluttered out of place.
          </h1>
          <p className="mt-4 max-w-xl text-lg leading-8 text-night-500">
            Something unexpected happened before Storycot could finish loading.
          </p>
          <button
            type="button"
            onClick={reset}
            className="storycot-btn storycot-btn-primary mt-8"
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
