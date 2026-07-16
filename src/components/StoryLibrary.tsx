"use client";

import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import DeleteStoryButton from "@/components/DeleteStoryButton";
import CollectionFilters from "@/components/library/CollectionFilters";
import {
  defaultDateRange,
  formatLocalShortDate,
  isIsoDateInLocalRange,
  type DateRangeValue,
} from "@/lib/dates";
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
  const [dateRange, setDateRange] = useState<DateRangeValue>(defaultDateRange);
  const t = useTranslations("stories");
  const tHome = useTranslations("home");
  const themeNames = tHome.raw("themes") as Record<string, string>;

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return stories.filter((s) => {
      const matchesProfile = !profileFilter || s.profileName === profileFilter;
      const matchesDate = isIsoDateInLocalRange(s.createdAt, dateRange);
      const matchesQuery =
        !q ||
        s.title.toLowerCase().includes(q) ||
        s.theme.toLowerCase().includes(q) ||
        s.profileName.toLowerCase().includes(q);
      return matchesProfile && matchesDate && matchesQuery;
    });
  }, [stories, query, profileFilter, dateRange]);

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
      <CollectionFilters
        search={query}
        searchPlaceholder={t("searchPlaceholder")}
        onSearchChange={setQuery}
        dateRange={dateRange}
        onDateRangeChange={setDateRange}
        dateLabels={{
          all: t("dateAll"),
          last7: t("dateLast7"),
          last30: t("dateLast30"),
          last90: t("dateLast90"),
          custom: t("dateCustom"),
          from: t("dateFrom"),
          to: t("dateTo"),
        }}
        primarySelect={
          profiles.length > 1
            ? {
                value: profileFilter,
                allLabel: t("filterAll"),
                options: profiles.map((profile) => ({
                  value: profile.name,
                  label: profile.name,
                })),
                onChange: setProfileFilter,
              }
            : undefined
        }
      />

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
                <div className="flex flex-1 flex-col p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-display text-xl font-bold text-night-800 line-clamp-2">
                        {story.title}
                      </h3>
                      <p className="mt-1.5 text-sm text-night-400">
                        {t("forProfile", { name: story.profileName })} ·{" "}
                        {formatLocalShortDate(story.createdAt)}
                      </p>
                    </div>
                    <span className="text-2xl" aria-hidden>
                      {theme.emoji}
                    </span>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <span>
                      <span
                        className="rounded-full px-3 py-0.5 text-xs font-bold"
                        style={{
                          backgroundColor: `color-mix(in srgb, ${theme.accent} 10%, transparent)`,
                          color: theme.accent,
                        }}
                      >
                        {themeName}
                      </span>
                    </span>
                    <span className="text-xs font-bold text-night-300">
                      {t("wordsCount", { count: story.wordCount })}
                    </span>
                    <span className="text-xs font-bold text-night-300">
                      {t("pagesCount", { count: story.pages.length })}
                    </span>
                  </div>
                  <div className="mt-5 flex flex-wrap gap-2">
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
