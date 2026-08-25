"use client";

import { useEffect, useMemo, useState } from "react";
import Button from "@/components/ui/Button";
import Icon from "@/components/ui/Icon";
import type { LocationFixture, SceneLocation } from "@/types/printBook";
import { suggestFixtureMatches } from "@/lib/print-books/locationFixtures";
import { compressImageForUpload } from "@/lib/client/compressImage";

const MAX_LOCATION_PHOTOS = 5;

type Props = {
  projectId: string;
  locations: SceneLocation[];
  submitting: boolean;
  onCancel: () => void;
  onConfirm: (details: {
    notes: Record<string, string>;
    establishingImageUrls: Record<string, string>;
  }) => void;
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
        .filter((l) => l.establishingImageUrl ?? l.referenceImageUrl)
        .map((l) => [l.id, (l.establishingImageUrl ?? l.referenceImageUrl)!])
    )
  );
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [fixtures, setFixtures] = useState<LocationFixture[]>([]);
  const [savedLocationIds, setSavedLocationIds] = useState<Set<string>>(
    () => new Set()
  );
  const [dismissedSuggestions, setDismissedSuggestions] = useState<Set<string>>(
    () => new Set()
  );

  useEffect(() => {
    let cancelled = false;
    // Fixtures are a convenience; if the request fails the modal still works.
    fetch("/api/location-fixtures")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: LocationFixture[]) => {
        if (!cancelled && Array.isArray(data)) setFixtures(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const suggestionByLocationId = useMemo(() => {
    const map = new Map<string, LocationFixture>();
    for (const s of suggestFixtureMatches(locations, fixtures)) {
      map.set(s.location.id, s.fixture);
    }
    return map;
  }, [locations, fixtures]);

  function applyFixture(locationId: string, fixture: LocationFixture) {
    if (fixture.notes) {
      setNotes((prev) => ({ ...prev, [locationId]: fixture.notes as string }));
    }
    const fixtureImage =
      fixture.establishingImageUrl ?? fixture.referenceImageUrl;
    if (fixtureImage) {
      setPhotos((prev) => ({
        ...prev,
        [locationId]: fixtureImage,
      }));
    }
    setDismissedSuggestions((prev) => new Set(prev).add(locationId));
  }

  async function saveToLibrary(location: SceneLocation) {
    const note = (notes[location.id] ?? "").trim();
    const photo = photos[location.id];
    if (!note && !photo) return;
    try {
      const res = await fetch("/api/location-fixtures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          place: location.place,
          area: location.area,
          summary: location.summary,
          notes: note || undefined,
          establishingImageUrl: photo || undefined,
        }),
      });
      if (res.ok) {
        const created = (await res.json()) as LocationFixture;
        setFixtures((prev) => [created, ...prev]);
        setSavedLocationIds((prev) => new Set(prev).add(location.id));
      }
    } catch {
      // Non-fatal: saving to the library is optional.
    }
  }

  async function uploadPhotos(locationId: string, selected: File[]) {
    if (selected.length === 0) return;
    if (selected.length > MAX_LOCATION_PHOTOS) {
      setUploadError(
        `Please choose up to ${MAX_LOCATION_PHOTOS} photos at a time.`
      );
      return;
    }
    setUploadingId(locationId);
    setUploadError(null);
    try {
      const files = await Promise.all(
        selected.map((file) => compressImageForUpload(file))
      );
      const form = new FormData();
      for (const file of files) form.append("photos", file);
      form.append("photoConsent", "yes");
      const res = await fetch(
        `/api/books/${projectId}/locations/${locationId}/photo`,
        { method: "POST", body: form }
      );
      const data = (await res.json().catch(() => null)) as {
        establishingImageUrl?: string;
        error?: string;
      } | null;
      if (!res.ok || !data?.establishingImageUrl) {
        throw new Error(
          data?.error ?? "Couldn't draw this place. Please try again."
        );
      }
      setPhotos((prev) => ({
        ...prev,
        [locationId]: data.establishingImageUrl!,
      }));
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
            We spotted these places in your story. Add a quick note, or a few
            photos of the real place from different angles — we&apos;ll draw one
            storybook picture of it to keep it consistent, then discard your
            photos. Skip any you like — this is completely optional.
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
                {suggestionByLocationId.has(location.id) &&
                !dismissedSuggestions.has(location.id) ? (
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-star-200 bg-star-50 px-3 py-2">
                    <p className="text-xs text-night-600">
                      Looks like your saved{" "}
                      <span className="font-bold">
                        “{suggestionByLocationId.get(location.id)!.place}
                        {suggestionByLocationId.get(location.id)!.area
                          ? ` (${suggestionByLocationId.get(location.id)!.area})`
                          : ""}
                        ”
                      </span>
                      . Use those details?
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="secondary"
                        size="compact"
                        onClick={() =>
                          applyFixture(
                            location.id,
                            suggestionByLocationId.get(location.id)!
                          )
                        }
                      >
                        Use saved details
                      </Button>
                      <Button
                        variant="secondary"
                        size="compact"
                        onClick={() =>
                          setDismissedSuggestions((prev) =>
                            new Set(prev).add(location.id)
                          )
                        }
                      >
                        No thanks
                      </Button>
                    </div>
                  </div>
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
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  {photos[location.id] ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={photos[location.id]}
                        alt={`Illustration of ${location.name}`}
                        className="h-14 w-14 rounded-lg object-cover"
                      />
                      <Button
                        variant="secondary"
                        size="compact"
                        onClick={() => removePhoto(location.id)}
                        disabled={uploadingId === location.id}
                      >
                        Remove
                      </Button>
                    </>
                  ) : null}
                  <label
                    className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-night-200 px-3 py-1.5 text-sm font-bold text-night-700 ${
                      uploadingId === location.id
                        ? "pointer-events-none opacity-60"
                        : "hover:bg-night-50"
                    }`}
                  >
                    <Icon name="image" />
                    {uploadingId === location.id
                      ? "Drawing…"
                      : photos[location.id]
                        ? "Redraw from photos"
                        : "Upload photos"}
                    <input
                      type="file"
                      multiple
                      accept="image/jpeg,image/png,image/webp"
                      className="sr-only"
                      disabled={uploadingId === location.id}
                      onChange={(e) => {
                        const files = Array.from(e.target.files ?? []);
                        if (files.length > 0)
                          void uploadPhotos(location.id, files);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  <label
                    className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-night-200 px-3 py-1.5 text-sm font-bold text-night-700 ${
                      uploadingId === location.id
                        ? "pointer-events-none opacity-60"
                        : "hover:bg-night-50"
                    }`}
                  >
                    <Icon name="image" />
                    Take photo
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="sr-only"
                      disabled={uploadingId === location.id}
                      onChange={(e) => {
                        const files = Array.from(e.target.files ?? []);
                        if (files.length > 0)
                          void uploadPhotos(location.id, files);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  {(notes[location.id] ?? "").trim() || photos[location.id] ? (
                    <Button
                      variant="secondary"
                      size="compact"
                      onClick={() => saveToLibrary(location)}
                      disabled={savedLocationIds.has(location.id)}
                    >
                      {savedLocationIds.has(location.id)
                        ? "Saved to library ✓"
                        : "Save to library"}
                    </Button>
                  ) : null}
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
            onClick={() => onConfirm({ notes, establishingImageUrls: photos })}
            disabled={submitting || Boolean(uploadingId)}
          >
            {submitting ? "Creating…" : "Create book"}
          </Button>
        </div>
      </div>
    </div>
  );
}
