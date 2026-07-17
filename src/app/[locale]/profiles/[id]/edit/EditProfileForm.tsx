"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import Button from "@/components/ui/Button";
import { formStyles } from "@/components/ui/formStyles";
import AppearanceFields from "@/components/profiles/AppearanceFields";
import {
  BirthdayFields,
  fallbackBirthYear,
  LessonsField,
  parseDateOfBirth,
  TagsField,
} from "@/components/profiles/ProfileFormControls";
import { createEmptyChildAppearance, type ChildProfile } from "@/types";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
].map((label, index) => ({ value: index + 1, label }));

export default function EditProfileForm({
  profile,
}: {
  profile: ChildProfile;
}) {
  const router = useRouter();
  const initial = parseDateOfBirth(profile.dateOfBirth);

  const [name, setName] = useState(profile.name);
  const [dobDay, setDobDay] = useState(initial.day);
  const [dobMonth, setDobMonth] = useState(initial.month);
  const [dobYear, setDobYear] = useState(
    initial.year || fallbackBirthYear(profile.age)
  );
  const [favouriteCharacters, setFavouriteCharacters] = useState(
    profile.favouriteCharacters
  );
  const [favouriteActivities, setFavouriteActivities] = useState(
    profile.favouriteActivities
  );
  const [favouriteAnimals, setFavouriteAnimals] = useState(
    profile.favouriteAnimals
  );
  const [favouritePlaces, setFavouritePlaces] = useState(
    profile.favouritePlaces
  );
  const [lessons, setLessons] = useState(profile.lessons);
  const [appearance, setAppearance] = useState(
    profile.appearance ?? createEmptyChildAppearance()
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

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
      setError("Name is required");
      return;
    }
    if (!dobYear) {
      setError("Birth year is required");
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
      const res = await fetch(`/api/profiles/${profile.id}`, {
        method: "PUT",
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
        throw new Error(await getErrorMessage(res, "Could not save changes"));
      router.push(`/profiles/${profile.id}`);
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
          <Button
            variant="secondary"
            size="compact"
            onClick={() => router.back()}
            className="mb-4"
          >
            Back
          </Button>
          <h1 className="font-display text-4xl font-bold text-night-800">
            Edit {profile.name}
          </h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className={formStyles.label} htmlFor="name">
              Child&apos;s name *
            </label>
            <input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={formStyles.field}
            />
          </div>

          <BirthdayFields
            title="Birthday"
            hint="Used to calculate their age for stories and to celebrate their birthday with a free story"
            dayLabel="Day"
            monthLabel="Month"
            yearLabel="Year *"
            months={MONTHS}
            day={dobDay}
            month={dobMonth}
            year={dobYear}
            onDayChange={setDobDay}
            onMonthChange={setDobMonth}
            onYearChange={setDobYear}
          />

          <TagsField
            label="Favourite characters or toys"
            values={favouriteCharacters}
            onChange={setFavouriteCharacters}
            placeholder="e.g. Piggy the astronaut pig"
          />
          <TagsField
            label="Favourite activities"
            values={favouriteActivities}
            onChange={setFavouriteActivities}
            placeholder="e.g. space, pancakes, trucks"
          />
          <TagsField
            label="Favourite animals"
            values={favouriteAnimals}
            onChange={setFavouriteAnimals}
            placeholder="e.g. elephants, dogs"
          />
          <TagsField
            label="Favourite places"
            values={favouritePlaces}
            onChange={setFavouritePlaces}
            placeholder="e.g. the beach, the park"
          />

          <AppearanceFields appearance={appearance} onChange={setAppearance} />

          <LessonsField
            label="Lessons & themes to explore"
            values={lessons}
            onChange={setLessons}
          />

          {error && <p className={formStyles.error}>{error}</p>}

          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => router.back()}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving} fullWidth>
              {saving ? "Saving…" : "Save changes ✨"}
            </Button>
          </div>
        </form>
      </main>
    </>
  );
}
