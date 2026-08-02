"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import Icon from "@/components/ui/Icon";
import { buttonClassName } from "@/components/ui/buttonStyles";
import { formStyles } from "@/components/ui/formStyles";
import type { ChildProfile } from "@/types";

type PendingPhoto = {
  file: File;
  previewUrl: string;
};

function isChildProfile(
  value: ChildProfile | { error?: string }
): value is ChildProfile {
  return "id" in value;
}

export default function ChildProfileReference({
  initialProfile,
}: {
  initialProfile: ChildProfile;
}) {
  const [profile, setProfile] = useState(initialProfile);
  const [pendingPhoto, setPendingPhoto] = useState<PendingPhoto | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  function stagePhoto(file: File | undefined) {
    if (!file) return;
    setError("");
    if (pendingPhoto) URL.revokeObjectURL(pendingPhoto.previewUrl);
    setPendingPhoto({
      file,
      previewUrl: URL.createObjectURL(file),
    });
  }

  function clearStagedPhoto() {
    if (pendingPhoto) URL.revokeObjectURL(pendingPhoto.previewUrl);
    setPendingPhoto(null);
  }

  async function generateReference() {
    if (!pendingPhoto) return;
    setError("");
    setGenerating(true);
    try {
      const formData = new FormData();
      formData.append("photo", pendingPhoto.file);
      const res = await fetch(`/api/profiles/${profile.id}/avatar`, {
        method: "POST",
        body: formData,
      });
      const data = (await res.json()) as ChildProfile | { error?: string };
      if (!res.ok || !isChildProfile(data)) {
        const message = isChildProfile(data)
          ? "Could not create the child reference"
          : data.error;
        throw new Error(message ?? "Could not create the child reference");
      }
      setProfile(data);
      clearStagedPhoto();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <section className="rounded-2xl border border-night-100 bg-white p-5">
      <div className="grid gap-4 md:grid-cols-[9rem_1fr]">
        <div className="overflow-hidden rounded-xl border border-night-100 bg-night-50">
          <div
            className="aspect-square bg-cover bg-center"
            style={{
              backgroundImage: profile.avatarImageUrl
                ? `url("${profile.avatarImageUrl}")`
                : undefined,
            }}
          >
            {!profile.avatarImageUrl ? (
              <div className="flex h-full items-center justify-center px-3 text-center text-xs font-bold text-night-300">
                No Child Reference Yet
              </div>
            ) : null}
          </div>
        </div>

        <div>
          <p className="font-display text-lg font-bold text-night-800">
            Child Illustration Reference
          </p>
          <p className="mt-1 text-sm leading-6 text-night-500">
            Upload or take a photo to create a Storycot-style reference for
            consistent storybook illustrations. The source photo is used once
            and is not stored.
          </p>
          {profile.appearanceSummary ? (
            <p className="mt-3 rounded-xl bg-night-50 px-3 py-2 text-sm leading-6 text-night-600">
              {profile.appearanceSummary}
            </p>
          ) : null}

          {pendingPhoto ? (
            <div className="mt-4 rounded-xl border border-star-200 bg-star-50 p-3">
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
                    This photo has not been saved. It will be used once to
                    create the illustrated child reference and fill visible
                    appearance notes where helpful.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="compact"
                      onClick={() => void generateReference()}
                      disabled={generating}
                    >
                      {generating ? "Creating..." : "Create Reference"}
                    </Button>
                    <button
                      type="button"
                      onClick={clearStagedPhoto}
                      className={buttonClassName({
                        variant: "secondary",
                        size: "compact",
                      })}
                      disabled={generating}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
            <label
              className={buttonClassName({
                variant: "secondary",
                size: "compact",
                className: generating
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
                disabled={generating}
                onChange={(event) => {
                  stagePhoto(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
            </label>
            <label
              className={buttonClassName({
                variant: "secondary",
                size: "compact",
                className: generating
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
                disabled={generating}
                onChange={(event) => {
                  stagePhoto(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
            </label>
          </div>

          {error ? <p className={formStyles.error}>{error}</p> : null}
        </div>
      </div>
    </section>
  );
}
