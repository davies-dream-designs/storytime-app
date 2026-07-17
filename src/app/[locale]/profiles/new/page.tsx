"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import Nav from "@/components/Nav";
import Button from "@/components/ui/Button";
import { formStyles } from "@/components/ui/formStyles";
import AppearanceFields from "@/components/profiles/AppearanceFields";
import {
  BirthdayFields,
  LessonsField,
  TagsField,
} from "@/components/profiles/ProfileFormControls";
import { createEmptyChildAppearance, type ChildAppearance } from "@/types";

export default function NewProfilePage() {
  const router = useRouter();
  const t = useTranslations("profiles");
  const [name, setName] = useState("");
  const [dobDay, setDobDay] = useState("");
  const [dobMonth, setDobMonth] = useState("");
  const [dobYear, setDobYear] = useState("");
  const [favouriteCharacters, setFavouriteCharacters] = useState<string[]>([]);
  const [favouriteActivities, setFavouriteActivities] = useState<string[]>([]);
  const [favouriteAnimals, setFavouriteAnimals] = useState<string[]>([]);
  const [favouritePlaces, setFavouritePlaces] = useState<string[]>([]);
  const [lessons, setLessons] = useState<string[]>([]);
  const [appearance, setAppearance] = useState<ChildAppearance>(
    createEmptyChildAppearance()
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const MONTH_KEYS = [
    "months.1",
    "months.2",
    "months.3",
    "months.4",
    "months.5",
    "months.6",
    "months.7",
    "months.8",
    "months.9",
    "months.10",
    "months.11",
    "months.12",
  ] as const;
  const MONTHS = MONTH_KEYS.map((key, i) => ({ value: i + 1, label: t(key) }));

  async function getErrorMessage(
    res: Response,
    fallback: string
  ): Promise<string> {
    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const data = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      return data?.error ?? fallback;
    }

    const text = await res.text().catch(() => "");
    if (text.includes("<")) return fallback;
    return text || fallback;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!name.trim()) {
      setError(t("errorName"));
      return;
    }
    if (!dobYear) {
      setError(t("errorYear"));
      return;
    }

    const year = parseInt(dobYear, 10);
    const month = dobMonth ? parseInt(dobMonth, 10) : null;
    const day = dobDay ? parseInt(dobDay, 10) : null;

    const dateOfBirth =
      month && day
        ? `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
        : month
          ? `${year}-${String(month).padStart(2, "0")}-01`
          : `${year}-01-01`;

    const today = new Date();
    const dob = new Date(dateOfBirth);
    const age =
      today.getFullYear() -
      dob.getFullYear() -
      (today < new Date(today.getFullYear(), dob.getMonth(), dob.getDate())
        ? 1
        : 0);

    setSaving(true);
    try {
      const res = await fetch("/api/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          age,
          dateOfBirth,
          appearance,
          favouriteCharacters,
          favouriteActivities,
          favouriteAnimals,
          favouritePlaces,
          lessons,
        }),
      });
      if (!res.ok)
        throw new Error(await getErrorMessage(res, "Could not create profile"));
      const profile = await res.json();
      router.push(`/profiles/${profile.id}` as string);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setSaving(false);
    }
  }

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

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className={formStyles.label} htmlFor="name">
              {t("nameLabel")}
            </label>
            <input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("namePlaceholder")}
              className={formStyles.field}
            />
          </div>

          <BirthdayFields
            title={t("birthdayLabel")}
            hint={t("birthdayHint")}
            dayLabel={t("dayLabel")}
            monthLabel={t("monthLabel")}
            yearLabel={t("yearLabel")}
            months={MONTHS}
            day={dobDay}
            month={dobMonth}
            year={dobYear}
            onDayChange={setDobDay}
            onMonthChange={setDobMonth}
            onYearChange={setDobYear}
          />

          <TagsField
            label={t("charsLabel")}
            values={favouriteCharacters}
            onChange={setFavouriteCharacters}
            placeholder={t("charsPlaceholder")}
          />
          <TagsField
            label={t("activitiesLabel")}
            values={favouriteActivities}
            onChange={setFavouriteActivities}
            placeholder={t("activitiesPlaceholder")}
          />
          <TagsField
            label={t("animalsLabel")}
            values={favouriteAnimals}
            onChange={setFavouriteAnimals}
            placeholder={t("animalsPlaceholder")}
          />
          <TagsField
            label={t("placesLabel")}
            values={favouritePlaces}
            onChange={setFavouritePlaces}
            placeholder={t("placesPlaceholder")}
          />

          <AppearanceFields appearance={appearance} onChange={setAppearance} />

          <LessonsField
            label={t("lessonsLabel")}
            values={lessons}
            onChange={setLessons}
          />

          {error && <p className={formStyles.error}>{error}</p>}

          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => router.back()}>
              {t("cancelButton")}
            </Button>
            <Button type="submit" disabled={saving} fullWidth>
              {saving ? "…" : t("createButton")}
            </Button>
          </div>
        </form>
      </main>
    </>
  );
}
