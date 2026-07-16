"use client";

import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import DeleteStoryButton from "@/components/DeleteStoryButton";
import { storycotTheme } from "@/lib/theme";
import type { Story, ChildProfile } from "@/types";

function getTheme(theme: string) {
  return (
    storycotTheme.stories[
      theme.toLowerCase() as keyof typeof storycotTheme.stories
    ] ?? storycotTheme.defaultStory
  );
}

export default function StoryLibrary({
  stories,
  profiles,
}: {
  stories: Story[];
  profiles: ChildProfile[];
}) {
  const [query, setQuery] = useState("");
  const [profileFilter, setProfileFilter] = useState("");
  const t = useTranslations("stories");
  const tHome = useTranslations("home");
  const themeNames = tHome.raw("themes") as Record<string, string>;

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return stories.filter((s) => {
      const matchesProfile = !profileFilter || s.profileName === profileFilter;
      const matchesQuery =
        !q ||
        s.title.toLowerCase().includes(q) ||
        s.theme.toLowerCase().includes(q) ||
        s.profileName.toLowerCase().includes(q);
      return matchesProfile && matchesQuery;
    });
  }, [stories, query, profileFilter]);

  if (stories.length === 0) {
    return (
      <div className="rounded-3xl border-2 border-dashed border-night-200 p-16 text-center">
        <div className="text-5xl" aria-hidden>
          📚
        </div>
        <h2 className="mt-4 font-display text-2xl font-bold text-night-700">
          {t("emptyTitle")}
        </h2>
        <p className="mt-2 text-night-400">
          {profiles.length === 0 ? t("emptySub1") : t("emptySub2")}
        </p>
        <Link
          href={profiles.length === 0 ? "/profiles/new" : "/stories/new"}
          className="storycot-btn storycot-btn-primary mt-6"
        >
          {profiles.length === 0
            ? t("emptyCreateProfile")
            : t("emptyGenerateStory")}
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <svg
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-night-300"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="search"
            placeholder={t("searchPlaceholder")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-full border border-night-100 bg-white py-2.5 pl-10 pr-4 text-sm text-night-700 placeholder:text-night-300 focus:outline-none focus:ring-2 focus:ring-night-300"
          />
        </div>
        {profiles.length > 1 && (
          <select
            value={profileFilter}
            onChange={(e) => setProfileFilter(e.target.value)}
            className="rounded-full border border-night-100 bg-white px-4 py-2.5 text-sm font-bold text-night-600 focus:outline-none focus:ring-2 focus:ring-night-300"
          >
            <option value="">{t("filterAll")}</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.name}>
                {p.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-night-100 bg-white p-12 text-center">
          <div className="text-4xl" aria-hidden>
            🔍
          </div>
          <p className="mt-4 font-bold text-night-600">{t("noResults")}</p>
          <button
            onClick={() => {
              setQuery("");
              setProfileFilter("");
            }}
            className="mt-3 text-sm text-night-400 underline"
          >
            {t("clearFilters")}
          </button>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((story) => {
            const theme = getTheme(story.theme);
            const themeName =
              "tKey" in theme
                ? (themeNames[theme.tKey] ?? story.theme)
                : story.theme;
            return (
              <article
                key={story.id}
                className="group flex flex-col overflow-hidden rounded-2xl border border-night-100 bg-white shadow-sm transition hover:border-star-200 hover:shadow-md"
              >
                <div
                  className="flex items-center justify-between px-5 py-3"
                  style={{
                    backgroundColor: theme.light,
                    borderBottom: `2px solid color-mix(in srgb, ${theme.accent} 14%, transparent)`,
                  }}
                >
                  <span className="text-2xl" aria-hidden>
                    {theme.emoji}
                  </span>
                  <span
                    className="rounded-full px-3 py-0.5 text-xs font-bold"
                    style={{
                      backgroundColor: `color-mix(in srgb, ${theme.accent} 10%, transparent)`,
                      color: theme.accent,
                    }}
                  >
                    {themeName}
                  </span>
                </div>
                <div className="flex flex-1 flex-col p-5">
                  <h3 className="font-display text-lg font-bold text-night-800 line-clamp-2">
                    {story.title}
                  </h3>
                  <p className="mt-1.5 text-sm text-night-400">
                    {t("forProfile", { name: story.profileName })}
                  </p>
                  <div className="mt-3 flex items-center gap-3 text-xs text-night-300">
                    <span>{t("wordsCount", { count: story.wordCount })}</span>
                    <span>·</span>
                    <span>
                      {t("pagesCount", { count: story.pages.length })}
                    </span>
                    <span>·</span>
                    <span>
                      {new Date(story.createdAt).toLocaleDateString(undefined, {
                        day: "numeric",
                        month: "short",
                      })}
                    </span>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Link
                      href={`/stories/${story.id}`}
                      className="storycot-btn storycot-btn-primary storycot-btn-compact flex-1"
                      style={{ backgroundColor: theme.accent }}
                    >
                      {t("readButton")}
                    </Link>
                    <DeleteStoryButton storyId={story.id} compact />
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {filtered.length > 0 && filtered.length < stories.length && (
        <p className="mt-4 text-center text-sm text-night-400">
          {t("showingCount", {
            showing: filtered.length,
            total: stories.length,
          })}
        </p>
      )}
    </>
  );
}
