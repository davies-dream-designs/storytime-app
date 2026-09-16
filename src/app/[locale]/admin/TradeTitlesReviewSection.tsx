"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import type { Story, StoryPreset } from "@/types";
import type { TradeTitle } from "@/types/tradeBook";

const PRESETS: Array<{ value: StoryPreset; label: string }> = [
  { value: "baby-drift", label: "Baby drift" },
  { value: "little-listener", label: "Little listener" },
  { value: "toddler-tale", label: "Toddler tale" },
  { value: "first-adventure", label: "First adventure" },
  { value: "preschool-story", label: "Preschool story" },
  { value: "big-kid-chapter", label: "Big kid chapter" },
  { value: "young-reader-short", label: "Young reader short" },
  { value: "young-reader-classic", label: "Young reader classic" },
  { value: "young-reader-long", label: "Young reader long" },
];

type TitleWithStory = {
  title: TradeTitle;
  story?: Story;
};

const initialForm = {
  theme: "",
  premise: "",
  notes: "",
  storyPreset: "preschool-story" as StoryPreset,
  locale: "en",
  protagonistName: "",
  protagonistAge: "5",
  protagonistGender: "not_specified",
};

export default function TradeTitlesReviewSection({
  entries,
}: {
  entries: TitleWithStory[];
}) {
  const router = useRouter();
  const [form, setForm] = useState(initialForm);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const response = await fetch("/api/admin/trade-titles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          theme: form.theme,
          premise: form.premise,
          notes: form.notes,
          storyPreset: form.storyPreset,
          locale: form.locale,
          protagonist: {
            name: form.protagonistName,
            age: Number(form.protagonistAge),
            gender: form.protagonistGender,
          },
        }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(body?.error ?? "Could not queue the trade title.");
        return;
      }
      setForm(initialForm);
      router.refresh();
    });
  }

  function review(id: string, decision: "approved" | "rejected") {
    setError(null);
    startTransition(async () => {
      const response = await fetch(`/api/admin/trade-titles/${id}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, note: notes[id] }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(body?.error ?? "Could not update the trade title.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <section>
      <h2 className="mb-1 font-display text-xl font-bold text-night-800">
        Trade title review
      </h2>
      <p className="mb-3 text-sm text-night-400">
        Queue original trade manuscripts for generation, then approve or reject
        their drafts here.
      </p>
      {error ? (
        <p className="mb-3 rounded-xl bg-blush-50 px-4 py-3 text-sm font-bold text-blush-700">
          {error}
        </p>
      ) : null}

      <form
        onSubmit={submit}
        className="mb-5 rounded-2xl border border-night-100 bg-white p-5 shadow-sm"
      >
        <h3 className="font-display text-lg font-bold text-night-800">
          Queue a trade title
        </h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-bold text-night-700">
            Theme
            <input
              required
              value={form.theme}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  theme: event.target.value,
                }))
              }
              className="mt-1 w-full rounded-xl border border-night-200 px-3 py-2 font-normal outline-none focus:border-star-400 focus:ring-2 focus:ring-star-100"
            />
          </label>
          <label className="text-sm font-bold text-night-700">
            Locale
            <input
              required
              value={form.locale}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  locale: event.target.value,
                }))
              }
              placeholder="en"
              className="mt-1 w-full rounded-xl border border-night-200 px-3 py-2 font-normal outline-none focus:border-star-400 focus:ring-2 focus:ring-star-100"
            />
          </label>
          <label className="text-sm font-bold text-night-700 sm:col-span-2">
            Premise
            <textarea
              required
              rows={2}
              value={form.premise}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  premise: event.target.value,
                }))
              }
              className="mt-1 w-full rounded-xl border border-night-200 px-3 py-2 font-normal outline-none focus:border-star-400 focus:ring-2 focus:ring-star-100"
            />
          </label>
          <label className="text-sm font-bold text-night-700 sm:col-span-2">
            Editorial notes
            <textarea
              rows={2}
              value={form.notes}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  notes: event.target.value,
                }))
              }
              className="mt-1 w-full rounded-xl border border-night-200 px-3 py-2 font-normal outline-none focus:border-star-400 focus:ring-2 focus:ring-star-100"
            />
          </label>
          <label className="text-sm font-bold text-night-700">
            Preset
            <select
              value={form.storyPreset}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  storyPreset: event.target.value as StoryPreset,
                }))
              }
              className="mt-1 w-full rounded-xl border border-night-200 px-3 py-2 font-normal outline-none focus:border-star-400 focus:ring-2 focus:ring-star-100"
            >
              {PRESETS.map((preset) => (
                <option key={preset.value} value={preset.value}>
                  {preset.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-bold text-night-700">
            Protagonist name
            <input
              required
              value={form.protagonistName}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  protagonistName: event.target.value,
                }))
              }
              className="mt-1 w-full rounded-xl border border-night-200 px-3 py-2 font-normal outline-none focus:border-star-400 focus:ring-2 focus:ring-star-100"
            />
          </label>
          <label className="text-sm font-bold text-night-700">
            Protagonist age
            <input
              required
              min="0"
              max="18"
              type="number"
              value={form.protagonistAge}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  protagonistAge: event.target.value,
                }))
              }
              className="mt-1 w-full rounded-xl border border-night-200 px-3 py-2 font-normal outline-none focus:border-star-400 focus:ring-2 focus:ring-star-100"
            />
          </label>
          <label className="text-sm font-bold text-night-700">
            Protagonist gender
            <select
              value={form.protagonistGender}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  protagonistGender: event.target.value,
                }))
              }
              className="mt-1 w-full rounded-xl border border-night-200 px-3 py-2 font-normal outline-none focus:border-star-400 focus:ring-2 focus:ring-star-100"
            >
              <option value="not_specified">Not specified</option>
              <option value="girl">Girl</option>
              <option value="boy">Boy</option>
              <option value="non_binary">Non-binary</option>
            </select>
          </label>
        </div>
        <button
          type="submit"
          disabled={isPending}
          className="storycot-btn storycot-btn-primary storycot-btn-compact mt-4"
        >
          Queue manuscript generation
        </button>
      </form>

      {entries.length === 0 ? (
        <div className="rounded-2xl border border-night-100 bg-white p-6 text-center text-night-400">
          No trade titles have been queued.
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {entries.map(({ title, story }) => (
            <article
              key={title.id}
              className="rounded-2xl border border-night-100 bg-white p-5 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-display text-lg font-bold text-night-800">
                    {title.seedBrief.theme}
                  </p>
                  <p className="mt-1 text-sm text-night-500">
                    {title.seedBrief.protagonist.name}, age{" "}
                    {title.seedBrief.protagonist.age} ·{" "}
                    {title.seedBrief.storyPreset} · {title.seedBrief.locale}
                  </p>
                  <p className="mt-1 font-mono text-xs text-night-400">
                    {title.id}
                  </p>
                </div>
                <span className="rounded-full bg-night-100 px-3 py-1 text-xs font-bold text-night-700">
                  {title.status === "book_ready"
                    ? "✅ Book ready — live in public gallery"
                    : title.status}
                </span>
              </div>
              <dl className="mt-4 grid gap-2 text-sm text-night-700">
                <div>
                  <dt className="font-bold">Premise</dt>
                  <dd>{title.seedBrief.premise}</dd>
                </div>
                {title.seedBrief.notes ? (
                  <div>
                    <dt className="font-bold">Notes</dt>
                    <dd>{title.seedBrief.notes}</dd>
                  </div>
                ) : null}
                {title.generationError ? (
                  <div className="rounded-xl bg-blush-50 p-3 text-blush-700">
                    <dt className="font-bold">Generation error</dt>
                    <dd>{title.generationError}</dd>
                  </div>
                ) : null}
              </dl>
              {title.gateResults ? (
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm font-bold text-night-700">
                    Gate results
                  </summary>
                  <pre className="mt-2 overflow-x-auto rounded-xl bg-night-50 p-3 text-xs text-night-700">
                    {JSON.stringify(title.gateResults, null, 2)}
                  </pre>
                </details>
              ) : null}
              {story ? (
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm font-bold text-night-700">
                    Generated manuscript: {story.title}
                  </summary>
                  <div className="mt-2 space-y-3 rounded-xl bg-night-50 p-4 text-sm text-night-700">
                    {story.pages.map((page) => (
                      <p key={page.pageNumber}>
                        <span className="font-bold">
                          Page {page.pageNumber}.
                        </span>{" "}
                        {page.text}
                      </p>
                    ))}
                  </div>
                </details>
              ) : title.storyId ? (
                <p className="mt-3 text-sm text-night-500">
                  Generated manuscript: {title.storyId}
                </p>
              ) : null}
              {title.reviewedAt ? (
                <p className="mt-3 text-sm text-night-500">
                  Reviewed by {title.reviewedBy} at{" "}
                  {new Date(title.reviewedAt).toLocaleString()}
                  {title.reviewNote ? `: ${title.reviewNote}` : ""}
                </p>
              ) : null}
              {title.status === "draft" ? (
                <>
                  <textarea
                    rows={2}
                    value={notes[title.id] ?? ""}
                    onChange={(event) =>
                      setNotes((current) => ({
                        ...current,
                        [title.id]: event.target.value,
                      }))
                    }
                    placeholder="Review note"
                    className="mt-4 w-full rounded-xl border border-night-200 px-3 py-2 text-sm outline-none focus:border-star-400 focus:ring-2 focus:ring-star-100"
                  />
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => review(title.id, "approved")}
                      className="storycot-btn storycot-btn-primary storycot-btn-compact"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => review(title.id, "rejected")}
                      className="storycot-btn storycot-btn-secondary storycot-btn-compact"
                    >
                      Reject
                    </button>
                  </div>
                </>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
