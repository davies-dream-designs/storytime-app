"use client";

import { useEffect, useState } from "react";
import Button from "@/components/ui/Button";
import Icon from "@/components/ui/Icon";
import { buttonClassName } from "@/components/ui/buttonStyles";
import { formStyles } from "@/components/ui/formStyles";
import { useConfirmDialog } from "@/components/ui/useConfirmDialog";
import { isStoryPersonReferenceStale } from "@/lib/characterReferenceContext";
import type {
  ChildProfile,
  BodyBuild,
  StoryPerson,
  StoryPersonAgeGroup,
  StoryPersonHeight,
  StoryPersonRelationship,
} from "@/types";
import {
  BODY_BUILD_OPTIONS,
  getBodyBuildLabel,
  getStoryPersonAgeGroupLabel,
  getStoryPersonHeightLabel,
  getStoryPersonRelationshipLabel,
  STORY_PERSON_AGE_GROUP_OPTIONS,
  STORY_PERSON_HEIGHT_OPTIONS,
  STORY_PERSON_RELATIONSHIPS,
} from "@/types";

type FormState = {
  id?: string;
  name: string;
  relationship: StoryPersonRelationship;
  customRelationship: string;
  bodyBuild: BodyBuild;
  ageGroup: StoryPersonAgeGroup;
  height: StoryPersonHeight;
  pronouns: string;
  description: string;
  personality: string;
  appearance: string;
  availableToAllProfiles: boolean;
  profileIds: string[];
};

type PendingPhoto = {
  file: File;
  previewUrl: string;
  consent: boolean;
  adjustment: string;
};

type CreationMode = "description" | "photo";

const EMPTY_FORM: FormState = {
  name: "",
  relationship: "parent",
  customRelationship: "",
  bodyBuild: "not_specified",
  ageGroup: "not_specified",
  height: "not_specified",
  pronouns: "",
  description: "",
  personality: "",
  appearance: "",
  availableToAllProfiles: true,
  profileIds: [],
};

const PERSONALITY_OPTIONS = [
  "gentle",
  "funny",
  "calm",
  "playful",
  "patient",
  "adventurous",
  "kind",
  "curious",
  "protective",
  "sleepy",
] as const;

const STORY_ROLE_OPTIONS = [
  "helps with bedtime",
  "joins the adventure",
  "offers comfort",
  "makes things silly",
  "teaches a gentle lesson",
  "keeps watch",
  "needs help from the child",
  "celebrates at the end",
] as const;

function relationshipLabel(value: StoryPersonRelationship): string {
  return getStoryPersonRelationshipLabel({ relationship: value });
}

function formFromPerson(person: StoryPerson): FormState {
  return {
    id: person.id,
    name: person.name,
    relationship: person.relationship,
    customRelationship: person.customRelationship ?? "",
    bodyBuild: person.bodyBuild ?? "not_specified",
    ageGroup: person.ageGroup ?? "not_specified",
    height: person.height ?? "not_specified",
    pronouns: person.pronouns ?? "",
    description: person.description,
    personality: person.personality,
    appearance: person.appearance,
    availableToAllProfiles: person.availableToAllProfiles,
    profileIds: person.profileIds,
  };
}

function isStoryPerson(
  value: StoryPerson | { error?: string }
): value is StoryPerson {
  return "id" in value;
}

function splitList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function joinList(values: string[]): string {
  return Array.from(new Set(values)).join(", ");
}

export default function StoryPeopleManager({
  currentProfileId,
  profiles,
  initialPeople,
}: {
  currentProfileId?: string;
  profiles: ChildProfile[];
  initialPeople: StoryPerson[];
}) {
  const defaultProfileId = currentProfileId ?? profiles[0]?.id ?? "";
  const [people, setPeople] = useState(initialPeople);
  const [form, setForm] = useState<FormState>({
    ...EMPTY_FORM,
    profileIds: defaultProfileId ? [defaultProfileId] : [],
  });
  const [saving, setSaving] = useState(false);
  const [newPersonMode, setNewPersonMode] =
    useState<CreationMode>("description");
  const [pendingNewPhoto, setPendingNewPhoto] = useState<PendingPhoto | null>(
    null
  );
  const [generatingAvatarForId, setGeneratingAvatarForId] = useState<
    string | null
  >(null);
  const [redoNotes, setRedoNotes] = useState<Record<string, string>>({});
  const [redoOpenForId, setRedoOpenForId] = useState<string | null>(null);
  const [pendingPhotos, setPendingPhotos] = useState<
    Record<string, PendingPhoto>
  >({});
  const [error, setError] = useState("");
  const [creditInfo, setCreditInfo] = useState<{
    credits: number;
    isAdmin: boolean;
  } | null>(null);
  const { confirm, ConfirmDialog } = useConfirmDialog();

  useEffect(() => {
    fetch("/api/user/credits")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setCreditInfo(data as { credits: number; isAdmin: boolean });
      })
      .catch(() => {});
  }, []);

  const referenceCount = people.filter(
    (person) => person.avatarImageUrl
  ).length;

  function getAvatarCreateCost(person: StoryPerson): number {
    if (creditInfo?.isAdmin) return 0;
    return person.avatarImageUrl || referenceCount >= 2 ? 1 : 0;
  }

  function getAvatarCreateCostLabel(person: StoryPerson): string {
    const cost = getAvatarCreateCost(person);
    if (creditInfo?.isAdmin && cost === 0 && person.avatarImageUrl) {
      return "0 Credits (Admin)";
    }
    if (creditInfo?.isAdmin && person.avatarImageUrl) {
      return "0 Credits (Admin)";
    }
    return cost > 0 ? "1 Credit" : "Free";
  }

  const newPersonReferenceCost =
    creditInfo?.isAdmin || referenceCount < 2 ? 0 : 1;
  const newPersonReferenceCostLabel = creditInfo?.isAdmin
    ? newPersonReferenceCost > 0
      ? "0 Credits (Admin)"
      : "Free"
    : newPersonReferenceCost > 0
      ? "1 Credit"
      : "Free";

  function toggleProfile(profileId: string) {
    setForm((current) => ({
      ...current,
      profileIds: current.profileIds.includes(profileId)
        ? current.profileIds.filter((id) => id !== profileId)
        : [...current.profileIds, profileId],
    }));
  }

  function toggleListField(
    field: "personality" | "description",
    value: string,
    max = 3
  ) {
    setForm((current) => {
      const values = splitList(current[field]);
      const nextValues = values.includes(value)
        ? values.filter((item) => item !== value)
        : [...values.slice(0, max - 1), value];
      return { ...current, [field]: joinList(nextValues) };
    });
  }

  async function submit() {
    setError("");
    const isCreating = !form.id;
    if (form.relationship === "other" && !form.customRelationship.trim()) {
      setError("Type the relationship when choosing Other.");
      return;
    }
    if (isCreating && newPersonMode === "photo") {
      if (!pendingNewPhoto) {
        setError("Upload or take a photo to start from a photo.");
        return;
      }
      if (!pendingNewPhoto.consent) {
        setError(
          "Please confirm photo permission before creating a reference."
        );
        return;
      }
      if (
        newPersonReferenceCost > 0 &&
        creditInfo &&
        creditInfo.credits < newPersonReferenceCost
      ) {
        setError("You need 1 credit to create this illustrated reference.");
        return;
      }
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        appearance:
          isCreating && newPersonMode === "photo" ? "" : form.appearance,
        profileIds: form.availableToAllProfiles ? [] : form.profileIds,
      };
      const res = await fetch(
        form.id ? `/api/story-people/${form.id}` : "/api/story-people",
        {
          method: form.id ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const data = (await res.json()) as StoryPerson | { error?: string };
      if (!res.ok || !isStoryPerson(data)) {
        const message = isStoryPerson(data)
          ? "Could not save this story person"
          : data.error;
        throw new Error(message ?? "Could not save this story person");
      }
      let savedPerson = data;
      if (isCreating && newPersonMode === "photo" && pendingNewPhoto) {
        setGeneratingAvatarForId(data.id);
        try {
          savedPerson = await uploadAvatarFromPhoto(data, pendingNewPhoto);
          window.dispatchEvent(new Event("storycot:credits-updated"));
        } catch (avatarErr) {
          setError(
            avatarErr instanceof Error
              ? `Saved ${data.name}, but the photo reference failed: ${avatarErr.message}`
              : `Saved ${data.name}, but the photo reference failed.`
          );
        }
      }
      setPeople((current) =>
        form.id
          ? current.map((person) =>
              person.id === savedPerson.id ? savedPerson : person
            )
          : [savedPerson, ...current]
      );
      setForm({
        ...EMPTY_FORM,
        profileIds: defaultProfileId ? [defaultProfileId] : [],
      });
      clearStagedNewPhoto();
      setNewPersonMode("description");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
      setGeneratingAvatarForId(null);
    }
  }

  async function remove(person: StoryPerson) {
    const confirmed = await confirm({
      title: "Remove Family & Friends Profile",
      message: `Remove ${person.name} from Family & Friends?`,
      confirmLabel: "Remove",
      variant: "danger",
    });
    if (!confirmed) return;
    const res = await fetch(`/api/story-people/${person.id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setPeople((current) =>
        current.filter((currentPerson) => currentPerson.id !== person.id)
      );
    }
  }

  function stagePhoto(person: StoryPerson, file: File | undefined) {
    if (!file) return;
    setError("");
    setPendingPhotos((current) => {
      const existing = current[person.id];
      if (existing) URL.revokeObjectURL(existing.previewUrl);
      return {
        ...current,
        [person.id]: {
          file,
          previewUrl: URL.createObjectURL(file),
          consent: false,
          adjustment: "",
        },
      };
    });
  }

  function clearStagedPhoto(personId: string) {
    setPendingPhotos((current) => {
      const existing = current[personId];
      if (existing) URL.revokeObjectURL(existing.previewUrl);
      const next = { ...current };
      delete next[personId];
      return next;
    });
  }

  function stageNewPhoto(file: File | undefined) {
    if (!file) return;
    setError("");
    if (pendingNewPhoto) URL.revokeObjectURL(pendingNewPhoto.previewUrl);
    setPendingNewPhoto({
      file,
      previewUrl: URL.createObjectURL(file),
      consent: false,
      adjustment: "",
    });
  }

  function clearStagedNewPhoto() {
    if (pendingNewPhoto) URL.revokeObjectURL(pendingNewPhoto.previewUrl);
    setPendingNewPhoto(null);
  }

  async function uploadAvatarFromPhoto(
    person: StoryPerson,
    pending: PendingPhoto
  ): Promise<StoryPerson> {
    const formData = new FormData();
    formData.append("photo", pending.file);
    formData.append("photoConsent", "yes");
    formData.append("adjustment", pending.adjustment);
    const res = await fetch(`/api/story-people/${person.id}/avatar`, {
      method: "POST",
      body: formData,
    });
    const data = (await res.json()) as StoryPerson | { error?: string };
    if (!res.ok || !isStoryPerson(data)) {
      const message = isStoryPerson(data)
        ? "Could not create the illustrated reference"
        : data.error;
      throw new Error(message ?? "Could not create the illustrated reference");
    }
    return data;
  }

  async function generateAvatar(person: StoryPerson) {
    const pending = pendingPhotos[person.id];
    if (!pending) return;
    if (!pending.consent) {
      setError("Please confirm photo permission before creating a reference.");
      return;
    }
    const isRedo = Boolean(person.avatarImageUrl);
    const cost = getAvatarCreateCost(person);
    if (cost > 0 && creditInfo && creditInfo.credits < cost) {
      setError("You need 1 credit to create this illustrated reference.");
      return;
    }
    const confirmMessage =
      cost > 0
        ? `Creating ${person.name}'s illustrated reference will use 1 credit. Continue?`
        : isRedo
          ? `Redoing ${person.name}'s illustrated reference is free for admins. Continue?`
          : `Creating ${person.name}'s illustrated reference is free. Continue?`;
    const confirmed = await confirm({
      title: isRedo
        ? "Redo Illustrated Reference"
        : "Create Illustrated Reference",
      message: confirmMessage,
      confirmLabel: isRedo ? "Redo Reference" : "Create Reference",
    });
    if (!confirmed) return;
    setError("");
    setGeneratingAvatarForId(person.id);
    try {
      const data = await uploadAvatarFromPhoto(person, pending);
      setPeople((current) =>
        current.map((currentPerson) =>
          currentPerson.id === data.id ? data : currentPerson
        )
      );
      if (form.id === data.id) setForm(formFromPerson(data));
      window.dispatchEvent(new Event("storycot:credits-updated"));
      clearStagedPhoto(person.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setGeneratingAvatarForId(null);
    }
  }

  async function redoAvatar(person: StoryPerson) {
    const adjustment = (redoNotes[person.id] ?? "").trim();
    if (!adjustment) {
      setError("Tell us what should change before redoing the reference.");
      return;
    }
    const cost = creditInfo?.isAdmin ? 0 : 1;
    if (cost > 0 && creditInfo && creditInfo.credits < cost) {
      setError("You need 1 credit to redo this illustrated reference.");
      return;
    }
    const confirmed = await confirm({
      title: "Redo Illustrated Reference",
      message:
        cost > 0
          ? `Redoing ${person.name}'s illustrated reference will use 1 credit. Continue?`
          : `Redoing ${person.name}'s illustrated reference is free for admins. Continue?`,
      confirmLabel: "Redo Reference",
    });
    if (!confirmed) return;
    setError("");
    setGeneratingAvatarForId(person.id);
    try {
      const res = await fetch(`/api/story-people/${person.id}/avatar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adjustment }),
      });
      const data = (await res.json()) as StoryPerson | { error?: string };
      if (!res.ok || !isStoryPerson(data)) {
        throw new Error(
          isStoryPerson(data)
            ? "Could not redo the illustrated reference"
            : data.error || "Could not redo the illustrated reference"
        );
      }
      setPeople((current) =>
        current.map((currentPerson) =>
          currentPerson.id === data.id ? data : currentPerson
        )
      );
      if (form.id === data.id) setForm(formFromPerson(data));
      setRedoNotes((current) => ({ ...current, [person.id]: "" }));
      setRedoOpenForId(null);
      window.dispatchEvent(new Event("storycot:credits-updated"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setGeneratingAvatarForId(null);
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_1.2fr]">
      <section className="rounded-2xl border border-night-100 bg-white p-5">
        <h2 className="font-display text-2xl font-bold text-night-800">
          {form.id ? "Edit Story Person" : "Add Story Person"}
        </h2>
        <p className="mt-1 text-sm leading-6 text-night-500">
          Add family members, friends, pets, or original characters once and
          reuse them across children.
        </p>

        {form.id ? (
          <div className="mt-5 rounded-xl border border-star-200 bg-star-50 p-4">
            <p className="text-sm font-bold text-night-700">
              Editing {form.name} below
            </p>
            <p className="mt-1 text-sm leading-6 text-night-500">
              Make changes in the matching Family & Friends card.
            </p>
            <button
              type="button"
              onClick={() =>
                setForm({
                  ...EMPTY_FORM,
                  profileIds: defaultProfileId ? [defaultProfileId] : [],
                })
              }
              className={buttonClassName({
                variant: "secondary",
                size: "compact",
                className: "mt-3",
              })}
            >
              Cancel Edit
            </button>
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            <div className="rounded-xl border border-night-100 bg-night-50 p-3">
              <p className="text-sm font-bold text-night-700">
                How Would You Like To Start?
              </p>
              <div className="mt-3 grid gap-2">
                {[
                  {
                    value: "description" as const,
                    title: "Describe Them",
                    body: "Write the visual and story details yourself.",
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
                    onClick={() => setNewPersonMode(option.value)}
                    className={`rounded-xl border p-3 text-left transition ${
                      newPersonMode === option.value
                        ? "border-night-700 bg-night-700 text-moon-200"
                        : "border-night-100 bg-white text-night-600 hover:bg-night-100"
                    }`}
                  >
                    <span className="block text-sm font-bold">
                      {option.title}
                    </span>
                    <span className="mt-1 block text-xs leading-5 opacity-80">
                      {option.body}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className={formStyles.subLabel}>Display Name</label>
              <input
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                placeholder="Mum, Nanna, Grandad Tom, Daisy"
                className={formStyles.field}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={formStyles.subLabel}>Relationship</label>
                <select
                  value={form.relationship}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      relationship: event.target
                        .value as StoryPersonRelationship,
                      customRelationship:
                        event.target.value === "other"
                          ? current.customRelationship
                          : "",
                    }))
                  }
                  className={formStyles.field}
                >
                  {STORY_PERSON_RELATIONSHIPS.map((relationship) => (
                    <option key={relationship} value={relationship}>
                      {relationshipLabel(relationship)}
                    </option>
                  ))}
                </select>
              </div>
              {form.relationship === "other" ? (
                <div>
                  <label className={formStyles.subLabel}>
                    Custom Relationship
                  </label>
                  <input
                    value={form.customRelationship}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        customRelationship: event.target.value,
                      }))
                    }
                    placeholder="Auntie's partner, godmother, family friend"
                    className={formStyles.field}
                  />
                </div>
              ) : null}
              <div>
                <label className={formStyles.subLabel}>Pronouns</label>
                <input
                  value={form.pronouns}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      pronouns: event.target.value,
                    }))
                  }
                  placeholder="she/her, he/him, they/them"
                  className={formStyles.field}
                />
              </div>
              <div>
                <label className={formStyles.subLabel}>Age Group</label>
                <select
                  value={form.ageGroup}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      ageGroup: event.target.value as StoryPersonAgeGroup,
                    }))
                  }
                  className={formStyles.field}
                >
                  {STORY_PERSON_AGE_GROUP_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {getStoryPersonAgeGroupLabel(option)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={formStyles.subLabel}>Height</label>
                <select
                  value={form.height}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      height: event.target.value as StoryPersonHeight,
                    }))
                  }
                  className={formStyles.field}
                >
                  {STORY_PERSON_HEIGHT_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {getStoryPersonHeightLabel(option)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={formStyles.subLabel}>Body Build</label>
                <select
                  value={form.bodyBuild}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      bodyBuild: event.target.value as BodyBuild,
                    }))
                  }
                  className={formStyles.field}
                >
                  {BODY_BUILD_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {getBodyBuildLabel(option)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between gap-3">
                <label className={formStyles.subLabel}>Personality</label>
                <span className="text-xs font-bold text-night-300">
                  {splitList(form.personality).length}/3
                </span>
              </div>
              <div className="mb-2 flex flex-wrap gap-2">
                {PERSONALITY_OPTIONS.map((option) => {
                  const selected = splitList(form.personality).includes(option);
                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => toggleListField("personality", option)}
                      className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
                        selected
                          ? "bg-night-700 text-moon-200"
                          : "bg-night-50 text-night-600 hover:bg-night-100"
                      }`}
                    >
                      {option}
                    </button>
                  );
                })}
              </div>
              <input
                value={form.personality}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    personality: event.target.value,
                  }))
                }
                placeholder="Choose up to 3, or add your own comma-separated notes."
                className={formStyles.field}
              />
            </div>

            {newPersonMode === "photo" ? (
              <div className="rounded-xl border border-night-100 bg-night-50 p-3">
                <p className="text-sm font-bold text-night-700">
                  Photo Reference
                </p>
                <p className="mt-1 text-xs leading-5 text-night-500">
                  Use a clear, well-lit photo with just this person or pet where
                  possible. Busy backgrounds, other people, text, branded
                  clothes, or toys can make the illustrated reference drift.
                </p>
                <p className="mt-2 text-xs font-bold uppercase tracking-wide text-night-400">
                  Reference Cost: {newPersonReferenceCostLabel} (
                  {Math.min(referenceCount, 2)}/2 Free Used)
                </p>
                {pendingNewPhoto ? (
                  <div className="mt-3 rounded-xl border border-star-200 bg-white p-3">
                    <div className="grid gap-3 sm:grid-cols-[6rem_1fr]">
                      <div
                        className="aspect-square rounded-lg bg-cover bg-center"
                        style={{
                          backgroundImage: `url("${pendingNewPhoto.previewUrl}")`,
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
                          value={pendingNewPhoto.adjustment}
                          onChange={(event) =>
                            setPendingNewPhoto((current) =>
                              current
                                ? {
                                    ...current,
                                    adjustment: event.target.value.slice(
                                      0,
                                      240
                                    ),
                                  }
                                : current
                            )
                          }
                          rows={2}
                          placeholder="Example: keep the glasses, softer smile, no text in the image."
                          className={formStyles.textarea}
                          disabled={saving}
                        />
                        <label className="mt-3 flex items-start gap-2 text-xs font-semibold leading-5 text-night-600">
                          <input
                            type="checkbox"
                            checked={pendingNewPhoto.consent}
                            onChange={(event) =>
                              setPendingNewPhoto((current) =>
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
                <div className="mt-3 flex flex-wrap gap-2">
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
                      onChange={(event) =>
                        stageNewPhoto(event.target.files?.[0])
                      }
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
                      onChange={(event) =>
                        stageNewPhoto(event.target.files?.[0])
                      }
                    />
                  </label>
                  {pendingNewPhoto ? (
                    <button
                      type="button"
                      onClick={clearStagedNewPhoto}
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

            {newPersonMode === "description" ? (
              <div>
                <label className={formStyles.subLabel}>Appearance</label>
                <textarea
                  value={form.appearance}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      appearance: event.target.value,
                    }))
                  }
                  rows={3}
                  placeholder="Short visual notes for storybook illustrations."
                  className={formStyles.textarea}
                />
              </div>
            ) : null}

            <div>
              <div className="flex items-center justify-between gap-3">
                <label className={formStyles.subLabel}>Story Role</label>
                <span className="text-xs font-bold text-night-300">
                  {splitList(form.description).length}/3
                </span>
              </div>
              <div className="mb-2 flex flex-wrap gap-2">
                {STORY_ROLE_OPTIONS.map((option) => {
                  const selected = splitList(form.description).includes(option);
                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => toggleListField("description", option)}
                      className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
                        selected
                          ? "bg-night-700 text-moon-200"
                          : "bg-night-50 text-night-600 hover:bg-night-100"
                      }`}
                    >
                      {option}
                    </button>
                  );
                })}
              </div>
              <textarea
                value={form.description}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                rows={2}
                placeholder="Choose up to 3, or add your own comma-separated notes."
                className={formStyles.textarea}
              />
            </div>

            <div className="rounded-xl border border-night-100 bg-night-50 p-3">
              <label className="flex items-start gap-3 text-sm font-semibold text-night-700">
                <input
                  type="checkbox"
                  checked={form.availableToAllProfiles}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      availableToAllProfiles: event.target.checked,
                    }))
                  }
                  className="mt-1 h-4 w-4 rounded border-night-300"
                />
                Available For All Children
              </label>
              {!form.availableToAllProfiles ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {profiles.map((profile) => (
                    <button
                      key={profile.id}
                      type="button"
                      onClick={() => toggleProfile(profile.id)}
                      className={`rounded-full px-3 py-1.5 text-sm font-bold transition ${
                        form.profileIds.includes(profile.id)
                          ? "bg-night-700 text-moon-200"
                          : "bg-white text-night-600 hover:bg-night-100"
                      }`}
                    >
                      {profile.name}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            {error ? <p className={formStyles.error}>{error}</p> : null}

            <div className="flex flex-wrap gap-3">
              <Button
                onClick={submit}
                disabled={
                  saving ||
                  !form.name.trim() ||
                  (newPersonMode === "photo" &&
                    (!pendingNewPhoto || !pendingNewPhoto.consent))
                }
              >
                {saving
                  ? newPersonMode === "photo"
                    ? "Creating Reference..."
                    : "Saving..."
                  : newPersonMode === "photo"
                    ? "Add From Photo"
                    : "Add Person"}
              </Button>
              {form.id ? (
                <button
                  type="button"
                  onClick={() =>
                    setForm({
                      ...EMPTY_FORM,
                      profileIds: defaultProfileId ? [defaultProfileId] : [],
                    })
                  }
                  className={buttonClassName({
                    variant: "secondary",
                    size: "compact",
                  })}
                >
                  Cancel
                </button>
              ) : null}
            </div>
          </div>
        )}
      </section>

      <section className="space-y-3">
        {people.length > 0 ? (
          people.map((person) => (
            <article
              key={person.id}
              className="rounded-2xl border border-night-100 bg-white p-5"
            >
              {(() => {
                const pendingPhoto = pendingPhotos[person.id];
                const busy = generatingAvatarForId === person.id;
                const editing = form.id === person.id;
                const referenceIsStale = isStoryPersonReferenceStale(person);

                return (
                  <>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex min-w-0 gap-3">
                        {person.avatarImageUrl ? (
                          <div
                            className="h-12 w-12 shrink-0 rounded-full bg-cover bg-center"
                            style={{
                              backgroundImage: `url("${person.avatarImageUrl}")`,
                            }}
                            aria-hidden="true"
                          />
                        ) : (
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-star-200 to-moon-200 font-display text-lg font-bold text-night-800">
                            {person.name[0]?.toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0">
                          <h3 className="truncate font-display text-xl font-bold text-night-800">
                            {person.name}
                          </h3>
                          <p className="text-sm capitalize text-night-400">
                            {getStoryPersonRelationshipLabel(person)}
                            {person.pronouns ? ` · ${person.pronouns}` : ""}
                            {person.ageGroup &&
                            person.ageGroup !== "not_specified"
                              ? ` · ${getStoryPersonAgeGroupLabel(person.ageGroup)}`
                              : ""}
                            {person.height && person.height !== "not_specified"
                              ? ` · ${getStoryPersonHeightLabel(person.height)}`
                              : ""}
                            {person.bodyBuild &&
                            person.bodyBuild !== "not_specified"
                              ? ` · ${getBodyBuildLabel(person.bodyBuild)} build`
                              : ""}
                          </p>
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <button
                          type="button"
                          onClick={() => setForm(formFromPerson(person))}
                          className={buttonClassName({
                            variant: "secondary",
                            size: "compact",
                          })}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(person)}
                          className={buttonClassName({
                            variant: "danger",
                            size: "compact",
                          })}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                    {referenceIsStale ? (
                      <div className="mt-3 rounded-xl border border-star-200 bg-star-50 px-3 py-2 text-sm font-semibold leading-6 text-night-700">
                        This illustrated reference may be out of date because
                        the profile details changed. Redo the reference before
                        building new story art for the best match.
                      </div>
                    ) : null}

                    {editing ? (
                      <div className="mt-4 rounded-xl border border-star-200 bg-star-50 p-4">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div>
                            <label className={formStyles.subLabel}>
                              Display Name
                            </label>
                            <input
                              value={form.name}
                              onChange={(event) =>
                                setForm((current) => ({
                                  ...current,
                                  name: event.target.value,
                                }))
                              }
                              className={formStyles.field}
                            />
                          </div>
                          <div>
                            <label className={formStyles.subLabel}>
                              Relationship
                            </label>
                            <select
                              value={form.relationship}
                              onChange={(event) =>
                                setForm((current) => ({
                                  ...current,
                                  relationship: event.target
                                    .value as StoryPersonRelationship,
                                  customRelationship:
                                    event.target.value === "other"
                                      ? current.customRelationship
                                      : "",
                                }))
                              }
                              className={formStyles.field}
                            >
                              {STORY_PERSON_RELATIONSHIPS.map(
                                (relationship) => (
                                  <option
                                    key={relationship}
                                    value={relationship}
                                  >
                                    {relationshipLabel(relationship)}
                                  </option>
                                )
                              )}
                            </select>
                          </div>
                          {form.relationship === "other" ? (
                            <div>
                              <label className={formStyles.subLabel}>
                                Custom Relationship
                              </label>
                              <input
                                value={form.customRelationship}
                                onChange={(event) =>
                                  setForm((current) => ({
                                    ...current,
                                    customRelationship: event.target.value,
                                  }))
                                }
                                placeholder="Auntie's partner, godmother, family friend"
                                className={formStyles.field}
                              />
                            </div>
                          ) : null}
                          <div>
                            <label className={formStyles.subLabel}>
                              Pronouns
                            </label>
                            <input
                              value={form.pronouns}
                              onChange={(event) =>
                                setForm((current) => ({
                                  ...current,
                                  pronouns: event.target.value,
                                }))
                              }
                              placeholder="she/her, he/him, they/them"
                              className={formStyles.field}
                            />
                          </div>
                          <div>
                            <label className={formStyles.subLabel}>
                              Age Group
                            </label>
                            <select
                              value={form.ageGroup}
                              onChange={(event) =>
                                setForm((current) => ({
                                  ...current,
                                  ageGroup: event.target
                                    .value as StoryPersonAgeGroup,
                                }))
                              }
                              className={formStyles.field}
                            >
                              {STORY_PERSON_AGE_GROUP_OPTIONS.map((option) => (
                                <option key={option} value={option}>
                                  {getStoryPersonAgeGroupLabel(option)}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className={formStyles.subLabel}>
                              Height
                            </label>
                            <select
                              value={form.height}
                              onChange={(event) =>
                                setForm((current) => ({
                                  ...current,
                                  height: event.target
                                    .value as StoryPersonHeight,
                                }))
                              }
                              className={formStyles.field}
                            >
                              {STORY_PERSON_HEIGHT_OPTIONS.map((option) => (
                                <option key={option} value={option}>
                                  {getStoryPersonHeightLabel(option)}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className={formStyles.subLabel}>
                              Body Build
                            </label>
                            <select
                              value={form.bodyBuild}
                              onChange={(event) =>
                                setForm((current) => ({
                                  ...current,
                                  bodyBuild: event.target.value as BodyBuild,
                                }))
                              }
                              className={formStyles.field}
                            >
                              {BODY_BUILD_OPTIONS.map((option) => (
                                <option key={option} value={option}>
                                  {getBodyBuildLabel(option)}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <div className="flex items-center justify-between gap-3">
                              <label className={formStyles.subLabel}>
                                Personality
                              </label>
                              <span className="text-xs font-bold text-night-300">
                                {splitList(form.personality).length}/3
                              </span>
                            </div>
                            <div className="mb-2 flex flex-wrap gap-2">
                              {PERSONALITY_OPTIONS.map((option) => {
                                const selected = splitList(
                                  form.personality
                                ).includes(option);
                                return (
                                  <button
                                    key={option}
                                    type="button"
                                    onClick={() =>
                                      toggleListField("personality", option)
                                    }
                                    className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
                                      selected
                                        ? "bg-night-700 text-moon-200"
                                        : "bg-white text-night-600 hover:bg-night-100"
                                    }`}
                                  >
                                    {option}
                                  </button>
                                );
                              })}
                            </div>
                            <input
                              value={form.personality}
                              onChange={(event) =>
                                setForm((current) => ({
                                  ...current,
                                  personality: event.target.value,
                                }))
                              }
                              className={formStyles.field}
                            />
                          </div>
                        </div>

                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          <div>
                            <label className={formStyles.subLabel}>
                              Appearance
                            </label>
                            <textarea
                              value={form.appearance}
                              onChange={(event) =>
                                setForm((current) => ({
                                  ...current,
                                  appearance: event.target.value,
                                }))
                              }
                              rows={3}
                              className={formStyles.textarea}
                            />
                          </div>
                          <div>
                            <div className="flex items-center justify-between gap-3">
                              <label className={formStyles.subLabel}>
                                Story Role
                              </label>
                              <span className="text-xs font-bold text-night-300">
                                {splitList(form.description).length}/3
                              </span>
                            </div>
                            <div className="mb-2 flex flex-wrap gap-2">
                              {STORY_ROLE_OPTIONS.map((option) => {
                                const selected = splitList(
                                  form.description
                                ).includes(option);
                                return (
                                  <button
                                    key={option}
                                    type="button"
                                    onClick={() =>
                                      toggleListField("description", option)
                                    }
                                    className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
                                      selected
                                        ? "bg-night-700 text-moon-200"
                                        : "bg-white text-night-600 hover:bg-night-100"
                                    }`}
                                  >
                                    {option}
                                  </button>
                                );
                              })}
                            </div>
                            <textarea
                              value={form.description}
                              onChange={(event) =>
                                setForm((current) => ({
                                  ...current,
                                  description: event.target.value,
                                }))
                              }
                              rows={3}
                              className={formStyles.textarea}
                            />
                          </div>
                        </div>

                        <div className="mt-3 rounded-xl border border-night-100 bg-white p-3">
                          <label className="flex items-start gap-3 text-sm font-semibold text-night-700">
                            <input
                              type="checkbox"
                              checked={form.availableToAllProfiles}
                              onChange={(event) =>
                                setForm((current) => ({
                                  ...current,
                                  availableToAllProfiles: event.target.checked,
                                }))
                              }
                              className="mt-1 h-4 w-4 rounded border-night-300"
                            />
                            Available For All Children
                          </label>
                          {!form.availableToAllProfiles ? (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {profiles.map((profile) => (
                                <button
                                  key={profile.id}
                                  type="button"
                                  onClick={() => toggleProfile(profile.id)}
                                  className={`rounded-full px-3 py-1.5 text-sm font-bold transition ${
                                    form.profileIds.includes(profile.id)
                                      ? "bg-night-700 text-moon-200"
                                      : "bg-night-50 text-night-600 hover:bg-night-100"
                                  }`}
                                >
                                  {profile.name}
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2">
                          <Button
                            size="compact"
                            onClick={submit}
                            disabled={saving || !form.name.trim()}
                          >
                            {saving ? "Saving..." : "Save Changes"}
                          </Button>
                          <button
                            type="button"
                            onClick={() =>
                              setForm({
                                ...EMPTY_FORM,
                                profileIds: defaultProfileId
                                  ? [defaultProfileId]
                                  : [],
                              })
                            }
                            className={buttonClassName({
                              variant: "secondary",
                              size: "compact",
                            })}
                            disabled={saving}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : null}

                    {!editing ? (
                      <div className="mt-4 grid gap-3 text-sm leading-6 text-night-600 sm:grid-cols-2">
                        {person.personality ? (
                          <p>
                            <span className="font-bold text-night-700">
                              Personality:
                            </span>{" "}
                            {person.personality}
                          </p>
                        ) : null}
                        {person.description ? (
                          <p>
                            <span className="font-bold text-night-700">
                              Role:
                            </span>{" "}
                            {person.description}
                          </p>
                        ) : null}
                        {person.appearance ? (
                          <p className="sm:col-span-2">
                            <span className="font-bold text-night-700">
                              Appearance:
                            </span>{" "}
                            {person.appearance}
                          </p>
                        ) : null}
                      </div>
                    ) : null}

                    <div className="mt-4 rounded-xl border border-night-100 bg-night-50 p-3">
                      <div className="grid gap-4 md:grid-cols-[8rem_1fr]">
                        <div className="overflow-hidden rounded-xl border border-night-100 bg-white">
                          <div
                            className={`relative aspect-square bg-cover bg-center ${
                              pendingPhoto ? "opacity-45" : ""
                            }`}
                            style={{
                              backgroundImage: person.avatarImageUrl
                                ? `url("${person.avatarImageUrl}")`
                                : undefined,
                            }}
                          >
                            {!person.avatarImageUrl ? (
                              <div className="flex h-full items-center justify-center px-3 text-center text-xs font-bold text-night-300">
                                No Reference Yet
                              </div>
                            ) : null}
                            {pendingPhoto && person.avatarImageUrl ? (
                              <div className="absolute inset-x-2 bottom-2 rounded-full bg-white/90 px-2 py-1 text-center text-[0.7rem] font-bold uppercase text-night-500">
                                Will Be Replaced
                              </div>
                            ) : null}
                          </div>
                        </div>

                        <div>
                          <p className="text-sm font-bold text-night-700">
                            Illustrated Reference
                          </p>
                          <p className="mt-1 text-xs leading-5 text-night-500">
                            Upload or take a photo, preview it here, then create
                            a Storycot-style reference. The source photo is used
                            once and is not stored.
                          </p>
                          <p className="mt-2 text-xs font-semibold leading-5 text-night-500">
                            Use a clear, well-lit photo with just this person or
                            pet where possible. Busy backgrounds, other people,
                            text, branded clothes, or toys can make the
                            illustrated reference drift.
                          </p>
                          <p className="mt-2 text-xs font-bold uppercase tracking-wide text-night-400">
                            First 2 Family & Friends references are free. Extra
                            references or redos cost 1 credit each.
                          </p>

                          {person.avatarImageUrl ? (
                            <div className="mt-3 rounded-xl border border-night-100 bg-white p-3">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="text-xs font-bold uppercase tracking-wide text-night-400">
                                  Redo Current Reference:{" "}
                                  {creditInfo?.isAdmin
                                    ? "0 Credits (Admin)"
                                    : "1 Credit"}
                                </p>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setRedoOpenForId((current) =>
                                      current === person.id ? null : person.id
                                    )
                                  }
                                  className={buttonClassName({
                                    variant: "secondary",
                                    size: "compact",
                                  })}
                                  disabled={busy}
                                >
                                  Redo
                                </button>
                              </div>
                              {redoOpenForId === person.id ? (
                                <div className="mt-3">
                                  <textarea
                                    value={redoNotes[person.id] ?? ""}
                                    onChange={(event) =>
                                      setRedoNotes((current) => ({
                                        ...current,
                                        [person.id]: event.target.value.slice(
                                          0,
                                          240
                                        ),
                                      }))
                                    }
                                    rows={2}
                                    placeholder="Example: less broad, softer smile, closer hair colour, keep the glasses."
                                    className={formStyles.textarea}
                                    disabled={busy}
                                  />
                                  <div className="mt-2 flex flex-wrap gap-2">
                                    <Button
                                      size="compact"
                                      onClick={() => void redoAvatar(person)}
                                      disabled={
                                        busy ||
                                        !(redoNotes[person.id] ?? "").trim()
                                      }
                                    >
                                      {busy ? "Redoing..." : "Redo Reference"}
                                    </Button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setRedoOpenForId(null);
                                        setRedoNotes((current) => ({
                                          ...current,
                                          [person.id]: "",
                                        }));
                                      }}
                                      className={buttonClassName({
                                        variant: "secondary",
                                        size: "compact",
                                      })}
                                      disabled={busy}
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          ) : null}

                          {pendingPhoto ? (
                            <div className="mt-3 rounded-xl border border-star-200 bg-white p-3">
                              <div className="grid gap-3 sm:grid-cols-[6rem_1fr]">
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
                                  <p className="mt-1 text-xs leading-5 text-night-500">
                                    This photo has not been saved. It will be
                                    used once to create the illustrated
                                    reference.
                                  </p>
                                  <label className="mt-3 block text-xs font-bold uppercase tracking-wide text-night-400">
                                    Optional Adjustment
                                  </label>
                                  <textarea
                                    value={pendingPhoto.adjustment}
                                    onChange={(event) =>
                                      setPendingPhotos((current) => ({
                                        ...current,
                                        [person.id]: {
                                          ...pendingPhoto,
                                          adjustment: event.target.value,
                                        },
                                      }))
                                    }
                                    rows={2}
                                    maxLength={240}
                                    placeholder="Example: less broad, softer smile, darker hair, keep the same glasses."
                                    className={formStyles.textarea}
                                    disabled={busy}
                                  />
                                  <label className="mt-3 flex items-start gap-2 text-xs font-semibold leading-5 text-night-600">
                                    <input
                                      type="checkbox"
                                      checked={pendingPhoto.consent}
                                      onChange={(event) =>
                                        setPendingPhotos((current) => ({
                                          ...current,
                                          [person.id]: {
                                            ...pendingPhoto,
                                            consent: event.target.checked,
                                          },
                                        }))
                                      }
                                      className="mt-1 h-4 w-4 rounded border-night-300"
                                      disabled={busy}
                                    />
                                    I have permission to use this photo and
                                    understand it will be used once to create an
                                    illustrated Storycot reference.
                                  </label>
                                  <div className="mt-3 flex flex-wrap gap-2">
                                    <p className="w-full text-xs font-bold uppercase tracking-wide text-night-400">
                                      {person.avatarImageUrl
                                        ? creditInfo?.isAdmin
                                          ? "Redo Cost: 0 Credits (Admin)"
                                          : "Redo Cost: 1 Credit"
                                        : `Reference Cost: ${getAvatarCreateCostLabel(
                                            person
                                          )} (${Math.min(
                                            referenceCount,
                                            2
                                          )}/2 Free Used)`}
                                    </p>
                                    <Button
                                      size="compact"
                                      onClick={() =>
                                        void generateAvatar(person)
                                      }
                                      disabled={busy || !pendingPhoto.consent}
                                    >
                                      {busy
                                        ? "Creating..."
                                        : "Create Reference"}
                                    </Button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        clearStagedPhoto(person.id)
                                      }
                                      className={buttonClassName({
                                        variant: "secondary",
                                        size: "compact",
                                      })}
                                      disabled={busy}
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ) : null}

                          <div className="mt-3 flex flex-wrap gap-2">
                            <label
                              className={buttonClassName({
                                variant: "secondary",
                                size: "compact",
                                className: busy
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
                                disabled={busy}
                                onChange={(event) => {
                                  stagePhoto(person, event.target.files?.[0]);
                                  event.target.value = "";
                                }}
                              />
                            </label>
                            <label
                              className={buttonClassName({
                                variant: "secondary",
                                size: "compact",
                                className: busy
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
                                disabled={busy}
                                onChange={(event) => {
                                  stagePhoto(person, event.target.files?.[0]);
                                  event.target.value = "";
                                }}
                              />
                            </label>
                          </div>
                        </div>
                      </div>
                    </div>

                    <p className="mt-4 rounded-full bg-night-50 px-3 py-1 text-xs font-semibold text-night-500">
                      {person.availableToAllProfiles
                        ? "Available for all children"
                        : `Linked to ${person.profileIds.length} child profile${
                            person.profileIds.length === 1 ? "" : "s"
                          }`}
                    </p>
                  </>
                );
              })()}
            </article>
          ))
        ) : (
          <div className="rounded-2xl border-2 border-dashed border-night-200 p-8 text-center">
            <Icon name="profile" className="mx-auto h-8 w-8 text-star-500" />
            <p className="mt-3 font-display font-bold text-night-700">
              No Family & Friends Yet
            </p>
            <p className="mt-1 text-sm leading-6 text-night-500">
              Start with Mum, Dad, a grandparent, sibling, or pet. You can pick
              who appears each time you make a story.
            </p>
          </div>
        )}
      </section>
      <ConfirmDialog />
    </div>
  );
}
