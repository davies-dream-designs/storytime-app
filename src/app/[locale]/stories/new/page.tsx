"use client";

import { Suspense, useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useRouter, Link } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { useLocale } from "next-intl";
import Nav from "@/components/Nav";
import Button from "@/components/ui/Button";
import Icon from "@/components/ui/Icon";
import { buttonClassName } from "@/components/ui/buttonStyles";
import { choiceCardClassName, formStyles } from "@/components/ui/formStyles";
import { useConfirmDialog } from "@/components/ui/useConfirmDialog";
import type {
  ChildProfile,
  StoryPerson,
  StorySuggestion,
  StoryPreset,
} from "@/types";
import {
  STORY_PRESETS,
  LESSON_OPTIONS,
  buildChildAppearanceSummary,
  formatAge,
  getStoryPersonRelationshipLabel,
  getDefaultPreset,
  getAge,
  getAgeInMonths,
} from "@/types";
import { assessStoryIdeaIp } from "@/lib/ipGuardrails";
import type { LocationFixture } from "@/types/printBook";

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
  confidence: "⭐",
  "calm bedtime": "🌙",
  listening: "👂",
  "gentle routines": "🛏️",
  "problem solving": "🧩",
  curiosity: "🔎",
  "being helpful": "🤲",
  "self belief": "🌟",
};

const FALLBACK_THEME_OPTIONS = [
  "calm bedtime",
  "kindness",
  "bravery",
  "friendship",
  "confidence",
] as const;

const CHILD_CAST_ID_PREFIX = "child:";
const MAX_SUPPORTING_CAST = 3;
const MAX_VISIBLE_SUGGESTIONS = 9;
const MAX_STORY_LOCATIONS = 5;

function buildChildCastId(profileId: string): string {
  return `${CHILD_CAST_ID_PREFIX}${profileId}`;
}

function childProfileToCastPerson(profile: ChildProfile): StoryPerson {
  const appearance =
    profile.appearanceSummary ||
    buildChildAppearanceSummary(profile.appearance);
  return {
    id: buildChildCastId(profile.id),
    userId: profile.userId,
    name: profile.name,
    relationship: "sibling",
    pronouns:
      profile.gender && profile.gender !== "not_specified"
        ? profile.gender.replace("_", " ")
        : undefined,
    description: `Child profile, ${formatAge(profile)} old.`,
    personality: [
      ...(profile.lessons ?? []).slice(0, 3),
      ...(profile.favouriteActivities ?? []).slice(0, 2),
    ].join(", "),
    appearance,
    appearanceSummary: appearance,
    avatarImageUrl: profile.avatarImageUrl,
    availableToAllProfiles: true,
    profileIds: [],
    createdAt: profile.createdAt,
    updatedAt: profile.createdAt,
  };
}

function locationFixtureLabel(fixture: LocationFixture): string {
  return fixture.area ? `${fixture.place} (${fixture.area})` : fixture.place;
}

const SAFETY_ERRORS: Record<
  string,
  { emoji: string; heading: string; sub: string }
> = {
  sexual_content: {
    emoji: "🙈",
    heading: "That idea's a little too grown-up!",
    sub: "Try something magical — like a dragon who loves baking, or a robot on a secret mission.",
  },
  child_exploitation: {
    emoji: "🛡️",
    heading: "That one's a no-go for safety reasons.",
    sub: "How about a brave explorer, a silly friendship, or a magical mystery instead?",
  },
  violence_or_peril: {
    emoji: "🌈",
    heading: "Storycot stories are all about warm adventures!",
    sub: "Try a quest to find missing cookies, a journey to the moon, or a dancing cloud who makes it rain chocolate.",
  },
  self_harm: {
    emoji: "💙",
    heading: "That's one we can't work with.",
    sub: "Let's make something beautiful instead — a story about courage, kindness, or a big cozy adventure.",
  },
  substances: {
    emoji: "🍭",
    heading: "No room for that in a kids' story!",
    sub: "Try a candy-powered rocket, a talking cloud, or a puppy's first big day in the city.",
  },
  bathroom_or_bathing: {
    emoji: "🛁",
    heading: "Bathtime doesn't quite work in illustrated books!",
    sub: "But a bubble-breathing dragon or a rubber duck detective? Now we're talking! 🦆",
  },
  hate_or_harassment: {
    emoji: "💛",
    heading: "Storycot is all about kindness and joy!",
    sub: "Try a story about making new friends, celebrating differences, or going on a magical adventure together.",
  },
};

function StoryErrorCard({
  category,
  message,
}: {
  category: string | null;
  message: string;
}) {
  const matched = category ? SAFETY_ERRORS[category] : null;

  if (matched) {
    return (
      <div className="rounded-2xl border-2 border-blush-200 bg-blush-50 px-5 py-4">
        <p className="text-2xl">{matched.emoji}</p>
        <p className="mt-2 font-display font-bold text-blush-700">
          {matched.heading}
        </p>
        <p className="mt-1 text-sm text-blush-600">{matched.sub}</p>
        <p className="mt-3 text-xs text-blush-400">
          Edit your idea above and try again ✏️
        </p>
      </div>
    );
  }

  return <p className={formStyles.error}>{message}</p>;
}

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
  const [selectedTheme, setSelectedTheme] = useState("calm bedtime");
  const [storyPeople, setStoryPeople] = useState<StoryPerson[]>([]);
  const [savedLocations, setSavedLocations] = useState<LocationFixture[]>([]);
  const [selectedLocationFixtureIds, setSelectedLocationFixtureIds] = useState<
    string[]
  >([]);
  const [customLocationHint, setCustomLocationHint] = useState("");
  const [selectedStoryPersonIds, setSelectedStoryPersonIds] = useState<
    string[]
  >([]);
  const [loadingStoryPeople, setLoadingStoryPeople] = useState(false);
  const [builderIdea, setBuilderIdea] = useState("");
  const [notes, setNotes] = useState("");
  const [storyPreset, setStoryPreset] =
    useState<StoryPreset>("moonlit-adventures");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [errorCategory, setErrorCategory] = useState<string | null>(null);
  const [profilesError, setProfilesError] = useState("");
  const [creditInfo, setCreditInfo] = useState<{
    credits: number;
    isAdmin: boolean;
  } | null>(null);
  const { confirm, ConfirmDialog } = useConfirmDialog();

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
        const initial = defaultProfileId
          ? data.find((p) => p.id === defaultProfileId)
          : data[0];
        if (initial) {
          setProfileId(initial.id);
          setSelectedTheme(initial.lessons[0] ?? "calm bedtime");
          setStoryPreset(
            getDefaultPreset(getAge(initial), getAgeInMonths(initial))
          );
        }
      })
      .catch((err) => {
        setProfilesError(
          err instanceof Error ? err.message : "Could not load profiles"
        );
      })
      .finally(() => setLoadingProfiles(false));
  }, [defaultProfileId]);

  useEffect(() => {
    fetch("/api/user/credits")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          setCreditInfo(data as { credits: number; isAdmin: boolean });
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/location-fixtures")
      .then((r) => (r.ok ? (r.json() as Promise<LocationFixture[]>) : []))
      .then((fixtures) => setSavedLocations(fixtures))
      .catch(() => setSavedLocations([]));
  }, []);

  useEffect(() => {
    if (!profileId) {
      setStoryPeople([]);
      setSelectedStoryPersonIds([]);
      return;
    }

    setLoadingStoryPeople(true);
    fetch(`/api/story-people?profileId=${encodeURIComponent(profileId)}`)
      .then((r) => (r.ok ? (r.json() as Promise<StoryPerson[]>) : []))
      .then((people) => {
        setStoryPeople(people);
        setSelectedStoryPersonIds((current) => {
          const allowedIds = new Set([
            ...people.map((person) => person.id),
            ...profiles
              .filter((profile) => profile.id !== profileId)
              .map((profile) => buildChildCastId(profile.id)),
          ]);
          return current
            .filter((id) => allowedIds.has(id))
            .slice(0, MAX_SUPPORTING_CAST);
        });
      })
      .catch(() => {
        setStoryPeople([]);
        setSelectedStoryPersonIds([]);
      })
      .finally(() => setLoadingStoryPeople(false));
  }, [profileId, profiles]);

  async function fetchSuggestions(pid: string, fresh = false) {
    if (!pid) return;
    setLoadingSuggestions(true);
    if (!fresh) setSuggestions([]);
    if (!fresh) setSelectedSuggestion(null);
    try {
      const res = await fetch("/api/stories/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileId: pid,
          locale,
          fresh,
          theme: selectedTheme,
          storyPersonIds: selectedStoryPersonIds,
          locationHint: resolvedLocationHint || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        const nextSuggestions = Array.isArray(data)
          ? (data as StorySuggestion[])
          : [];
        setSuggestions((current) => {
          if (!fresh) return nextSuggestions.slice(0, MAX_VISIBLE_SUGGESTIONS);
          const seen = new Set(
            current.map(
              (suggestion) =>
                `${suggestion.title.trim()}|${suggestion.premise.trim()}`
            )
          );
          const uniqueNew = nextSuggestions.filter((suggestion) => {
            const key = `${suggestion.title.trim()}|${suggestion.premise.trim()}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
          return [...current, ...uniqueNew].slice(0, MAX_VISIBLE_SUGGESTIONS);
        });
      }
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
    setSelectedStoryPersonIds([]);
    setBuilderIdea("");
    const profile = profiles.find((p) => p.id === pid);
    if (profile) {
      setSelectedTheme(profile.lessons[0] ?? "calm bedtime");
      setStoryPreset(
        getDefaultPreset(getAge(profile), getAgeInMonths(profile))
      );
    }
  }

  function toggleSavedLocation(locationFixtureId: string) {
    setSelectedLocationFixtureIds((current) =>
      current.includes(locationFixtureId)
        ? current.filter((id) => id !== locationFixtureId)
        : current.length >= MAX_STORY_LOCATIONS
          ? current
          : [...current, locationFixtureId]
    );
    setSuggestions([]);
    setSelectedSuggestion(null);
  }

  function updateCustomLocationHint(nextValue: string) {
    setCustomLocationHint(nextValue);
    setSuggestions([]);
    setSelectedSuggestion(null);
  }

  function buildBuilderPremise() {
    return builderIdea.trim();
  }

  async function handleGenerate() {
    setError("");
    setErrorCategory(null);
    const premise = buildBuilderPremise();
    if (!profileId) {
      setError(t("errorNoProfile"));
      return;
    }
    if (!selectedSuggestion && !builderIdea.trim()) {
      setError(t("errorNoIdea"));
      return;
    }
    if (creditInfo && !creditInfo.isAdmin && creditInfo.credits < 1) {
      setError(t("noCreditsBody"));
      return;
    }
    const confirmed = await confirm({
      title: "Generate Story",
      message: t("creditConfirm"),
      confirmLabel: t("generateButton2"),
    });
    if (!confirmed) return;

    setGenerating(true);
    try {
      const body = selectedSuggestion
        ? {
            profileId,
            theme: selectedTheme,
            premise: selectedSuggestion.premise,
            notes,
            locationHint: resolvedLocationHint || undefined,
            locationFixtureId: selectedLocationFixtures[0]?.id,
            locationFixtureIds: selectedLocationFixtures.map(
              (fixture) => fixture.id
            ),
            storyPreset,
            storyPersonIds: selectedStoryPersonIds,
            locale,
          }
        : {
            profileId,
            theme: selectedTheme,
            premise,
            notes,
            locationHint: resolvedLocationHint || undefined,
            locationFixtureId: selectedLocationFixtures[0]?.id,
            locationFixtureIds: selectedLocationFixtures.map(
              (fixture) => fixture.id
            ),
            storyPreset,
            storyPersonIds: selectedStoryPersonIds,
            locale,
          };

      const res = await fetch("/api/stories/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as {
        id?: string;
        error?: string;
        code?: string;
        category?: string;
      };
      if (!res.ok || !data.id) {
        setError(data.error ?? "Could not start the story");
        setErrorCategory(data.category ?? null);
        setGenerating(false);
        return;
      }
      router.push(`/stories/${data.id}` as string);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setErrorCategory(null);
      setGenerating(false);
    }
  }

  const selectedProfile = profiles.find((p) => p.id === profileId);
  const themeOptions = Array.from(
    new Set([
      ...(selectedProfile?.lessons ?? []),
      ...FALLBACK_THEME_OPTIONS,
      ...LESSON_OPTIONS.slice(0, 5),
    ])
  ).slice(0, 8);
  const ipPolicyPreview = assessStoryIdeaIp({
    theme: selectedTheme,
    premise: selectedSuggestion?.premise ?? buildBuilderPremise(),
    notes,
  });

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
  const readyToGenerate =
    profileId && (selectedSuggestion || builderIdea.trim());
  const outOfCredits =
    creditInfo !== null && !creditInfo.isAdmin && creditInfo.credits < 1;
  const canGetMoreIdeas =
    suggestions.length > 0 && suggestions.length < MAX_VISIBLE_SUGGESTIONS;
  const childCastPeople = profiles
    .filter((profile) => profile.id !== profileId)
    .map(childProfileToCastPerson);
  const castPeople = [...childCastPeople, ...storyPeople];
  const selectedStoryPeople = castPeople.filter((person) =>
    selectedStoryPersonIds.includes(person.id)
  );
  const selectedCastNames = [
    selectedProfile?.name,
    ...selectedStoryPeople.map((person) => person.name),
  ].filter(Boolean);
  const selectedCastLabel = selectedCastNames.join(", ");
  const selectedLocationFixtures = selectedLocationFixtureIds
    .map((id) => savedLocations.find((fixture) => fixture.id === id))
    .filter((fixture): fixture is LocationFixture => Boolean(fixture));
  const resolvedLocationHint = [
    ...selectedLocationFixtures.map(locationFixtureLabel),
    customLocationHint.trim(),
  ]
    .filter(Boolean)
    .join("; ");

  function toggleStoryPerson(id: string) {
    setSelectedStoryPersonIds((current) =>
      current.includes(id)
        ? current.filter((currentId) => currentId !== id)
        : current.length >= MAX_SUPPORTING_CAST
          ? current
          : [...current, id]
    );
    setSuggestions([]);
    setSelectedSuggestion(null);
  }

  return (
    <>
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

          {profileId && (
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
                      className={choiceCardClassName(
                        storyPreset === key,
                        "w-full p-3.5 text-left"
                      )}
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

              <div>
                <p className="mb-2 text-sm font-bold uppercase tracking-wide text-night-400">
                  {t("themeLabel")}
                </p>
                <div className="flex flex-wrap gap-2">
                  {themeOptions.map((theme) => (
                    <button
                      key={theme}
                      type="button"
                      onClick={() => {
                        setSelectedTheme(theme);
                        setSuggestions([]);
                        setSelectedSuggestion(null);
                      }}
                      className={`rounded-full px-3 py-1.5 text-sm font-bold transition ${
                        selectedTheme === theme
                          ? "bg-night-700 text-moon-200"
                          : "bg-white text-night-600 hover:bg-night-50"
                      }`}
                    >
                      {theme}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-night-100 bg-white/70 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-display font-bold text-night-800">
                      Who&rsquo;s In This Story?
                    </p>
                    <p className="mt-1 text-sm leading-6 text-night-500">
                      {selectedProfile?.name} is always included. Choose up to{" "}
                      {MAX_SUPPORTING_CAST} extra people, pets, or children.
                    </p>
                  </div>
                  <Link
                    href="/family"
                    className={buttonClassName({
                      variant: "secondary",
                      size: "compact",
                      className: "shrink-0",
                    })}
                  >
                    <Icon name="profile" />
                    Manage
                  </Link>
                </div>

                {selectedProfile ? (
                  <div className="mt-4 rounded-xl border-2 border-night-700 bg-night-700 p-3 text-moon-100">
                    <div className="flex items-center gap-3">
                      {selectedProfile.avatarImageUrl ? (
                        <span
                          className="h-11 w-11 shrink-0 rounded-full bg-cover bg-center ring-2 ring-moon-200"
                          style={{
                            backgroundImage: `url("${selectedProfile.avatarImageUrl}")`,
                          }}
                          aria-hidden="true"
                        />
                      ) : (
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-moon-200 font-display font-bold text-night-800">
                          {selectedProfile.name[0]?.toUpperCase()}
                        </span>
                      )}
                      <span className="min-w-0">
                        <span className="block text-xs font-bold uppercase tracking-wide text-moon-300">
                          Main Child
                        </span>
                        <span className="block truncate font-display text-lg font-bold">
                          {selectedProfile.name}
                        </span>
                        <span className="block text-xs font-semibold text-moon-300">
                          Always included
                        </span>
                      </span>
                    </div>
                  </div>
                ) : null}

                {loadingStoryPeople ? (
                  <p className="mt-3 text-sm text-night-400">
                    Loading family and friends...
                  </p>
                ) : castPeople.length > 0 ? (
                  <>
                    <div className="mt-4 flex items-center justify-between gap-3 text-xs font-bold uppercase tracking-wide text-night-400">
                      <span>Supporting Cast</span>
                      <span>
                        {selectedStoryPersonIds.length}/{MAX_SUPPORTING_CAST}
                      </span>
                    </div>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      {castPeople.map((person) => {
                        const selected = selectedStoryPersonIds.includes(
                          person.id
                        );
                        const disabled =
                          !selected &&
                          selectedStoryPersonIds.length >= MAX_SUPPORTING_CAST;
                        const isChildProfile =
                          person.id.startsWith(CHILD_CAST_ID_PREFIX);
                        return (
                          <button
                            key={person.id}
                            type="button"
                            onClick={() => toggleStoryPerson(person.id)}
                            disabled={disabled}
                            className={`${choiceCardClassName(
                              selected,
                              "flex min-h-20 items-center gap-3 rounded-xl p-3 text-left"
                            )} disabled:cursor-not-allowed disabled:opacity-45`}
                          >
                            {person.avatarImageUrl ? (
                              <span
                                className="h-10 w-10 shrink-0 rounded-full bg-cover bg-center"
                                style={{
                                  backgroundImage: `url("${person.avatarImageUrl}")`,
                                }}
                                aria-hidden="true"
                              />
                            ) : (
                              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-moon-100 font-display font-bold text-night-700">
                                {person.name[0]?.toUpperCase()}
                              </span>
                            )}
                            <span className="min-w-0">
                              <span className="block truncate font-bold text-night-800">
                                {person.name}
                              </span>
                              <span className="block text-xs capitalize text-night-400">
                                {isChildProfile
                                  ? "Child profile"
                                  : getStoryPersonRelationshipLabel(person)}
                              </span>
                              {selected ? (
                                <span className="mt-1 inline-block rounded-full bg-star-100 px-2 py-0.5 text-[11px] font-bold text-star-700">
                                  Selected
                                </span>
                              ) : null}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <div className="mt-4 rounded-xl border border-dashed border-night-200 bg-white px-4 py-3">
                    <p className="text-sm font-bold text-night-700">
                      No Family & Friends yet
                    </p>
                    <p className="mt-1 text-sm leading-6 text-night-500">
                      Add family members, friends, or pets once and reuse them
                      across children.
                    </p>
                  </div>
                )}

                {selectedStoryPeople.length > 0 ? (
                  <p className="mt-3 text-xs font-semibold text-night-400">
                    Extra cast selected:{" "}
                    {selectedStoryPeople
                      .map((person) => person.name)
                      .join(", ")}
                  </p>
                ) : castPeople.length > 0 ? (
                  <p className="mt-3 text-xs font-semibold text-night-400">
                    No extra cast selected. The story will focus on{" "}
                    {selectedProfile?.name}.
                  </p>
                ) : null}
              </div>

              <div className="rounded-2xl border border-night-100 bg-white/70 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-display font-bold text-night-800">
                      Special Place (Optional)
                    </p>
                    <p className="mt-1 text-sm leading-6 text-night-500">
                      Pick one or more saved locations, or type a one-off place.
                      Storycot will weave them into natural parts of the story
                      without forcing every page to stay there.
                    </p>
                  </div>
                  <Link
                    href="/locations"
                    className={buttonClassName({
                      variant: "secondary",
                      size: "compact",
                      className: "shrink-0",
                    })}
                  >
                    <Icon name="dashboard" />
                    Manage
                  </Link>
                </div>

                <div className="mt-4 space-y-4">
                  <div>
                    <label className={formStyles.subLabel}>
                      Saved locations
                    </label>
                    {savedLocations.length > 0 ? (
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        {savedLocations.map((fixture) => {
                          const selected = selectedLocationFixtureIds.includes(
                            fixture.id
                          );
                          const disabled =
                            !selected &&
                            selectedLocationFixtureIds.length >=
                              MAX_STORY_LOCATIONS;
                          return (
                            <button
                              key={fixture.id}
                              type="button"
                              onClick={() => toggleSavedLocation(fixture.id)}
                              disabled={disabled}
                              className={`rounded-2xl border p-3 text-left transition ${
                                selected
                                  ? "border-star-400 bg-star-50 shadow-sm"
                                  : "border-night-100 bg-white/75 hover:border-star-200"
                              } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
                            >
                              <div className="flex gap-3">
                                {fixture.establishingImageUrl ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={fixture.establishingImageUrl}
                                    alt={locationFixtureLabel(fixture)}
                                    className="h-14 w-14 shrink-0 rounded-xl object-cover"
                                  />
                                ) : (
                                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-xl">
                                    📍
                                  </div>
                                )}
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span
                                      className={`h-4 w-4 rounded border ${
                                        selected
                                          ? "border-star-500 bg-star-400"
                                          : "border-night-300 bg-white"
                                      }`}
                                    />
                                    <p className="truncate font-bold text-night-800">
                                      {locationFixtureLabel(fixture)}
                                    </p>
                                  </div>
                                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-night-500">
                                    {fixture.summary ||
                                      fixture.notes ||
                                      "Saved location ready to reuse."}
                                  </p>
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="mt-2 rounded-xl bg-night-50 p-3 text-sm text-night-500">
                        No saved locations yet. Add bedrooms, lounges, gardens,
                        or other familiar places from the Locations page.
                      </p>
                    )}
                    <p className="mt-2 text-xs text-night-400">
                      Choose up to {MAX_STORY_LOCATIONS} saved rooms/places.
                      Storycot will map each selected area into the book&apos;s
                      Location Bible and reuse its saved illustration where the
                      story visits it.
                    </p>
                  </div>

                  <div>
                    <label className={formStyles.subLabel}>
                      Optional one-off place
                    </label>
                    <input
                      value={customLocationHint}
                      onChange={(event) =>
                        updateCustomLocationHint(event.target.value)
                      }
                      placeholder="e.g. Grandma's lounge, the cubby house, or our local beach"
                      className={formStyles.field}
                    />
                  </div>

                  {selectedLocationFixtures.length > 0 ? (
                    <div className="rounded-2xl border border-star-200 bg-star-50 p-3">
                      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-night-500">
                        Selected story places
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {selectedLocationFixtures.map((fixture) => (
                          <span
                            key={fixture.id}
                            className="rounded-full bg-white px-3 py-1 text-xs font-bold text-night-700 shadow-sm"
                          >
                            {locationFixtureLabel(fixture)}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="rounded-2xl border border-night-100 bg-white/70 p-4">
                <div>
                  <p className="font-display font-bold text-night-800">
                    Write A Story Idea
                  </p>
                  <p className="mt-1 text-sm leading-6 text-night-500">
                    Use this if you already know the plot. Otherwise, get ideas
                    using the selected cast and theme.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold uppercase tracking-wide">
                    <span className="rounded-full bg-moon-100 px-3 py-1 text-night-600">
                      Cast: {selectedCastLabel || selectedProfile?.name}
                    </span>
                    <span className="rounded-full bg-star-100 px-3 py-1 text-night-700">
                      Theme: {selectedTheme}
                    </span>
                    {resolvedLocationHint ? (
                      <span className="rounded-full bg-sky-100 px-3 py-1 text-sky-700">
                        Places: {resolvedLocationHint}
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="mt-3 space-y-3">
                  <div>
                    <label className={formStyles.subLabel}>Story Idea</label>
                    <textarea
                      value={builderIdea}
                      onChange={(event) => {
                        setBuilderIdea(event.target.value);
                        setSelectedSuggestion(null);
                      }}
                      rows={3}
                      placeholder={t("storyIdeaPlaceholder", {
                        name: selectedProfile?.name ?? "Bailey",
                      })}
                      className={formStyles.textarea}
                    />
                  </div>
                </div>
              </div>

              {!showIdeas && (
                <div className="space-y-2">
                  <p className="text-xs text-night-400">
                    {selectedCastLabel
                      ? `Ideas will be based on ${selectedCastLabel}, "${selectedTheme}", and ${resolvedLocationHint ? `visits to ${resolvedLocationHint}` : "your selected story details"}.`
                      : t("getIdeasHint")}
                  </p>
                  <button
                    type="button"
                    onClick={() => fetchSuggestions(profileId)}
                    className="w-full rounded-xl border-2 border-dashed border-night-300 py-3 text-sm font-bold text-night-600 transition hover:border-star-400 hover:text-star-600"
                  >
                    {selectedCastLabel
                      ? `Get 3 Ideas For This Cast`
                      : t("getIdeas", { name: selectedProfile?.name ?? "" })}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {showIdeas && (
          <div>
            <p className="mb-3 text-sm font-bold uppercase tracking-wide text-night-400">
              {t("stepChoose")}
            </p>
            <p className="mb-3 text-sm leading-6 text-night-500">
              These ideas use {selectedCastLabel || selectedProfile?.name}, the{" "}
              <span className="font-bold text-night-700">{selectedTheme}</span>{" "}
              theme
              {resolvedLocationHint
                ? `, and visits to ${resolvedLocationHint}`
                : ""}
              .
            </p>
            {loadingSuggestions && suggestions.length === 0 ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-24 animate-pulse rounded-2xl bg-night-100"
                  />
                ))}
                <p className="text-center text-sm text-night-400">
                  {t("loadingSuggestions", {
                    name: selectedProfile?.name ?? "",
                  })}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {suggestions.map((s, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setSelectedSuggestion(s)}
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
                        <p className="mt-1 text-sm text-night-500">
                          {s.premise}
                        </p>
                        <span className="mt-2 inline-block rounded-full bg-night-100 px-2.5 py-0.5 text-xs font-bold text-night-500">
                          {t("themeBadge", { theme: s.theme || selectedTheme })}
                        </span>
                      </div>
                    </div>
                  </button>
                ))}

                {loadingSuggestions ? (
                  <div className="rounded-2xl border border-dashed border-night-200 bg-white/70 p-4 text-center text-sm font-bold text-night-400">
                    Finding more different ideas...
                  </div>
                ) : null}

                <p className="text-xs text-night-400">{t("suggestionsNote")}</p>
                {canGetMoreIdeas ? (
                  <button
                    type="button"
                    onClick={() => fetchSuggestions(profileId, true)}
                    disabled={loadingSuggestions}
                    className="w-full rounded-xl border border-night-200 bg-white py-3 text-sm font-bold text-night-600 transition hover:bg-night-50"
                  >
                    {t("getMoreIdeas")}
                  </button>
                ) : null}
              </div>
            )}
          </div>
        )}

        {profileId && (
          <>
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

            {ipPolicyPreview.riskLevel === "originalized" ? (
              <div className="rounded-2xl border border-star-200 bg-star-50 px-4 py-3 text-sm leading-6 text-night-700">
                <p className="font-bold text-night-800">
                  We’ll make this an original Storycot version
                </p>
                <p className="mt-1">
                  For downloads and Australian print ordering, Storycot avoids
                  protected characters, brands, logos, celebrities, and
                  recognisable source worlds. We’ll keep the broad feeling of
                  the idea but use new original characters and settings.
                </p>
              </div>
            ) : (
              <div className="rounded-2xl border border-night-100 bg-white/70 px-4 py-3 text-sm leading-6 text-night-500">
                <p className="font-bold text-night-700">
                  Original stories can be printed
                </p>
                <p className="mt-1">
                  Printed hardcovers are only available for stories made from
                  original characters, settings, images, and story details that
                  you have the right to use.
                </p>
              </div>
            )}

            {error && (
              <StoryErrorCard category={errorCategory} message={error} />
            )}

            {outOfCredits ? (
              <div className="rounded-2xl border border-blush-200 bg-blush-50 px-5 py-4 text-sm text-blush-700">
                <p className="font-display font-bold">{t("noCreditsTitle")}</p>
                <p className="mt-1">{t("noCreditsBody")}</p>
                <Link
                  href="/account"
                  className={buttonClassName({
                    size: "compact",
                    className: "mt-3",
                  })}
                >
                  <Icon name="account" />
                  {t("topUpCredits")}
                </Link>
              </div>
            ) : readyToGenerate ? (
              <div className="space-y-3">
                <p className="rounded-2xl border border-night-100 bg-white/70 px-4 py-3 text-center text-sm font-bold text-night-600">
                  {t("creditNotice")}
                </p>
                <Button
                  onClick={handleGenerate}
                  disabled={generating}
                  fullWidth
                  size="large"
                  className="font-display"
                >
                  {generating ? (
                    <span className="flex items-center justify-center gap-2">
                      <Icon name="sparkle" className="h-4 w-4 animate-spin" />
                      {t("generating")}
                    </span>
                  ) : (
                    t("generateButton2")
                  )}
                </Button>
              </div>
            ) : null}

            {generating && (
              <p className="text-center text-sm text-night-400">
                {t("generatingSub")}
              </p>
            )}
          </>
        )}
      </div>
      <ConfirmDialog />
    </>
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
