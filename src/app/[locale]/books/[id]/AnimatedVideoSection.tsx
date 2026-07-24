"use client";

import { useState, useEffect, useRef } from "react";

type Clip = {
  spreadId: string;
  sequence: number;
  videoUrl: string;
  imageUrl?: string;
  sceneBrief?: string;
};

type VideoStatus = {
  unlocked: boolean;
  status: "generating" | "ready" | "failed" | null;
  startedAt: string | null;
  readyAt: string | null;
  error: string | null;
  clips: Clip[];
  totalSpreads: number;
};

function AnimatedPlayer({ clips }: { clips: Clip[] }) {
  const [current, setCurrent] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.load();
      videoRef.current.play().catch(() => {});
    }
  }, [current]);

  const clip = clips[current];
  if (!clip) return null;

  return (
    <div className="mt-4">
      <div className="relative overflow-hidden rounded-xl bg-night-900 shadow-lg">
        <video
          ref={videoRef}
          key={clip.videoUrl}
          src={clip.videoUrl}
          className="w-full"
          playsInline
          onEnded={current < clips.length - 1 ? () => setCurrent((c) => c + 1) : undefined}
          controls
        />
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <button
          onClick={() => setCurrent((c) => Math.max(0, c - 1))}
          disabled={current === 0}
          className="storycot-btn storycot-btn-secondary disabled:opacity-40"
        >
          ← Prev
        </button>
        <p className="text-center text-sm text-night-500">
          Page {current + 1} of {clips.length}
        </p>
        <button
          onClick={() => setCurrent((c) => Math.min(clips.length - 1, c + 1))}
          disabled={current >= clips.length - 1}
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
    totalSpreads: 0,
  });

  async function fetchStatus() {
    try {
      const res = await fetch(`/api/books/${projectId}/video`);
      if (!res.ok) return;
      const data = (await res.json()) as VideoStatus;
      setVideoState(data);
      return data;
    } catch {}
  }

  // Fetch immediately on mount when unlocked — don't make the user wait 10s
  // to find out if generation is still running or already done/failed.
  useEffect(() => {
    if (!initialUnlocked) return;
    fetchStatus();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll every 10s while generating
  useEffect(() => {
    if (!videoState.unlocked || videoState.status !== "generating") return;
    const interval = setInterval(async () => {
      const data = await fetchStatus();
      if (data && data.status !== "generating") clearInterval(interval);
    }, 10_000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, videoState.unlocked, videoState.status]);

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

  if (videoState.unlocked && videoState.status === "ready" && videoState.clips.length > 0) {
    return (
      <div className="rounded-2xl border border-green-200 bg-green-50 p-5">
        <p className="text-xs font-bold uppercase tracking-wide text-green-700">
          Animated storybook — unlocked
        </p>
        <p className="mt-1 font-display text-xl font-bold text-night-800">
          {storyTitle}
        </p>
        <p className="mt-1 text-sm text-night-500">
          {videoState.clips.length} animated pages ready to watch.
        </p>
        <AnimatedPlayer clips={videoState.clips} />
      </div>
    );
  }

  if (videoState.unlocked && videoState.status === "generating") {
    const done = videoState.clips.length;
    const total = videoState.totalSpreads;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;

    return (
      <div className="rounded-2xl border border-night-100 bg-white p-5 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-wide text-moon-600">
          Animated storybook — generating
        </p>
        <p className="mt-1 font-display text-xl font-bold text-night-800">
          {storyTitle}
        </p>
        <p className="mt-2 text-sm text-night-500">
          Animating your illustrations one by one — each page takes about 90 seconds.
        </p>
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between text-sm text-night-500">
            <span>{done} of {total} pages done</span>
            <span>{pct}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-night-100">
            <div
              className="h-full rounded-full bg-moon-400 transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
        <p className="mt-3 text-xs text-night-400">
          You can close this page and come back — it will keep going in the background.
        </p>
      </div>
    );
  }

  if (videoState.unlocked && videoState.status === "failed") {
    return (
      <div className="rounded-2xl border border-red-100 bg-red-50 p-5">
        <p className="text-xs font-bold uppercase tracking-wide text-red-600">
          Animated storybook — failed
        </p>
        <p className="mt-2 text-sm text-night-600">
          Something went wrong generating your animated storybook.
        </p>
        {isAdmin && (
          <button
            onClick={async () => {
              await fetch(`/api/books/${projectId}/video`, { method: "POST" });
              await fetchStatus();
            }}
            className="storycot-btn storycot-btn-secondary mt-3"
          >
            Retry generation
          </button>
        )}
        {!isAdmin && (
          <p className="mt-1 text-sm text-night-400">Please contact support.</p>
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
