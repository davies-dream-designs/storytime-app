"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import Nav from "@/components/Nav";
import Button from "@/components/ui/Button";
import Icon from "@/components/ui/Icon";
import { buttonClassName } from "@/components/ui/buttonStyles";
import { formStyles } from "@/components/ui/formStyles";
import AppearanceFields from "@/components/profiles/AppearanceFields";
import {
  BirthdayFields,
  LessonsField,
  ProfileIpConfirmation,
  TagsField,
} from "@/components/profiles/ProfileFormControls";
import {
  CHILD_GENDERS,
  createEmptyChildAppearance,
  type ChildAppearance,
  type ChildGender,
} from "@/types";

type CreationMode = "description" | "photo";

type PendingPhoto = {
  file: File;
  previewUrl: string;
  consent: boolean;
  adjustment: string;
};

export default function NewProfilePage() {
  const router = useRouter();
  const t = useTranslations("profiles");
  const [creationMode, setCreationMode] =
    useState<CreationMode>("description");
  const [name, setName] = useState("");
  const [dobDay, setDobDay] = useState("");
  const [dobMonth, setDobMonth] = useState("");
  const [dobYear, setDobYear] = useState("");
  const [gender, setGender] = useState<ChildGender>("not_specified");
  const [favouriteCharacters, setFavouriteCharacters] = useState<string[]>([]);
  const [favouriteActivities, setFavouriteActivities] = useState<string[]>([]);
  const [favouriteAnimals, setFavouriteAnimals] = useState<string[]>([]);
  const [favouritePlaces, setFavouritePlaces] = useState<string[]>([]);
  const [lessons, setLessons] = useState<string[]>([]);
  const [appearance, setAppearance] = useState<ChildAppearance>(
    createEmptyChildAppearance()
  );
  const [ipConfirmed, setIpConfirmed] = useState(false);
  const [pendingPhoto, setPendingPhoto] = useState<PendingPhoto | null>(null);
  const [referenceCount, setReferenceCount] = useState(0);
  const [creditInfo, setCreditInfo] = useState<{
    credits: number;
    isAdmin: boolean;
  } | null>(null);
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

  useEffect(() => {
    Promise.all([
      fetch("/api/profiles").then((res) => (res.ok ? res.json() : [])),
      fetch("/api/user/credits").then((res) => (res.ok ? res.json() : null)),
    ])
      .then(([profiles, credits]) => {
        if (Array.isArray(profiles)) {
          setReferenceCount(
            profiles.filter((profile) => Boolean(profile.avatarImageUrl)).length
          );
        }
        if (credits) {
          setCreditInfo(credits as { credits: number; isAdmin: boolean });
        }
      })
      .catch(() => {});
  }, []);

  const photoReferenceCost =
    creditInfo?.isAdmin || referenceCount < 2 ? 0 : 1;
  const photoReferenceCostLabel = creditInfo?.isAdmin
    ? photoReferenceCost > 0
      ? "0 Credits (Admin)"
      : "Free"
    : photoReferenceCost > 0
      ? "1 Credit"
      : "Free";

  function stagePhoto(file: File | undefined) {
    if (!file) return;
    setError("");
    if (pendingPhoto) URL.revokeObjectURL(pendingPhoto.previewUrl);
    setPendingPhoto({
      file,
      previewUrl: URL.createObjectURL(file),
      consent: false,
      adjustment: "",
    });
  }

  function clearStagedPhoto() {
    if (pendingPhoto) URL.revokeObjectURL(pendingPhoto.previewUrl);
    setPendingPhoto(null);
  }

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
    if (!ipConfirmed) {
      setError(
        "Please confirm the profile does not include branded characters or protected IP."
      );
      return;
    }
    if (creationMode === "photo") {
      if (!pendingPhoto) {
        setError("Please upload or take a photo to start from a photo.");
        return;
      }
      if (!pendingPhoto.consent) {
        setError("Please confirm photo permission before creating a reference.");
        return;
      }
      if (
        photoReferenceCost > 0 &&
        creditInfo &&
        creditInfo.credits < photoReferenceCost
      ) {
        setError("You need 1 credit to create this illustrated reference.");
        return;
      }
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
          gender,
          appearance:
            creationMode === "photo" ? createEmptyChildAppearance() : appearance,
          favouriteCharacters,
          favouriteActivities,
          favouriteAnimals,
          favouritePlaces,
          lessons,
          ipConfirmationAccepted: ipConfirmed,
        }),
      });
      if (!res.ok)
        throw new Error(await getErrorMessage(res, "Could not create profile"));
      const profile = await res.json();
      if (creationMode === "photo" && pendingPhoto) {
        const formData = new FormData();
        formData.append("photo", pendingPhoto.file);
        formData.append("photoConsent", "yes");
        formData.append("adjustment", pendingPhoto.adjustment);
        const avatarRes = await fetch(`/api/profiles/${profile.id}/avatar`, {
          method: "POST",
          body: formData,
        });
        if (!avatarRes.ok) {
          window.dispatchEvent(new Event("storycot:credits-updated"));
          router.push(`/profiles/${profile.id}` as string);
          return;
        }
        window.dispatchEvent(new Event("storycot:credits-updated"));
      }
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
          <div className="rounded-2xl border border-night-100 bg-white p-4">
            <p className="text-sm font-bold text-night-700">
              How Would You Like To Start?
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {[
                {
                  value: "description" as const,
                  title: "Describe Them",
                  body: "Use guided fields for appearance, favourites, and story details.",
                },
                {
                  value: "photo" as const,
                  title: "Use A Photo",
                  body: "Upload or take a clear photo and let Storycot fill the visual reference.",
                },
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setCreationMode(option.value)}
                  className={`rounded-xl border p-3 text-left transition ${
                    creationMode === option.value
                      ? "border-night-700 bg-night-700 text-moon-200"
                      : "border-night-100 bg-night-50 text-night-600 hover:bg-night-100"
                  }`}
                >
                  <span className="block text-sm font-bold">{option.title}</span>
                  <span className="mt-1 block text-xs leading-5 opacity-80">
                    {option.body}
                  </span>
                </button>
              ))}
            </div>
          </div>

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

          <div>
            <label className={formStyles.label} htmlFor="gender">
              {t("genderLabel")}
            </label>
            <select
              id="gender"
              value={gender}
              onChange={(event) => setGender(event.target.value as ChildGender)}
              className={formStyles.field}
            >
              {CHILD_GENDERS.map((value) => (
                <option key={value} value={value}>
                  {t(`genderOptions.${value}`)}
                </option>
              ))}
            </select>
          </div>

          {creationMode === "photo" ? (
            <div className="rounded-2xl border border-night-100 bg-white p-4">
              <p className="text-sm font-bold text-night-700">
                Child Photo Reference
              </p>
              <p className="mt-1 text-sm leading-6 text-night-500">
                Use a clear, well-lit photo with just this child where possible.
                Busy backgrounds, other people, text, branded clothes, or toys
                can make the illustrated reference drift.
              </p>
              <p className="mt-2 text-xs font-bold uppercase tracking-wide text-night-400">
                Reference Cost: {photoReferenceCostLabel} (
                {Math.min(referenceCount, 2)}/2 Free Used)
              </p>

              {pendingPhoto ? (
                <div className="mt-4 rounded-xl border border-star-200 bg-star-50 p-3">
                  <div className="grid gap-3 sm:grid-cols-[7rem_1fr]">
                    <div
                      className="aspect-square rounded-lg bg-cover bg-center"
                      style={{
                        backgroundImage: `url("${pendingPhoto.previewUrl}")`,
                      }}
                      aria-label="Selected source photo preview"
                    />
                    <div>
                      <p className="text-sm font-bold text-night-700">
                        Photo Preview
                      </p>
                      <label className="mt-3 block text-xs font-bold uppercase tracking-wide text-night-400">
                        Optional Adjustment
                      </label>
                      <textarea
                        value={pendingPhoto.adjustment}
                        onChange={(event) =>
                          setPendingPhoto((current) =>
                            current
                              ? {
                                  ...current,
                                  adjustment: event.target.value.slice(0, 240),
                                }
                              : current
                          )
                        }
                        rows={2}
                        placeholder="Example: closer to the photo, softer smile, darker hair, no text in the image."
                        className={formStyles.textarea}
                        disabled={saving}
                      />
                      <label className="mt-3 flex items-start gap-2 text-xs font-semibold leading-5 text-night-600">
                        <input
                          type="checkbox"
                          checked={pendingPhoto.consent}
                          onChange={(event) =>
                            setPendingPhoto((current) =>
                              current
                                ? {
                                    ...current,
                                    consent: event.target.checked,
                                  }
                                : current
                            )
                          }
                          className="mt-1 h-4 w-4 rounded border-night-300"
                          disabled={saving}
                        />
                        I have permission to use this photo and understand it
                        will be used once to create an illustrated Storycot
                        reference.
                      </label>
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="mt-4 flex flex-wrap gap-2">
                <label
                  className={buttonClassName({
                    variant: "secondary",
                    size: "compact",
                    className: saving
                      ? "pointer-events-none opacity-60"
                      : "cursor-pointer",
                  })}
                >
                  <Icon name="image" />
                  Upload Photo
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="sr-only"
                    disabled={saving}
                    onChange={(event) => stagePhoto(event.target.files?.[0])}
                  />
                </label>
                <label
                  className={buttonClassName({
                    variant: "secondary",
                    size: "compact",
                    className: saving
                      ? "pointer-events-none opacity-60"
                      : "cursor-pointer",
                  })}
                >
                  <Icon name="image" />
                  Take Photo
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="sr-only"
                    disabled={saving}
                    onChange={(event) => stagePhoto(event.target.files?.[0])}
                  />
                </label>
                {pendingPhoto ? (
                  <button
                    type="button"
                    onClick={clearStagedPhoto}
                    className={buttonClassName({
                      variant: "secondary",
                      size: "compact",
                    })}
                    disabled={saving}
                  >
                    Remove Photo
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          <TagsField
            label={t("charsLabel")}
            values={favouriteCharacters}
            onChange={setFavouriteCharacters}
            placeholder={t("charsPlaceholder")}
            hint={t("tagHint")}
            maxItems={3}
          />
          <TagsField
            label={t("activitiesLabel")}
            values={favouriteActivities}
            onChange={setFavouriteActivities}
            placeholder={t("activitiesPlaceholder")}
            hint={t("tagHint")}
            maxItems={3}
          />
          <TagsField
            label={t("animalsLabel")}
            values={favouriteAnimals}
            onChange={setFavouriteAnimals}
            placeholder={t("animalsPlaceholder")}
            hint={t("tagHint")}
            maxItems={3}
          />
          <TagsField
            label={t("placesLabel")}
            values={favouritePlaces}
            onChange={setFavouritePlaces}
            placeholder={t("placesPlaceholder")}
            hint={t("tagHint")}
            maxItems={3}
          />

          {creationMode === "description" ? (
            <AppearanceFields appearance={appearance} onChange={setAppearance} />
          ) : null}

          <LessonsField
            label={t("lessonsLabel")}
            values={lessons}
            onChange={setLessons}
          />

          <ProfileIpConfirmation
            checked={ipConfirmed}
            onChange={setIpConfirmed}
          />

          {error && <p className={formStyles.error}>{error}</p>}

          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => router.back()}>
              {t("cancelButton")}
            </Button>
            <Button
              type="submit"
              disabled={
                saving ||
                !ipConfirmed ||
                (creationMode === "photo" &&
                  (!pendingPhoto || !pendingPhoto.consent))
              }
              fullWidth
            >
              {saving
                ? "..."
                : creationMode === "photo"
                  ? "Create With Photo"
                  : t("createButton")}
            </Button>
          </div>
        </form>
      </main>
    </>
  );
}
