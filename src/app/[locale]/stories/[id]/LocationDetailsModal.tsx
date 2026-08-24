"use client";

import { useRef, useState } from "react";
import Button from "@/components/ui/Button";
import Icon from "@/components/ui/Icon";
import type { SceneLocation } from "@/types/printBook";

type Props = {
  projectId: string;
  locations: SceneLocation[];
  submitting: boolean;
  onCancel: () => void;
  onConfirm: (notes: Record<string, string>) => void;
};

/**
 * After the location bible is prepared, let the parent optionally add
 * ground-truth notes and a reference photo per place before illustrations are
 * drawn. Everything here is skippable — "Create book" works with no input.
 * Photos upload immediately (so they persist on the bible); notes are collected
 * locally and saved on confirm.
 */
export default function LocationDetailsModal({
  projectId,
  locations,
  submitting,
  onCancel,
  onConfirm,
}: Props) {
  const [notes, setNotes] = useState<Record<string, string>>(() =>
    Object.fromEntries(locations.map((l) => [l.id, l.notes ?? ""]))
  );
  const [photos, setPhotos] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      locations
        .filter((l) => l.referenceImageUrl)
        .map((l) => [l.id, l.referenceImageUrl as string])
    )
  );
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});

  async function uploadPhoto(locationId: string, file: File) {
    setUploadingId(locationId);
    setUploadError(null);
    try {
      const form = new FormData();
      form.append("photo", file);
      form.append("photoConsent", "yes");
      const res = await fetch(
        `/api/books/${projectId}/locations/${locationId}/photo`,
        { method: "POST", body: form }
      );
      const data = (await res.json().catch(() => null)) as {
        referenceImageUrl?: string;
        error?: string;
      } | null;
      if (!res.ok || !data?.referenceImageUrl) {
        throw new Error(data?.error ?? "Upload failed. Please try again.");
      }
      setPhotos((prev) => ({ ...prev, [locationId]: data.referenceImageUrl! }));
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploadingId(null);
    }
  }

  async function removePhoto(locationId: string) {
    setUploadingId(locationId);
    setUploadError(null);
    try {
      await fetch(`/api/books/${projectId}/locations/${locationId}/photo`, {
        method: "DELETE",
      });
      setPhotos((prev) => {
        const next = { ...prev };
        delete next[locationId];
        return next;
      });
    } finally {
      setUploadingId(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-night-900/60 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="location-details-title"
    >
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-white shadow-xl">
        <div className="border-b border-night-100 p-5">
          <h2
            id="location-details-title"
            className="text-lg font-bold text-night-800"
          >
            Add real-life details (optional)
          </h2>
          <p className="mt-1 text-sm text-night-500">
            We spotted these places in your story. Add a quick note or a photo of
            the real place and we&apos;ll match the illustrations to it. Skip any
            you like — this is completely optional.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <ul className="space-y-4">
            {locations.map((location) => (
              <li
                key={location.id}
                className="rounded-2xl border border-night-100 p-4"
              >
                <p className="font-bold text-night-800">{location.name}</p>
                {location.summary ? (
                  <p className="mt-0.5 text-xs text-night-500">
                    {location.summary}
                  </p>
                ) : null}
                <textarea
                  value={notes[location.id] ?? ""}
                  onChange={(e) =>
                    setNotes((prev) => ({
                      ...prev,
                      [location.id]: e.target.value,
                    }))
                  }
                  placeholder="e.g. white metal cot under the window, grey rug, yellow curtains"
                  rows={2}
                  className="mt-3 w-full rounded-xl border border-night-200 px-3 py-2 text-sm focus:border-star-300 focus:outline-none"
                />
                <div className="mt-3 flex items-center gap-3">
                  <input
                    ref={(el) => {
                      fileInputs.current[location.id] = el;
                    }}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void uploadPhoto(location.id, file);
                      e.target.value = "";
                    }}
                  />
                  {photos[location.id] ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={photos[location.id]}
                        alt={`Reference for ${location.name}`}
                        className="h-14 w-14 rounded-lg object-cover"
                      />
                      <Button
                        variant="secondary"
                        size="compact"
                        onClick={() => removePhoto(location.id)}
                        disabled={uploadingId === location.id}
                      >
                        Remove photo
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="secondary"
                      size="compact"
                      onClick={() => fileInputs.current[location.id]?.click()}
                      disabled={uploadingId === location.id}
                    >
                      <Icon name="image" />
                      {uploadingId === location.id
                        ? "Uploading…"
                        : "Add photo"}
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {uploadError ? (
            <p role="alert" className="mt-3 text-sm font-bold text-blush-600">
              {uploadError}
            </p>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-night-100 p-5">
          <Button
            variant="secondary"
            onClick={onCancel}
            disabled={submitting || Boolean(uploadingId)}
          >
            Cancel
          </Button>
          <Button
            onClick={() => onConfirm(notes)}
            disabled={submitting || Boolean(uploadingId)}
          >
            {submitting ? "Creating…" : "Create book"}
          </Button>
        </div>
      </div>
    </div>
  );
}
