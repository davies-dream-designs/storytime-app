"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import DeleteBookButton from "@/components/DeleteBookButton";
import CollectionFilters from "@/components/library/CollectionFilters";
import {
  defaultDateRange,
  formatLocalShortDate,
  isIsoDateInLocalRange,
  type DateRangeValue,
} from "@/lib/dates";
import type { Story } from "@/types";
import type { BookProject, BookProjectStatus } from "@/types/printBook";

type BooksLibraryProps = {
  projects: BookProject[];
  stories: Story[];
};

const statusOptions: BookProjectStatus[] = [
  "queued",
  "planning",
  "bible",
  "illustrating",
  "composing",
  "proofing",
  "ready",
  "failed",
];

function getBookTitle(
  project: BookProject,
  storyTitleById: Map<string, string>
) {
  return storyTitleById.get(project.sourceStoryId);
}

export default function BooksLibrary({ projects, stories }: BooksLibraryProps) {
  const t = useTranslations("books");
  const tStories = useTranslations("stories");
  const [query, setQuery] = useState("");
  const [profileFilter, setProfileFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [dateRange, setDateRange] = useState<DateRangeValue>(defaultDateRange);

  const storyTitleById = useMemo(
    () => new Map(stories.map((story) => [story.id, story.title])),
    [stories]
  );
  const profileNameById = useMemo(
    () => new Map(stories.map((story) => [story.profileId, story.profileName])),
    [stories]
  );
  const profileOptions = useMemo(
    () =>
      Array.from(new Set(stories.map((story) => story.profileName)))
        .sort((a, b) => a.localeCompare(b))
        .map((name) => ({ value: name, label: name })),
    [stories]
  );

  const filtered = useMemo(() => {
    const trimmed = query.toLowerCase().trim();
    return projects.filter((project) => {
      const title = getBookTitle(project, storyTitleById) ?? t("untitledBook");
      const profileName = profileNameById.get(project.profileId) ?? "";
      const matchesQuery =
        !trimmed ||
        title.toLowerCase().includes(trimmed) ||
        project.currentStageLabel.toLowerCase().includes(trimmed) ||
        project.status.toLowerCase().includes(trimmed) ||
        profileName.toLowerCase().includes(trimmed);
      const matchesProfile = !profileFilter || profileName === profileFilter;
      const matchesStatus = !statusFilter || project.status === statusFilter;
      const matchesDate = isIsoDateInLocalRange(project.createdAt, dateRange);
      return matchesQuery && matchesProfile && matchesStatus && matchesDate;
    });
  }, [
    dateRange,
    profileFilter,
    profileNameById,
    projects,
    query,
    statusFilter,
    storyTitleById,
    t,
  ]);

  return (
    <>
      <CollectionFilters
        search={query}
        searchPlaceholder={t("searchPlaceholder")}
        onSearchChange={setQuery}
        dateRange={dateRange}
        onDateRangeChange={setDateRange}
        dateLabels={{
          all: tStories("dateAll"),
          last7: tStories("dateLast7"),
          last30: tStories("dateLast30"),
          last90: tStories("dateLast90"),
          custom: tStories("dateCustom"),
          from: tStories("dateFrom"),
          to: tStories("dateTo"),
        }}
        primarySelect={
          profileOptions.length > 1
            ? {
                value: profileFilter,
                allLabel: tStories("filterAll"),
                options: profileOptions,
                onChange: setProfileFilter,
              }
            : undefined
        }
        secondarySelect={{
          value: statusFilter,
          allLabel: t("statusAll"),
          options: statusOptions.map((status) => ({
            value: status,
            label: t(`status.${status}`),
          })),
          onChange: setStatusFilter,
        }}
      />

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-night-100 bg-white p-12 text-center">
          <div className="text-4xl" aria-hidden>
            🔍
          </div>
          <p className="mt-4 font-bold text-night-600">{t("noResults")}</p>
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setProfileFilter("");
              setStatusFilter("");
              setDateRange(defaultDateRange);
            }}
            className="mt-3 text-sm text-night-400 underline"
          >
            {tStories("clearFilters")}
          </button>
        </div>
      ) : (
        <div className="grid gap-4">
          {filtered.map((project) => {
            const title =
              getBookTitle(project, storyTitleById) ?? t("untitledBook");
            const profileName = profileNameById.get(project.profileId);

            return (
              <article
                key={project.id}
                className="rounded-3xl border border-night-100 bg-white p-6 shadow-sm transition hover:border-star-200 hover:shadow-md"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="font-display text-2xl font-bold text-night-800">
                      {title}
                    </h2>
                    <p className="mt-1 text-sm text-night-500">
                      {profileName
                        ? `${tStories("forProfile", { name: profileName })} · `
                        : ""}
                      {formatLocalShortDate(project.createdAt)}
                    </p>
                    <p className="mt-3 text-sm font-bold uppercase tracking-wide text-star-600">
                      {project.currentStageLabel}
                    </p>
                    <p className="mt-1 text-sm text-night-500">
                      {t("spreadProgress", {
                        completed: project.completedSpreads,
                        total: project.totalSpreads,
                      })}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-night-50 px-4 py-3 text-sm font-bold text-night-600">
                    {t(`status.${project.status}`)}
                  </div>
                </div>
                <div className="mt-5 flex flex-wrap gap-2">
                  <Link
                    href={`/books/${project.id}` as string}
                    className="storycot-btn storycot-btn-primary storycot-btn-compact"
                  >
                    {t("viewBookButton")}
                  </Link>
                  <DeleteBookButton
                    bookId={project.id}
                    redirectTo="/books"
                    compact
                  />
                </div>
              </article>
            );
          })}
        </div>
      )}

      {filtered.length > 0 && filtered.length < projects.length ? (
        <p className="mt-4 text-center text-sm text-night-400">
          {t("showingCount", {
            showing: filtered.length,
            total: projects.length,
          })}
        </p>
      ) : null}
    </>
  );
}
