"use client";

import { useState } from "react";

type Status = "idle" | "loading" | "success" | "error";

export default function WaitlistForm({ variant = "light" }: { variant?: "light" | "dark" }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("loading");
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data: { ok?: boolean; error?: string } = await res.json();
      if (!res.ok || !data.ok) {
        setStatus("error");
        setMessage(data.error ?? "Something went wrong. Try again.");
        return;
      }
      setStatus("success");
      setMessage("You're on the list! We'll roar when the Kickstarter is live. 🦖");
      setEmail("");
    } catch {
      setStatus("error");
      setMessage("Network hiccup — please try again.");
    }
  }

  const dark = variant === "dark";

  if (status === "success") {
    return (
      <p
        className={`rounded-2xl px-6 py-4 text-center font-bold ${
          dark ? "bg-slime-300 text-swamp-800" : "bg-swamp-700 text-slime-100"
        }`}
        role="status"
      >
        {message}
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="w-full">
      <div className="flex flex-col gap-3 sm:flex-row">
        <label htmlFor="waitlist-email" className="sr-only">
          Email address
        </label>
        <input
          id="waitlist-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="parent@email.com"
          className={`flex-1 rounded-full border-2 px-6 py-4 text-lg font-semibold outline-none transition focus:ring-4 ${
            dark
              ? "border-slime-300/40 bg-swamp-800/60 text-cream placeholder:text-slime-100/50 focus:ring-slime-300/30"
              : "border-swamp-700/15 bg-white text-ink placeholder:text-ink/40 focus:ring-grape-300"
          }`}
        />
        <button
          type="submit"
          disabled={status === "loading"}
          className="rounded-full bg-tang-500 px-8 py-4 text-lg font-extrabold text-white shadow-lg shadow-tang-500/30 transition hover:-translate-y-0.5 hover:bg-tang-400 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {status === "loading" ? "Joining…" : "Join the pack"}
        </button>
      </div>
      {status === "error" && (
        <p className="mt-2 px-2 text-sm font-semibold text-tang-500" role="alert">
          {message}
        </p>
      )}
      <p
        className={`mt-3 px-2 text-sm ${dark ? "text-slime-100/60" : "text-ink/50"}`}
      >
        No spam, ever. Just first dibs on the Kickstarter and early-bird pricing.
      </p>
    </form>
  );
}
