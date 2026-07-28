"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import Button from "@/components/ui/Button";
import Icon from "@/components/ui/Icon";
import type { Story } from "@/types";

export default function StoryEditPanel({ story }: { story: Story }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(story.title);
  const [theme, setTheme] = useState(story.theme);
  const [publicAuthorName, setPublicAuthorName] = useState(
    story.publicAuthorName ?? ""
  );
  const [pages, setPages] = useState(
    story.pages.map((page) => ({
      pageNumber: page.pageNumber,
      text: page.text,
      illustrationPrompt: page.illustrationPrompt,
    }))
  );
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  const hasPublicState =
    story.visibility === "public" ||
    story.visibility === "share_link" ||
    story.publicReviewStatus !== "not_submitted" ||
    Boolean(story.shareToken);

  function updatePageText(index: number, text: string) {
    setPages((current) =>
      current.map((page, pageIndex) =>
        pageIndex === index ? { ...page, text } : page
      )
    );
  }

  function save() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const res = await fetch(`/api/stories/${story.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          theme,
          publicAuthorName,
          pages,
        }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(body?.error ?? "Could not save story edits.");
        return;
      }

      setSaved(true);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <section className="mt-8 rounded-2xl border border-night-100 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-star-600">
            Story edits
          </p>
          <h2 className="mt-1 font-display text-2xl font-bold text-night-800">
            Fix story text
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-night-500">
            Use this for moderation fixes like removing a school name, private
            detail, or character reference.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="storycot-btn storycot-btn-secondary storycot-btn-compact"
        >
          <Icon name={open ? "lock" : "file"} />
          {open ? "Close" : "Edit"}
        </button>
      </div>

      {hasPublicState ? (
        <p className="mt-4 rounded-xl bg-moon-50 p-4 text-sm leading-6 text-night-700">
          Saving edits will remove public/share access and send the story back
          to private. Submit it for review again after checking the changes.
        </p>
      ) : null}

      {saved ? (
        <p className="mt-4 rounded-xl bg-star-50 p-4 text-sm font-bold text-night-700">
          Story edits saved.
        </p>
      ) : null}

      {open ? (
        <div className="mt-5 space-y-4">
          <label className="block">
            <span className="text-sm font-bold text-night-700">Title</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={140}
              className="mt-1 w-full rounded-xl border border-night-200 bg-white px-3 py-2 text-sm text-night-800 outline-none focus:border-star-400 focus:ring-2 focus:ring-star-100"
            />
          </label>

          <label className="block">
            <span className="text-sm font-bold text-night-700">Theme</span>
            <input
              value={theme}
              onChange={(event) => setTheme(event.target.value)}
              maxLength={100}
              className="mt-1 w-full rounded-xl border border-night-200 bg-white px-3 py-2 text-sm text-night-800 outline-none focus:border-star-400 focus:ring-2 focus:ring-star-100"
            />
          </label>

          <label className="block">
            <span className="text-sm font-bold text-night-700">
              Public author name
            </span>
            <input
              value={publicAuthorName}
              onChange={(event) => setPublicAuthorName(event.target.value)}
              maxLength={80}
              className="mt-1 w-full rounded-xl border border-night-200 bg-white px-3 py-2 text-sm text-night-800 outline-none focus:border-star-400 focus:ring-2 focus:ring-star-100"
            />
          </label>

          <div className="space-y-3">
            {pages.map((page, index) => (
              <label key={page.pageNumber} className="block">
                <span className="text-sm font-bold text-night-700">
                  Page {index + 1}
                </span>
                <textarea
                  value={page.text}
                  onChange={(event) =>
                    updatePageText(index, event.target.value)
                  }
                  rows={5}
                  maxLength={2200}
                  className="mt-1 w-full rounded-xl border border-night-200 bg-white px-3 py-2 text-sm leading-6 text-night-800 outline-none focus:border-star-400 focus:ring-2 focus:ring-star-100"
                />
              </label>
            ))}
          </div>

          {error ? (
            <p className="text-sm font-bold text-blush-700">{error}</p>
          ) : null}

          <Button onClick={save} disabled={isPending}>
            {isPending ? "Saving..." : "Save edits"}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
