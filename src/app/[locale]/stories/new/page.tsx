"use client";

import { Suspense, useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useRouter, Link } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { useLocale } from "next-intl";
import Nav from "@/components/Nav";
import Button from "@/components/ui/Button";
import { buttonClassName } from "@/components/ui/buttonStyles";
import { choiceCardClassName, formStyles } from "@/components/ui/formStyles";
import type { ChildProfile, StorySuggestion, StoryPreset } from "@/types";
import { STORY_PRESETS, getDefaultPreset, getAge } from "@/types";

const THEME_EMOJIS: Record<string, string> = {
  kindness: "💛",
  bravery: "🦁",
  sharing: "🤝",
  "trying new things": "🌈",
  "dealing with emotions": "💭",
  friendship: "👫",
  patience: "🌿",
  honesty: "✅",
  gratitude: "🙏",
  perseverance: "💪",
};

function GenerateForm() {
  const router = useRouter();
  const t = useTranslations("stories");
  const locale = useLocale();
  const searchParams = useSearchParams();
  const defaultProfileId = searchParams.get("profileId") ?? "";

  const [profiles, setProfiles] = useState<ChildProfile[]>([]);
  const [profileId, setProfileId] = useState(defaultProfileId);
  const [loadingProfiles, setLoadingProfiles] = useState(true);
  const [suggestions, setSuggestions] = useState<StorySuggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [selectedSuggestion, setSelectedSuggestion] =
    useState<StorySuggestion | null>(null);
  const [customMode, setCustomMode] = useState(false);
  const [customTheme, setCustomTheme] = useState("");
  const [notes, setNotes] = useState("");
  const [storyPreset, setStoryPreset] = useState<StoryPreset>("moonlit-adventures");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [profilesError, setProfilesError] = useState("");

  useEffect(() => {
    fetch("/api/profiles")
      .then(async (r) => {
        if (!r.ok) {
          const data = (await r.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(data?.error ?? "Could not load profiles");
        }
        return r.json() as Promise<ChildProfile[]>;
      })
      .then((data) => {
        setProfiles(data);
        const initial = defaultProfileId ? data.find(p => p.id === defaultProfileId) : data[0];
        if (initial) {
          setProfileId(initial.id);
          setStoryPreset(getDefaultPreset(getAge(initial)));
        }
      })
      .catch((err) => {
        setProfilesError(
          err instanceof Error ? err.message : "Could not load profiles"
        );
      })
      .finally(() => setLoadingProfiles(false));
  }, [defaultProfileId]);

  async function fetchSuggestions(pid: string) {
    if (!pid) return;
    setLoadingSuggestions(true);
    setSuggestions([]);
    setSelectedSuggestion(null);
    setCustomMode(false);
    try {
      const res = await fetch("/api/stories/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId: pid, locale }),
      });
      const data = await res.json();
      if (res.ok) setSuggestions(data);
    } catch {
      /* ignore */
    } finally {
      setLoadingSuggestions(false);
    }
  }

  function selectProfile(pid: string) {
    setProfileId(pid);
    setSuggestions([]);
    setSelectedSuggestion(null);
    setCustomMode(false);
    const profile = profiles.find(p => p.id === pid);
    if (profile) setStoryPreset(getDefaultPreset(getAge(profile)));
  }

  async function handleGenerate() {
    setError("");
    if (!profileId) {
      setError(t("errorNoProfile"));
      return;
    }
    if (!selectedSuggestion && !customMode) {
      setError(t("errorNoIdea"));
      return;
    }

    setGenerating(true);
    try {
      const body = selectedSuggestion
        ? {
            profileId,
            theme: selectedSuggestion.theme,
            premise: selectedSuggestion.premise,
            notes,
            storyPreset,
            locale,
          }
        : {
            profileId,
            theme: customTheme || "a gentle adventure",
            notes,
            storyPreset,
            locale,
          };

      const res = await fetch("/api/stories/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { id?: string; error?: string };
      if (!res.ok || !data.id) {
        throw new Error(data.error ?? "Could not start the story");
      }
      router.push(`/stories/${data.id}` as string);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setGenerating(false);
    }
  }

  const selectedProfile = profiles.find((p) => p.id === profileId);

  if (loadingProfiles)
    return <p className="text-night-400">{t("loadingProfiles")}</p>;

  if (profilesError) {
    return (
      <div className={formStyles.dangerPanel}>
        <p className="font-display font-bold text-blush-700">
          {t("noProfiles")}
        </p>
        <p className="mt-2 text-sm text-blush-600">{profilesError}</p>
        <Button
          variant="danger"
          size="compact"
          onClick={() => window.location.reload()}
          className="mt-4"
        >
          Retry
        </Button>
      </div>
    );
  }

  if (profiles.length === 0) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-night-200 p-10 text-center">
        <p className="font-display font-bold text-night-600">
          {t("noProfiles")}
        </p>
        <p className="mt-1 text-sm text-night-400">{t("noProfilesSub")}</p>
        <Link
          href="/profiles/new"
          className={buttonClassName({ size: "compact", className: "mt-4" })}
        >
          {t("createProfileButton")}
        </Link>
      </div>
    );
  }

  const showIdeas = suggestions.length > 0 || loadingSuggestions;
  const readyToGenerate = profileId && (selectedSuggestion || customMode);

  return (
    <div className="space-y-8">
      <div>
        <p className="mb-3 text-sm font-bold uppercase tracking-wide text-night-400">
          {t("stepWho")}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {profiles.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => selectProfile(p.id)}
              className={choiceCardClassName(
                profileId === p.id,
                "flex items-center gap-3 rounded-xl p-4 text-left"
              )}
            >
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-star-300 to-moon-300 font-display font-bold text-night-800">
                {p.name[0].toUpperCase()}
              </div>
              <div>
                <p className="font-bold text-night-800">{p.name}</p>
                <p className="text-xs text-night-400">
                  {t("ageLabel", { age: p.age })}
                </p>
              </div>
            </button>
          ))}
        </div>

        {profileId && !showIdeas && (
          <div className="mt-5 space-y-4">
            <div>
              <p className="mb-2 text-sm font-bold uppercase tracking-wide text-night-400">
                {t("storyPresetLabel")}
              </p>
              <div className="space-y-2">
                {STORY_PRESETS.map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setStoryPreset(key)}
                    className={choiceCardClassName(storyPreset === key, "w-full p-3.5 text-left")}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-display font-bold text-night-800 text-sm">
                          {t(`storyPreset.${key}.label`)}
                        </p>
                        <p className="mt-0.5 text-xs text-night-400">
                          {t(`storyPreset.${key}.desc`)}
                        </p>
                      </div>
                      <span className="flex-shrink-0 rounded-full bg-night-100 px-2.5 py-1 text-xs font-semibold text-night-500">
                        {t(`storyPreset.${key}.ageRange`)}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={() => fetchSuggestions(profileId)}
              className="w-full rounded-xl border-2 border-dashed border-night-300 py-3 text-sm font-bold text-night-600 transition hover:border-star-400 hover:text-star-600"
            >
              {t("getIdeas", { name: selectedProfile?.name ?? "" })}
            </button>
          </div>
        )}
      </div>

      {showIdeas && (
        <div>
          <p className="mb-3 text-sm font-bold uppercase tracking-wide text-night-400">
            {t("stepChoose")}
          </p>
          {loadingSuggestions ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-24 animate-pulse rounded-2xl bg-night-100"
                />
              ))}
              <p className="text-center text-sm text-night-400">
                {t("loadingSuggestions", { name: selectedProfile?.name ?? "" })}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    setSelectedSuggestion(s);
                    setCustomMode(false);
                  }}
                  className={choiceCardClassName(
                    selectedSuggestion === s,
                    "w-full p-4 text-left"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 text-2xl">
                      {THEME_EMOJIS[s.theme] ?? "🌙"}
                    </span>
                    <div>
                      <p className="font-display font-bold text-night-800">
                        {s.title}
                      </p>
                      <p className="mt-1 text-sm text-night-500">{s.premise}</p>
                      <span className="mt-2 inline-block rounded-full bg-night-100 px-2.5 py-0.5 text-xs font-bold text-night-500">
                        {s.theme}
                      </span>
                    </div>
                  </div>
                </button>
              ))}

              <button
                type="button"
                onClick={() => {
                  setCustomMode(true);
                  setSelectedSuggestion(null);
                }}
                className={choiceCardClassName(
                  customMode,
                  "w-full p-4 text-left"
                )}
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">✏️</span>
                  <p className="font-display font-bold text-night-800">
                    {t("customOption")}
                  </p>
                </div>
              </button>

              {customMode && (
                <div className="space-y-3 rounded-2xl border border-night-100 bg-white p-4">
                  <div>
                    <label className="mb-1.5 block text-sm font-bold text-night-700">
                      {t("themeLabel")}
                    </label>
                    <input
                      value={customTheme}
                      onChange={(e) => setCustomTheme(e.target.value)}
                      placeholder={t("themePlaceholder")}
                      className={formStyles.field}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {readyToGenerate && (
        <div>
          <label className={formStyles.label}>{t("notesLabel")}</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder={t("notesPlaceholder", {
              name: selectedProfile?.name ?? "",
            })}
            className={formStyles.textarea}
          />
        </div>
      )}

      {error && <p className={formStyles.error}>{error}</p>}

      {readyToGenerate && (
        <Button
          onClick={handleGenerate}
          disabled={generating}
          fullWidth
          size="large"
          className="font-display"
        >
          {generating ? (
            <span className="flex items-center justify-center gap-2">
              <span className="animate-spin">✨</span> {t("generating")}
            </span>
          ) : (
            t("generateButton2")
          )}
        </Button>
      )}

      {generating && (
        <p className="text-center text-sm text-night-400">
          {t("generatingSub")}
        </p>
      )}
    </div>
  );
}

export default function GenerateStoryPage() {
  const t = useTranslations("stories");
  return (
    <>
      <Nav />
      <main className="mx-auto max-w-2xl px-5 py-10">
        <div className="mb-8">
          <h1 className="font-display text-4xl font-bold text-night-800">
            {t("newTitle")}
          </h1>
          <p className="mt-2 text-night-500">{t("newSub")}</p>
        </div>
        <Suspense
          fallback={<p className="text-night-400">{t("loadingProfiles")}</p>}
        >
          <GenerateForm />
        </Suspense>
      </main>
    </>
  );
}
