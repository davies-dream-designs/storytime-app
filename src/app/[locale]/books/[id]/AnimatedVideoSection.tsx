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

  function advance() {
    setCurrent((c) => (c + 1 < clips.length ? c + 1 : c));
  }
  function back() {
    setCurrent((c) => (c > 0 ? c - 1 : 0));
  }

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
          onEnded={current < clips.length - 1 ? advance : undefined}
          controls
        />
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <button
          onClick={back}
          disabled={current === 0}
          className="storycot-btn storycot-btn-secondary disabled:opacity-40"
        >
          ← Prev
        </button>
        <p className="text-center text-sm text-night-500">
          Page {current + 1} of {clips.length}
        </p>
        <button
          onClick={advance}
          disabled={current >= clips.length - 1}
          className="storycot-btn storycot-btn-secondary disabled:opacity-40"
        >
          Next →
        </button>
      </div>
    </div>
  );
}

function GeneratingProgress({
  clips,
  totalSpreads,
}: {
  clips: Clip[];
  totalSpreads: number;
}) {
  const done = clips.length;
  const pct = totalSpreads > 0 ? Math.round((done / totalSpreads) * 100) : 0;

  return (
    <div className="mt-4 space-y-3">
      <div className="flex items-center justify-between text-sm text-night-500">
        <span>Animating illustrations…</span>
        <span>{done}/{totalSpreads} pages</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-night-100">
        <div
          className="h-full rounded-full bg-moon-400 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-xs text-night-400">
        Each page takes about 90 seconds — this usually finishes in 10–20 minutes.
        You can close this page and come back.
      </p>
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

  // Poll while generating
  useEffect(() => {
    if (!videoState.unlocked || videoState.status !== "generating") return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/books/${projectId}/video`);
        if (!res.ok) return;
        const data = (await res.json()) as VideoStatus;
        setVideoState(data);
        if (data.status !== "generating") clearInterval(interval);
      } catch {}
    }, 10_000);

    return () => clearInterval(interval);
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
        // Admin bypass — no Stripe, video is already generating
        setVideoState((prev) => ({
          ...prev,
          unlocked: true,
          status: "generating",
        }));
        return;
      }
      if (data.url) window.location.href = data.url;
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  // Unlocked and ready — show player
  if (videoState.unlocked && videoState.status === "ready" && videoState.clips.length > 0) {
    return (
      <div className="rounded-2xl border border-green-200 bg-green-50 p-5">
        <p className="text-xs font-bold uppercase tracking-wide text-green-700">
          Animated storybook — ready
        </p>
        <p className="mt-1 font-display text-xl font-bold text-night-800">
          {storyTitle}
        </p>
        <p className="mt-1 text-sm text-night-500">
          {videoState.clips.length} animated pages — tap play to watch.
        </p>
        <AnimatedPlayer clips={videoState.clips} />
      </div>
    );
  }

  // Generating — show progress
  if (videoState.unlocked && videoState.status === "generating") {
    return (
      <div className="rounded-2xl border border-moon-200 bg-moon-50 p-5">
        <p className="text-xs font-bold uppercase tracking-wide text-moon-700">
          Animated storybook — generating
        </p>
        <p className="mt-1 font-display text-xl font-bold text-night-800">
          {storyTitle}
        </p>
        <GeneratingProgress
          clips={videoState.clips}
          totalSpreads={videoState.totalSpreads}
        />
      </div>
    );
  }

  // Failed
  if (videoState.unlocked && videoState.status === "failed") {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-5">
        <p className="text-xs font-bold uppercase tracking-wide text-red-700">
          Animated storybook — generation failed
        </p>
        <p className="mt-2 text-sm text-night-500">
          Something went wrong generating your animated storybook.
          {isAdmin ? " You can retry via the video API." : " Please contact support."}
        </p>
      </div>
    );
  }

  // Not yet purchased — show purchase card
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
          Narration-ready — audio plays alongside each page
        </li>
        <li className="flex items-center gap-2">
          <span className="text-green-500" aria-hidden="true">✓</span>
          Yours forever — no subscription needed
        </li>
      </ul>
      {error ? (
        <p className="mt-3 text-sm font-bold text-blush-600">{error}</p>
      ) : null}
      <button
        onClick={startCheckout}
        disabled={loading}
        className="storycot-btn storycot-btn-primary mt-4 w-full justify-center disabled:opacity-60"
      >
        {loading
          ? isAdmin
            ? "Triggering…"
            : "Opening checkout…"
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
