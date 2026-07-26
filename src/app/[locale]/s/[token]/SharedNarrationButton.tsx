"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { DEFAULT_NARRATION_VOICE_ID, type WordTiming } from "@/lib/elevenlabs";

export default function SharedNarrationButton({
  token,
  projectId,
  spreadIds,
  className = "",
}: {
  token: string;
  projectId: string;
  spreadIds: string[];
  className?: string;
}) {
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [index, setIndex] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const t = useTranslations("books");

  useEffect(() => {
    if (!playing) return;

    const spreadId = spreadIds[index];
    if (!spreadId) {
      setPlaying(false);
      return;
    }

    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          projectId,
          spreadId,
          voiceId: DEFAULT_NARRATION_VOICE_ID,
        });
        const res = await fetch(
          `/api/shared-stories/${token}/narrate?${params}`
        );
        if (!res.ok || cancelled) {
          setPlaying(false);
          return;
        }

        const data = (await res.json()) as {
          audioUrl: string;
          words: WordTiming[];
        };
        if (cancelled) return;

        const audio = new Audio(data.audioUrl);
        audioRef.current = audio;
        audio.addEventListener("ended", () => {
          audioRef.current = null;
          if (cancelled) return;
          setIndex((current) => {
            if (current < spreadIds.length - 1) return current + 1;
            setPlaying(false);
            return current;
          });
        });
        await audio.play();
      } catch {
        if (!cancelled) setPlaying(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void run();

    return () => {
      cancelled = true;
      audioRef.current?.pause();
      audioRef.current = null;
      setLoading(false);
    };
  }, [index, playing, projectId, spreadIds, token]);

  return (
    <button
      type="button"
      onClick={() => {
        if (playing) {
          setPlaying(false);
          audioRef.current?.pause();
          audioRef.current = null;
        } else {
          setIndex(0);
          setPlaying(true);
        }
      }}
      disabled={loading}
      className={`inline-flex items-center gap-3 rounded-full bg-moon-200 px-5 py-3 text-sm font-bold text-night-800 shadow-sm transition hover:bg-moon-100 disabled:opacity-60 ${className}`}
    >
      <span
        className="flex h-8 w-8 items-center justify-center rounded-full bg-night-800 text-white"
        aria-hidden="true"
      >
        {loading ? (
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
        ) : playing ? (
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
            <rect x="4" y="3" width="4" height="14" rx="1" />
            <rect x="12" y="3" width="4" height="14" rx="1" />
          </svg>
        ) : (
          <svg
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-4 w-4 translate-x-0.5"
          >
            <path d="M6.3 2.841A1.5 1.5 0 004 4.11v11.78a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
          </svg>
        )}
      </span>
      {playing ? t("pauseNarration") : t("listenToStory")}
    </button>
  );
}
