"use client";

import { Link } from "@/i18n/navigation";
import DeleteStoryButton from "@/components/DeleteStoryButton";
import { buttonClassName, joinClasses } from "@/components/ui/buttonStyles";
import { formatLocalShortDate } from "@/lib/dates";
import { getStoryTheme } from "@/lib/storyTheme";
import type { Story } from "@/types";

type StoryCardLabels = {
  forProfile: string;
  read: string;
  words: string;
  pages: string;
};

type StoryCardProps = {
  story: Story;
  themeName: string;
  labels: StoryCardLabels;
  compact?: boolean;
  showDelete?: boolean;
};

export default function StoryCard({
  story,
  themeName,
  labels,
  compact = false,
  showDelete = false,
}: StoryCardProps) {
  const theme = getStoryTheme(story.theme);

  return (
    <article
      className={joinClasses(
        "group flex h-full flex-col overflow-hidden rounded-2xl border border-night-100 bg-white shadow-sm transition hover:border-star-200 hover:shadow-md",
        compact ? "p-5" : "p-5"
      )}
    >
      <div className="flex flex-1 flex-col">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2
              className={joinClasses(
                "font-display font-bold text-night-800 line-clamp-2",
                compact ? "min-h-[2.75rem] text-lg" : "min-h-[3.5rem] text-xl"
              )}
            >
              {story.title}
            </h2>
            <p className="mt-1.5 text-sm text-night-400">
              {labels.forProfile} · {formatLocalShortDate(story.createdAt)}
            </p>
          </div>
          <span className={compact ? "text-xl" : "text-2xl"} aria-hidden>
            {theme.emoji}
          </span>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span
            className="rounded-full px-3 py-0.5 text-xs font-bold"
            style={{
              backgroundColor: `color-mix(in srgb, ${theme.accent} 10%, transparent)`,
              color: theme.accent,
            }}
          >
            {themeName}
          </span>
          <span className="text-xs font-bold text-night-300">
            {labels.words}
          </span>
          <span className="text-xs font-bold text-night-300">
            {labels.pages}
          </span>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <Link
            href={`/stories/${story.id}`}
            className={buttonClassName({
              size: "compact",
              className: "flex-1",
            })}
            style={{ backgroundColor: theme.accent }}
          >
            {labels.read}
          </Link>
          {showDelete && <DeleteStoryButton storyId={story.id} compact />}
        </div>
      </div>
    </article>
  );
}
