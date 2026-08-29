"use client";

import { useEffect, useState } from "react";
import Button from "@/components/ui/Button";
import Icon from "@/components/ui/Icon";
import { buttonClassName } from "@/components/ui/buttonStyles";
import { formStyles } from "@/components/ui/formStyles";
import { useConfirmDialog } from "@/components/ui/useConfirmDialog";
import { isStoryPersonReferenceStale } from "@/lib/characterReferenceContext";
import {
  delay,
  isActiveAvatarStatus,
  isAvatarJobResponse,
  type AvatarGenerationEnqueueResult,
} from "@/lib/avatarJobUtils";
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
  value: StoryPerson | AvatarGenerationEnqueueResult | { error?: string }
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
  const [drawingAvatarForId, setDrawingAvatarForId] = useState<string | null>(
    null
  );
  const [redoNotes, setRedoNotes] = useState<Record<string, string>>({});
  const [redoOpenForId, setRedoOpenForId] = useState<string | null>(null);
  const [pendingPhotos, setPendingPhotos] = useState<
    Record<string, PendingPhoto>
  >({});
  const [error, setError] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [creditInfo, setCreditInfo] = useState<{
    credits: number;
    isAdmin: boolean;
  } | null>(null);
  const { confirm, ConfirmDialog } = useConfirmDialog();

  function openAddModal() {
    setForm({ ...EMPTY_FORM, profileIds: defaultProfileId ? [defaultProfileId] : [] });
    setIsModalOpen(true);
  }
  function openEditModal(person: StoryPerson) {
    setForm(formFromPerson(person));
    setIsModalOpen(true);
  }
  function closeModal() {
    setIsModalOpen(false);
  }

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
  async function waitForAvatarJob(
    personId: string,
    jobId: string
  ): Promise<StoryPerson> {
    for (let attempt = 0; attempt < 45; attempt += 1) {
      const res = await fetch(`/api/story-people/${personId}`, {
        cache: "no-store",
        credentials: "same-origin",
      });
      if (res.ok) {
        const next = (await res.json()) as StoryPerson;
        if (next.avatarGenerationStatus === "failed") {
          throw new Error(
            next.avatarGenerationError ||
              "Could not create the illustrated reference."
          );
        }
        if (
          !isActiveAvatarStatus(next.avatarGenerationStatus) ||
          next.avatarGenerationJobId !== jobId
        ) {
          return next;
        }
      }
      await delay(2000);
    }
    throw new Error(
      "The reference is still drawing in the background. Refresh this page in a moment."
    );
  }

  async function resolveAvatarResponse(
    personId: string,
    data: StoryPerson | AvatarGenerationEnqueueResult | { error?: string },
    fallback: string
  ): Promise<StoryPerson> {
    if (isStoryPerson(data)) return data;
    if (isAvatarJobResponse(data)) {
      setDrawingAvatarForId(personId);
      clearStagedPhoto(personId);
      setRedoOpenForId(null);
      return waitForAvatarJob(personId, data.jobId);
    }
    throw new Error(data.error || fallback);
  }


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
      setIsModalOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
      setGeneratingAvatarForId(null);
      setDrawingAvatarForId(null);
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
    const data = (await res.json()) as
      | StoryPerson
      | AvatarGenerationEnqueueResult
      | { error?: string };
    if (!res.ok) {
      throw new Error(
        isStoryPerson(data) || isAvatarJobResponse(data)
          ? "Could not create the illustrated reference"
          : data.error || "Could not create the illustrated reference"
      );
    }
    return resolveAvatarResponse(
      person.id,
      data,
      "Could not create the illustrated reference"
    );
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
      setDrawingAvatarForId(null);
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
      const data = (await res.json()) as
        | StoryPerson
        | AvatarGenerationEnqueueResult
        | { error?: string };
      if (!res.ok) {
        throw new Error(
          isStoryPerson(data) || isAvatarJobResponse(data)
            ? "Could not redo the illustrated reference"
            : data.error || "Could not redo the illustrated reference"
        );
      }
      const nextPerson = await resolveAvatarResponse(
        person.id,
        data,
        "Could not redo the illustrated reference"
      );
      setPeople((current) =>
        current.map((currentPerson) =>
          currentPerson.id === nextPerson.id ? nextPerson : currentPerson
        )
      );
      if (form.id === nextPerson.id) setForm(formFromPerson(nextPerson));
      setRedoNotes((current) => ({ ...current, [person.id]: "" }));
      setRedoOpenForId(null);
      window.dispatchEvent(new Event("storycot:credits-updated"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setGeneratingAvatarForId(null);
      setDrawingAvatarForId(null);
    }
  }

  async function createAvatarFromDescription(person: StoryPerson) {
    if (person.avatarImageUrl) return;
    const cost = getAvatarCreateCost(person);
    if (cost > 0 && creditInfo && creditInfo.credits < cost) {
      setError("You need 1 credit to create this illustrated reference.");
      return;
    }
    const confirmed = await confirm({
      title: "Create Illustrated Reference",
      message:
        cost > 0
          ? `Creating ${person.name}'s illustrated reference from their description will use 1 credit. Continue?`
          : `Creating ${person.name}'s illustrated reference from their description is free. Continue?`,
      confirmLabel: "Create Reference",
    });
    if (!confirmed) return;
    setError("");
    setGeneratingAvatarForId(person.id);
    try {
      const res = await fetch(`/api/story-people/${person.id}/avatar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "description" }),
      });
      const data = (await res.json()) as
        | StoryPerson
        | AvatarGenerationEnqueueResult
        | { error?: string };
      if (!res.ok) {
        throw new Error(
          isStoryPerson(data) || isAvatarJobResponse(data)
            ? "Could not create the illustrated reference"
            : data.error || "Could not create the illustrated reference"
        );
      }
      const nextPerson = await resolveAvatarResponse(
        person.id,
        data,
        "Could not create the illustrated reference"
      );
      setPeople((current) =>
        current.map((currentPerson) =>
          currentPerson.id === nextPerson.id ? nextPerson : currentPerson
        )
      );
      if (form.id === nextPerson.id) setForm(formFromPerson(nextPerson));
      window.dispatchEvent(new Event("storycot:credits-updated"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setGeneratingAvatarForId(null);
      setDrawingAvatarForId(null);
    }
  }

  const formSection = (
    <section className="rounded-2xl border border-night-100 bg-white p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl font-bold text-night-800">
              {form.id ? `Edit — ${form.name}` : "Add Family & Friends"}
            </h2>
            <p className="mt-1 text-sm leading-6 text-night-500">
              {form.id
                ? "Update their details below, then save."
                : "Add a family member, friend, pet, or original character."}
            </p>
          </div>
          <button
            type="button"
            onClick={closeModal}
            aria-label="Close"
            className="rounded-lg p-1.5 text-night-400 transition hover:bg-night-100 hover:text-night-700"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {form.id ? null : (
          <div className="mt-5 space-y-4">
            <div>
              <p className="text-sm font-bold text-night-700">Who They Are</p>
              <p className="mt-1 text-xs leading-5 text-night-500">
                These details shape how they appear and behave in the stories.
              </p>
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
              <p className="text-sm font-bold text-night-700">
                How Should We Picture Them?
              </p>
              <p className="mt-1 text-xs leading-5 text-night-500">
                Choose how Storycot creates the illustrated reference. You can
                upload a photo, or just describe how they look.
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {[
                  {
                    value: "photo" as const,
                    title: "Upload A Photo",
                    body: "We turn a clear photo into a Storycot-style reference.",
                  },
                  {
                    value: "description" as const,
                    title: "Describe Their Look",
                    body: "Write a few visual notes instead of a photo.",
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

              {newPersonMode === "photo" ? (
              <div className="mt-3 rounded-xl border border-night-100 bg-white p-3">
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
              ) : (
                <div className="mt-3">
                  <label className={formStyles.subLabel}>
                    Extra Visual Notes (Optional)
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
                    placeholder="Anything the age, height, and body build above don't cover: hair, glasses, usual outfit, etc."
                    className={formStyles.textarea}
                  />
                </div>
              )}
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
  );

  return (
    <div>
      {/* Modal overlay */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-end bg-night-900/55 px-4 pb-4 pt-10 backdrop-blur-sm sm:items-center sm:justify-center sm:p-6"
          onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
        >
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl">
            {formSection}
          </div>
        </div>
      )}

      {/* Page header */}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-4xl font-bold text-night-800">Family &amp; Friends</h1>
          <p className="mt-2 text-night-500">
            Add reusable people, pets, and companions. Pick who appears each time you create a story.
          </p>
        </div>
        <button
          type="button"
          onClick={openAddModal}
          className={buttonClassName({ size: "compact", className: "shrink-0" })}
        >
          <Icon name="plus" className="h-3.5 w-3.5" />
          Add Family &amp; Friends
        </button>
      </div>

      {/* People gallery */}
      <div className={people.length > 0 ? "grid gap-4 sm:grid-cols-2 lg:grid-cols-3" : undefined}>
        {people.length > 0 ? (
          people.map((person) => (
            <article
              key={person.id}
              className="flex flex-col rounded-2xl border border-night-100 bg-white p-5"
            >
              {(() => {
                const busy = generatingAvatarForId === person.id;
                const isDrawing = busy && drawingAvatarForId === person.id;

                return (
                  <>
                    {/* Header: avatar + name + buttons */}
                    <div className="flex items-start gap-3">
                      {isDrawing ? (
                        <div className="flex h-16 w-16 shrink-0 animate-pulse items-center justify-center rounded-full bg-star-100">
                          <div className="h-6 w-6 rounded-full bg-star-300" />
                        </div>
                      ) : person.avatarImageUrl ? (
                        <div
                          className="h-16 w-16 shrink-0 rounded-full bg-cover bg-center"
                          style={{ backgroundImage: `url("${person.avatarImageUrl}")` }}
                          aria-hidden="true"
                        />
                      ) : (
                        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-star-200 to-moon-200 font-display text-xl font-bold text-night-800">
                          {person.name[0]?.toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate font-display text-xl font-bold text-night-800">
                          {person.name}
                        </h3>
                        <p className="line-clamp-2 text-sm capitalize text-night-400">
                          {getStoryPersonRelationshipLabel(person)}
                          {person.pronouns ? ` · ${person.pronouns}` : ""}
                          {person.ageGroup && person.ageGroup !== "not_specified"
                            ? ` · ${getStoryPersonAgeGroupLabel(person.ageGroup)}`
                            : ""}
                          {person.height && person.height !== "not_specified"
                            ? ` · ${getStoryPersonHeightLabel(person.height)}`
                            : ""}
                          {person.bodyBuild && person.bodyBuild !== "not_specified"
                            ? ` · ${getBodyBuildLabel(person.bodyBuild)} build`
                            : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <button
                          type="button"
                          onClick={() => openEditModal(person)}
                          className={buttonClassName({ variant: "secondary", size: "compact" })}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(person)}
                          className={buttonClassName({ variant: "danger", size: "compact" })}
                        >
                          Remove
                        </button>
                      </div>
                    </div>

                    {/* Personality + Role summary */}
                    {(person.personality || person.description) && (
                      <div className="mt-4 grid gap-2 text-sm leading-5 text-night-600 sm:grid-cols-2">
                        {person.personality ? (
                          <p className="line-clamp-3">
                            <span className="font-bold text-night-700">Personality: </span>
                            {person.personality}
                          </p>
                        ) : null}
                        {person.description ? (
                          <p className="line-clamp-3">
                            <span className="font-bold text-night-700">Role: </span>
                            {person.description}
                          </p>
                        ) : null}
                      </div>
                    )}

                    {/* Availability badge pinned to bottom */}
                    <p className="mt-auto pt-4 rounded-full bg-night-50 px-3 py-1 text-xs font-semibold text-night-500 self-start">
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
              No one added yet
            </p>
            <p className="mt-1 text-sm leading-6 text-night-500">
              Start with Mum, Dad, a grandparent, sibling, or pet. You can pick
              who appears each time you make a story.
            </p>
            <button
              type="button"
              onClick={openAddModal}
              className={buttonClassName({ size: "compact", className: "mt-4" })}
            >
              <Icon name="plus" className="h-3.5 w-3.5" />
              Add Family & Friends
            </button>
          </div>
        )}
      </div>
      <ConfirmDialog />
    </div>
  );
}
