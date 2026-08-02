"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import Icon from "@/components/ui/Icon";
import { buttonClassName } from "@/components/ui/buttonStyles";
import { formStyles } from "@/components/ui/formStyles";
import type {
  ChildProfile,
  StoryPerson,
  StoryPersonRelationship,
} from "@/types";
import { STORY_PERSON_RELATIONSHIPS } from "@/types";

type FormState = {
  id?: string;
  name: string;
  relationship: StoryPersonRelationship;
  pronouns: string;
  description: string;
  personality: string;
  appearance: string;
  availableToAllProfiles: boolean;
  profileIds: string[];
};

const EMPTY_FORM: FormState = {
  name: "",
  relationship: "parent",
  pronouns: "",
  description: "",
  personality: "",
  appearance: "",
  availableToAllProfiles: true,
  profileIds: [],
};

function relationshipLabel(value: StoryPersonRelationship): string {
  return value
    .split("_")
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

function formFromPerson(person: StoryPerson): FormState {
  return {
    id: person.id,
    name: person.name,
    relationship: person.relationship,
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
  const [generatingAvatarForId, setGeneratingAvatarForId] = useState<
    string | null
  >(null);
  const [error, setError] = useState("");

  function toggleProfile(profileId: string) {
    setForm((current) => ({
      ...current,
      profileIds: current.profileIds.includes(profileId)
        ? current.profileIds.filter((id) => id !== profileId)
        : [...current.profileIds, profileId],
    }));
  }

  async function submit() {
    setError("");
    setSaving(true);
    try {
      const payload = {
        ...form,
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
      setPeople((current) =>
        form.id
          ? current.map((person) => (person.id === data.id ? data : person))
          : [data, ...current]
      );
      setForm({
        ...EMPTY_FORM,
        profileIds: defaultProfileId ? [defaultProfileId] : [],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  async function remove(person: StoryPerson) {
    if (!window.confirm(`Remove ${person.name} from Story People?`)) return;
    const res = await fetch(`/api/story-people/${person.id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setPeople((current) =>
        current.filter((currentPerson) => currentPerson.id !== person.id)
      );
    }
  }

  async function generateAvatar(person: StoryPerson, file: File | undefined) {
    if (!file) return;
    setError("");
    setGeneratingAvatarForId(person.id);
    try {
      const formData = new FormData();
      formData.append("photo", file);
      const res = await fetch(`/api/story-people/${person.id}/avatar`, {
        method: "POST",
        body: formData,
      });
      const data = (await res.json()) as StoryPerson | { error?: string };
      if (!res.ok || !isStoryPerson(data)) {
        const message = isStoryPerson(data)
          ? "Could not create the illustrated reference"
          : data.error;
        throw new Error(
          message ?? "Could not create the illustrated reference"
        );
      }
      setPeople((current) =>
        current.map((currentPerson) =>
          currentPerson.id === data.id ? data : currentPerson
        )
      );
      if (form.id === data.id) setForm(formFromPerson(data));
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

        <div className="mt-5 space-y-4">
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
                    relationship: event.target.value as StoryPersonRelationship,
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
          </div>

          <div>
            <label className={formStyles.subLabel}>Personality</label>
            <input
              value={form.personality}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  personality: event.target.value,
                }))
              }
              placeholder="gentle, funny, calm, adventurous"
              className={formStyles.field}
            />
          </div>

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

          <div>
            <label className={formStyles.subLabel}>Story Role</label>
            <textarea
              value={form.description}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
              rows={2}
              placeholder="How this person or pet should feel in stories."
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
              Available For All Child Profiles
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
            <Button onClick={submit} disabled={saving || !form.name.trim()}>
              {saving ? "Saving..." : form.id ? "Save Changes" : "Add Person"}
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
      </section>

      <section className="space-y-3">
        {people.length > 0 ? (
          people.map((person) => (
            <article
              key={person.id}
              className="rounded-2xl border border-night-100 bg-white p-5"
            >
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
                      {relationshipLabel(person.relationship)}
                      {person.pronouns ? ` · ${person.pronouns}` : ""}
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
                    <span className="font-bold text-night-700">Role:</span>{" "}
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

              <div className="mt-4 rounded-xl border border-night-100 bg-night-50 p-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-bold text-night-700">
                      Illustrated Reference
                    </p>
                    <p className="mt-1 text-xs leading-5 text-night-500">
                      Upload a photo to create a Storycot-style reference. The
                      source photo is used once and is not stored.
                    </p>
                  </div>
                  <label
                    className={buttonClassName({
                      variant: "secondary",
                      size: "compact",
                      className:
                        generatingAvatarForId === person.id
                          ? "pointer-events-none opacity-60"
                          : "cursor-pointer",
                    })}
                  >
                    <Icon name="image" />
                    {generatingAvatarForId === person.id
                      ? "Creating..."
                      : person.avatarImageUrl
                        ? "Replace"
                        : "Add Photo"}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="sr-only"
                      disabled={generatingAvatarForId === person.id}
                      onChange={(event) => {
                        void generateAvatar(person, event.target.files?.[0]);
                        event.target.value = "";
                      }}
                    />
                  </label>
                </div>
              </div>

              <p className="mt-4 rounded-full bg-night-50 px-3 py-1 text-xs font-semibold text-night-500">
                {person.availableToAllProfiles
                  ? "Available for all child profiles"
                  : `Linked to ${person.profileIds.length} child profile${
                      person.profileIds.length === 1 ? "" : "s"
                    }`}
              </p>
            </article>
          ))
        ) : (
          <div className="rounded-2xl border-2 border-dashed border-night-200 p-8 text-center">
            <Icon name="profile" className="mx-auto h-8 w-8 text-star-500" />
            <p className="mt-3 font-display font-bold text-night-700">
              No Story People Yet
            </p>
            <p className="mt-1 text-sm leading-6 text-night-500">
              Start with Mum, Dad, a grandparent, sibling, or pet. You can pick
              who appears each time you make a story.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
