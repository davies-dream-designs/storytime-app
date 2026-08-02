"use client";

import { useEffect, useState } from "react";
import Button from "@/components/ui/Button";
import Icon from "@/components/ui/Icon";
import { buttonClassName } from "@/components/ui/buttonStyles";
import { formStyles } from "@/components/ui/formStyles";
import type { ChildProfile } from "@/types";

type PendingPhoto = {
  file: File;
  previewUrl: string;
  consent: boolean;
  adjustment: string;
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
  const [redoNote, setRedoNote] = useState("");
  const [showRedo, setShowRedo] = useState(false);
  const [error, setError] = useState("");
  const [creditInfo, setCreditInfo] = useState<{
    credits: number;
    isAdmin: boolean;
  } | null>(null);

  useEffect(() => {
    fetch("/api/user/credits")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setCreditInfo(data as { credits: number; isAdmin: boolean });
      })
      .catch(() => {});
  }, []);

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

  async function generateReference() {
    if (!pendingPhoto) return;
    if (!pendingPhoto.consent) {
      setError("Please confirm photo permission before creating a reference.");
      return;
    }
    const isRedo = Boolean(profile.avatarImageUrl);
    const cost = isRedo && !creditInfo?.isAdmin ? 1 : 0;
    if (cost > 0 && creditInfo && creditInfo.credits < cost) {
      setError("You need 1 credit to redo this illustrated reference.");
      return;
    }
    const confirmMessage =
      cost > 0
        ? "Redoing this illustrated reference will use 1 credit. Continue?"
        : isRedo
          ? "Redoing this illustrated reference is free for admins. Continue?"
          : "Creating the first illustrated reference is free. Continue?";
    if (!window.confirm(confirmMessage)) return;
    setError("");
    setGenerating(true);
    try {
      const formData = new FormData();
      formData.append("photo", pendingPhoto.file);
      formData.append("photoConsent", "yes");
      formData.append("adjustment", pendingPhoto.adjustment);
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
      window.dispatchEvent(new Event("storycot:credits-updated"));
      clearStagedPhoto();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setGenerating(false);
    }
  }

  async function redoReference() {
    const adjustment = redoNote.trim();
    if (!adjustment) {
      setError("Tell us what should change before redoing the reference.");
      return;
    }
    const cost = creditInfo?.isAdmin ? 0 : 1;
    if (cost > 0 && creditInfo && creditInfo.credits < cost) {
      setError("You need 1 credit to redo this illustrated reference.");
      return;
    }
    if (
      !window.confirm(
        cost > 0
          ? "Redoing this illustrated reference will use 1 credit. Continue?"
          : "Redoing this illustrated reference is free for admins. Continue?"
      )
    ) {
      return;
    }
    setError("");
    setGenerating(true);
    try {
      const res = await fetch(`/api/profiles/${profile.id}/avatar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adjustment }),
      });
      const data = (await res.json()) as ChildProfile | { error?: string };
      if (!res.ok || !isChildProfile(data)) {
        throw new Error(
          isChildProfile(data)
            ? "Could not redo the child reference"
            : data.error || "Could not redo the child reference"
        );
      }
      setProfile(data);
      setRedoNote("");
      setShowRedo(false);
      window.dispatchEvent(new Event("storycot:credits-updated"));
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
            className={`relative aspect-square bg-cover bg-center ${
              pendingPhoto ? "opacity-45" : ""
            }`}
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
            {pendingPhoto && profile.avatarImageUrl ? (
              <div className="absolute inset-x-2 bottom-2 rounded-full bg-white/90 px-2 py-1 text-center text-[0.7rem] font-bold uppercase text-night-500">
                Will Be Replaced
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

          {profile.avatarImageUrl ? (
            <div className="mt-3 rounded-xl border border-night-100 bg-night-50 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-bold uppercase tracking-wide text-night-400">
                  Redo Current Reference:{" "}
                  {creditInfo?.isAdmin ? "0 Credits (Admin)" : "1 Credit"}
                </p>
                <button
                  type="button"
                  onClick={() => setShowRedo((current) => !current)}
                  className={buttonClassName({
                    variant: "secondary",
                    size: "compact",
                  })}
                  disabled={generating}
                >
                  Redo
                </button>
              </div>
              {showRedo ? (
                <div className="mt-3">
                  <textarea
                    value={redoNote}
                    onChange={(event) =>
                      setRedoNote(event.target.value.slice(0, 240))
                    }
                    rows={2}
                    placeholder="Example: remove text, softer smile, hair closer to the photo."
                    className={formStyles.textarea}
                    disabled={generating}
                  />
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      size="compact"
                      onClick={() => void redoReference()}
                      disabled={generating || !redoNote.trim()}
                    >
                      {generating ? "Redoing..." : "Redo Reference"}
                    </Button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowRedo(false);
                        setRedoNote("");
                      }}
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
              ) : null}
            </div>
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
                  <label className="mt-3 block text-xs font-bold uppercase tracking-wide text-night-400">
                    Optional Adjustment
                  </label>
                  <textarea
                    value={pendingPhoto.adjustment}
                    onChange={(event) =>
                      setPendingPhoto((current) =>
                        current
                          ? { ...current, adjustment: event.target.value }
                          : current
                      )
                    }
                    rows={2}
                    maxLength={240}
                    placeholder="Example: closer to the photo, softer smile, darker hair, no text in the image."
                    className={formStyles.textarea}
                    disabled={generating}
                  />
                  <label className="mt-3 flex items-start gap-2 text-xs font-semibold leading-5 text-night-600">
                    <input
                      type="checkbox"
                      checked={pendingPhoto.consent}
                      onChange={(event) =>
                        setPendingPhoto((current) =>
                          current
                            ? { ...current, consent: event.target.checked }
                            : current
                        )
                      }
                      className="mt-1 h-4 w-4 rounded border-night-300"
                      disabled={generating}
                    />
                    I have permission to use this photo and understand it will
                    be used once to create an illustrated Storycot reference.
                  </label>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <p className="w-full text-xs font-bold uppercase tracking-wide text-night-400">
                      {profile.avatarImageUrl
                        ? creditInfo?.isAdmin
                          ? "Redo Cost: 0 Credits (Admin)"
                          : "Redo Cost: 1 Credit"
                        : "First Reference: Free"}
                    </p>
                    <Button
                      size="compact"
                      onClick={() => void generateReference()}
                      disabled={generating || !pendingPhoto.consent}
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
