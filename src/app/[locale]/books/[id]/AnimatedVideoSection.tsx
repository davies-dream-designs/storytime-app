"use client";

import { useState, useEffect, useRef, useCallback } from "react";

type Clip = {
  spreadId: string;
  sequence: number;
  videoUrl: string;
  imageUrl?: string;
  sceneBrief?: string;
};

type SpreadPage = {
  spreadId: string;
  sequence: number;
  videoUrl: string | null;
  imageUrl: string | null;
  sceneBrief: string;
};

type VideoStatus = {
  unlocked: boolean;
  status: "generating" | "ready" | "failed" | null;
  startedAt: string | null;
  readyAt: string | null;
  error: string | null;
  clips: Clip[];
  allSpreads: SpreadPage[];
  totalSpreads: number;
};

type PageBoundary = { spreadId: string; endTime: number };
type FullNarration = { audioUrl: string; pageBoundaries: PageBoundary[]; totalDuration: number };

function AnimatedPlayer({
  allSpreads,
  projectId,
}: {
  allSpreads: SpreadPage[];
  projectId: string;
}) {
  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [narration, setNarration] = useState<FullNarration | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const boundaryRef = useRef<PageBoundary[]>([]);
  const currentRef = useRef(0);

  // Keep refs in sync so timeupdate callback has fresh values
  useEffect(() => { currentRef.current = current; }, [current]);
  useEffect(() => { boundaryRef.current = narration?.pageBoundaries ?? []; }, [narration]);

  // Load full-book narration once
  useEffect(() => {
    fetch(`/api/books/${projectId}/narrate/full`, { cache: "no-store" })
      .then((r) => r.ok ? r.json() as Promise<FullNarration> : null)
      .then((data) => { if (data) setNarration(data); })
      .catch(() => {});
  }, [projectId]);

  // Wire up the single audio element once narration URL is known
  useEffect(() => {
    if (!narration) return;

    const audio = new Audio(narration.audioUrl);
    audioRef.current = audio;

    audio.addEventListener("play", () => setPlaying(true));
    audio.addEventListener("pause", () => setPlaying(false));
    audio.addEventListener("ended", () => setPlaying(false));

    // Advance video clip when audio passes a page boundary
    audio.addEventListener("timeupdate", () => {
      const idx = currentRef.current;
      const boundaries = boundaryRef.current;
      const boundary = boundaries[idx];
      if (boundary && audio.currentTime >= boundary.endTime && idx < boundaries.length - 1) {
        setCurrent(idx + 1);
      }
    });

    return () => {
      audio.pause();
      audioRef.current = null;
    };
  }, [narration]);

  // Switch page when current changes
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.load();
    if (playing) video.play().catch(() => {});
  }, [current, playing]);

  function togglePlay() {
    const audio = audioRef.current;
    const video = videoRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      video?.pause();
    } else {
      audio.play().catch(() => {});
      video?.play().catch(() => {});
    }
  }

  function goTo(index: number) {
    const audio = audioRef.current;
    const boundaries = narration?.pageBoundaries ?? [];
    const targetTime = index === 0 ? 0 : (boundaries[index - 1]?.endTime ?? 0);
    if (audio) audio.currentTime = targetTime;
    setCurrent(index);
  }

  const page = allSpreads[current];
  if (!page) return null;

  return (
    <div className="mt-4">
      <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-night-900 shadow-lg">
        {page.videoUrl ? (
          // Kling animated clip — loops while narration plays this page
          <video
            ref={videoRef}
            key={page.videoUrl}
            src={page.videoUrl}
            className="h-full w-full object-cover"
            playsInline
            muted
            loop
          />
        ) : page.imageUrl ? (
          // Illustration generated but no Kling clip (e.g. failed illustration
          // pages now covered by narration) — show static image
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={page.imageUrl}
            alt={page.sceneBrief}
            className="h-full w-full object-cover"
          />
        ) : (
          // No image at all — dark placeholder
          <div className="flex h-full w-full items-center justify-center">
            <p className="text-sm text-night-500">Illustration unavailable</p>
          </div>
        )}
        {/* Play/pause overlay */}
        <button
          onClick={togglePlay}
          className="absolute inset-0 flex items-center justify-center bg-black/0 hover:bg-black/10 transition-colors"
          aria-label={playing ? "Pause" : "Play"}
        >
          {!playing && (
            <span className="rounded-full bg-white/80 p-4 shadow-lg">
              <svg className="h-8 w-8 text-night-800 translate-x-0.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </span>
          )}
        </button>
      </div>
      {!narration && (
        <p className="mt-2 text-center text-xs text-night-400">Loading narration…</p>
      )}
      <div className="mt-3 flex items-center justify-between gap-3">
        <button
          onClick={() => goTo(Math.max(0, current - 1))}
          disabled={current === 0}
          className="storycot-btn storycot-btn-secondary disabled:opacity-40"
        >
          ← Prev
        </button>
        <p className="text-center text-sm text-night-500">
          Page {current + 1} of {allSpreads.length}
        </p>
        <button
          onClick={() => goTo(Math.min(allSpreads.length - 1, current + 1))}
          disabled={current >= allSpreads.length - 1}
          className="storycot-btn storycot-btn-secondary disabled:opacity-40"
        >
          Next →
        </button>
      </div>
    </div>
  );
}

export default function AnimatedVideoSection({
  projectId,
  storyTitle,
  isAdmin,
  initialUnlocked,
  initialStatus,
}: {
  projectId: string;
  storyTitle: string;
  isAdmin: boolean;
  initialUnlocked: boolean;
  initialStatus: VideoStatus["status"];
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [videoState, setVideoState] = useState<VideoStatus>({
    unlocked: initialUnlocked,
    status: initialStatus,
    startedAt: null,
    readyAt: null,
    error: null,
    clips: [],
    allSpreads: [],
    totalSpreads: 0,
  });

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/books/${projectId}/video`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as VideoStatus;
      setVideoState(data);
      return data;
    } catch {}
  }, [projectId]);

  // Fetch immediately on mount when unlocked.
  useEffect(() => {
    if (!initialUnlocked) return;
    fetchStatus();
  }, [initialUnlocked, fetchStatus]);

  // Poll every 10s while generating — useCallback keeps fetchStatus stable
  // so the interval always has the latest closure.
  useEffect(() => {
    if (!videoState.unlocked || videoState.status !== "generating") return;
    const interval = setInterval(() => {
      fetchStatus();
    }, 10_000);
    return () => clearInterval(interval);
  }, [projectId, videoState.unlocked, videoState.status, fetchStatus]);

  async function startCheckout() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "animated_video", projectId }),
      });
      const data = (await res.json()) as {
        url?: string;
        adminTriggered?: boolean;
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      if (data.adminTriggered) {
        // Fetch fresh state from DB immediately rather than relying on
        // client-side optimistic update — Inngest send may have failed.
        await fetchStatus();
        return;
      }
      if (data.url) window.location.href = data.url;
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  // -------------------------------------------------------------------------
  // Render states — styled to match DigitalDownloadSection
  // -------------------------------------------------------------------------

  // Green = unlocked (you own it), regardless of whether generation is done yet.
  // This matches DigitalDownloadSection: green means paid/triggered, not "ready".
  if (videoState.unlocked) {
    const done = videoState.clips.length;
    const total = videoState.totalSpreads;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    const isReady = videoState.status === "ready" && videoState.allSpreads.length > 0;
    const isFailed = videoState.status === "failed";

    return (
      <div className={`rounded-2xl border p-5 ${isFailed ? "border-red-200 bg-red-50" : "border-green-200 bg-green-50"}`}>
        <p className={`text-xs font-bold uppercase tracking-wide ${isFailed ? "text-red-700" : "text-green-700"}`}>
          Animated storybook —{" "}
          {isReady ? "unlocked" : isFailed ? "failed" : "generating"}
        </p>
        <p className="mt-1 font-display text-xl font-bold text-night-800">
          {storyTitle}
        </p>

        {isReady && (
          <>
            <p className="mt-1 text-sm text-night-500">
              {done} animated pages ready to watch.
            </p>
            <AnimatedPlayer allSpreads={videoState.allSpreads} projectId={projectId} />
          </>
        )}

        {!isReady && !isFailed && (
          <>
            <p className="mt-2 text-sm text-night-600">
              Animating your illustrations — each page takes about 90 seconds.
            </p>
            <div className="mt-3 space-y-2">
              <div className="flex items-center justify-between text-sm text-night-500">
                <span>{done} of {total} pages done</span>
                <span>{pct}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-green-200">
                <div
                  className="h-full rounded-full bg-green-500 transition-all duration-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
            <p className="mt-3 text-xs text-night-500">
              You can close this page and come back — it keeps going in the background.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={() => fetchStatus()}
                className="storycot-btn storycot-btn-secondary text-xs"
              >
                Refresh
              </button>
              {isAdmin && (
                <button
                  onClick={async () => {
                    await fetch(`/api/books/${projectId}/video`, { method: "POST" });
                    await fetchStatus();
                  }}
                  className="storycot-btn storycot-btn-secondary text-xs"
                >
                  Admin — re-trigger job
                </button>
              )}
            </div>
          </>
        )}

        {isFailed && (
          <>
            <p className="mt-2 text-sm text-night-600">
              Something went wrong generating your animated storybook.
            </p>
            {isAdmin ? (
              <button
                onClick={async () => {
                  await fetch(`/api/books/${projectId}/video`, { method: "POST" });
                  await fetchStatus();
                }}
                className="storycot-btn storycot-btn-secondary mt-3"
              >
                Retry generation
              </button>
            ) : (
              <p className="mt-1 text-sm text-night-400">Please contact support.</p>
            )}
          </>
        )}
      </div>
    );
  }

  // Not yet purchased / not yet triggered
  return (
    <div className="rounded-2xl border border-night-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-wide text-star-600">
        Animated storybook
      </p>
      <div className="mt-1 flex items-baseline gap-3">
        <p className="font-display text-2xl font-bold text-night-800">
          {isAdmin ? "Free" : "$14.95"}
        </p>
        {!isAdmin && <p className="text-sm text-night-400">AUD · one-time</p>}
      </div>
      <p className="mt-2 text-sm leading-6 text-night-500">
        Your illustrated story brought to life — every page animated with gentle
        movement and warm light.
      </p>
      <ul className="mt-3 space-y-1.5 text-sm text-night-600">
        <li className="flex items-center gap-2">
          <span className="text-green-500" aria-hidden="true">✓</span>
          Every illustration animated — characters breathe, leaves drift
        </li>
        <li className="flex items-center gap-2">
          <span className="text-green-500" aria-hidden="true">✓</span>
          Play online — share the link with family
        </li>
        <li className="flex items-center gap-2">
          <span className="text-green-500" aria-hidden="true">✓</span>
          Narration plays alongside each animated page
        </li>
        <li className="flex items-center gap-2">
          <span className="text-green-500" aria-hidden="true">✓</span>
          Yours forever — no subscription needed
        </li>
      </ul>
      {error ? (
        <p className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-600">
          {error}
        </p>
      ) : null}
      <button
        onClick={startCheckout}
        disabled={loading}
        className="storycot-btn storycot-btn-primary mt-4 w-full justify-center disabled:opacity-60"
      >
        {loading
          ? isAdmin ? "Starting…" : "Opening checkout…"
          : isAdmin
            ? "Generate animated storybook (admin — free)"
            : "Get animated storybook — $14.95"}
      </button>
      {!isAdmin && (
        <p className="mt-2 text-center text-xs text-night-400">
          Secure payment via Stripe · AUD pricing · Australian customers
        </p>
      )}
    </div>
  );
}
