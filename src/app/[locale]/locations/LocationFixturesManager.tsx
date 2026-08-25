"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import Button from "@/components/ui/Button";
import Icon from "@/components/ui/Icon";
import { compressImageForUpload } from "@/lib/client/compressImage";
import type { LocationFixture } from "@/types/printBook";

const MAX_LOCATION_PHOTOS = 5;

type Props = {
  initialFixtures: LocationFixture[];
};

type FormState = {
  id?: string;
  place: string;
  area: string;
  summary: string;
  notes: string;
  lighting: string;
  establishingImageUrl?: string;
  establishingImageStatus?: LocationFixture["establishingImageStatus"];
  establishingImageError?: string;
  establishingImageJobId?: string;
};

const emptyForm: FormState = {
  place: "",
  area: "",
  summary: "",
  notes: "",
  lighting: "",
};

type LocationPhotoJobResponse = {
  jobId?: string;
  status?: LocationFixture["establishingImageStatus"];
  establishingImageUrl?: string;
  fixture?: LocationFixture;
  error?: string;
};

function isPendingLocationImage(
  status?: LocationFixture["establishingImageStatus"]
): boolean {
  return status === "queued" || status === "running";
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fixtureToForm(fixture: LocationFixture): FormState {
  return {
    id: fixture.id,
    place: fixture.place,
    area: fixture.area ?? "",
    summary: fixture.summary ?? "",
    notes: fixture.notes ?? "",
    lighting: fixture.lighting ?? "",
    establishingImageUrl: fixture.establishingImageUrl,
    establishingImageStatus: fixture.establishingImageStatus,
    establishingImageError: fixture.establishingImageError,
    establishingImageJobId: fixture.establishingImageJobId,
  };
}

function fixtureLabel(fixture: LocationFixture): string {
  return fixture.area ? `${fixture.place} (${fixture.area})` : fixture.place;
}

/**
 * Account-level manager for the reusable Location Fixtures library. Mirrors the
 * Family & Friends (StoryPeopleManager) pattern: list saved places, add/edit,
 * upload a reference photo, delete. Backed entirely by /api/location-fixtures.
 */
export default function LocationFixturesManager({ initialFixtures }: Props) {
  const [fixtures, setFixtures] = useState<LocationFixture[]>(initialFixtures);
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [cameraPhotos, setCameraPhotos] = useState<File[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);

  function clearCameraPhotos() {
    setCameraPhotos([]);
  }

  function startAdd() {
    setError(null);
    clearCameraPhotos();
    setForm({ ...emptyForm });
  }

  function startEdit(fixture: LocationFixture) {
    setError(null);
    clearCameraPhotos();
    setForm(fixtureToForm(fixture));
  }

  function closeForm() {
    setForm(null);
    setError(null);
    clearCameraPhotos();
  }

  async function persistForm(currentForm: FormState): Promise<LocationFixture> {
    if (!currentForm.place.trim()) {
      throw new Error("Please give the place a name.");
    }

    const payload = {
      place: currentForm.place.trim(),
      area: currentForm.area.trim() || undefined,
      summary: currentForm.summary.trim() || undefined,
      notes: currentForm.notes.trim() || undefined,
      lighting: currentForm.lighting.trim() || undefined,
    };
    const res = await fetch(
      currentForm.id
        ? `/api/location-fixtures/${currentForm.id}`
        : "/api/location-fixtures",
      {
        method: currentForm.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      throw new Error(data?.error ?? "Could not save this place.");
    }

    const saved = (await res.json()) as LocationFixture;
    upsertFixture(saved);
    return saved;
  }

  function upsertFixture(fixture: LocationFixture) {
    setFixtures((prev) => {
      const without = prev.filter((f) => f.id !== fixture.id);
      return [fixture, ...without].sort((a, b) =>
        fixtureLabel(a).localeCompare(fixtureLabel(b))
      );
    });
    setForm((prev) =>
      prev?.id === fixture.id ? { ...prev, ...fixtureToForm(fixture) } : prev
    );
  }

  async function pollLocationPhotoJob(
    fixtureId: string,
    jobId?: string
  ): Promise<LocationFixture> {
    for (let attempt = 0; attempt < 90; attempt += 1) {
      await wait(attempt === 0 ? 900 : 2000);
      const res = await fetch(`/api/location-fixtures/${fixtureId}/photo`, {
        cache: "no-store",
      });
      const data = (await res
        .json()
        .catch(() => null)) as LocationPhotoJobResponse | null;
      if (!res.ok || !data?.fixture) {
        throw new Error(data?.error ?? "Couldn't check drawing progress.");
      }
      if (jobId && data.fixture.establishingImageJobId !== jobId) {
        if (data.fixture.establishingImageUrl) return data.fixture;
        throw new Error("A newer drawing was started for this location.");
      }
      upsertFixture(data.fixture);
      if (
        data.status === "failed" ||
        data.fixture.establishingImageStatus === "failed"
      ) {
        throw new Error(
          data.error ??
            data.fixture.establishingImageError ??
            "Couldn't draw this place. Please try again."
        );
      }
      if (
        data.fixture.establishingImageUrl &&
        !isPendingLocationImage(data.status)
      ) {
        return data.fixture;
      }
    }
    throw new Error(
      "This location is still drawing in the background. You can close this and check back shortly."
    );
  }

  async function save() {
    if (!form) return;
    if (cameraPhotos.length > 0) {
      const uploaded = await uploadPhotos(cameraPhotos);
      if (uploaded) closeForm();
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await persistForm(form);
      closeForm();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not save this place."
      );
    } finally {
      setSaving(false);
    }
  }

  async function remove(fixture: LocationFixture) {
    if (
      !window.confirm(
        `Remove "${fixtureLabel(fixture)}" from your saved locations?`
      )
    ) {
      return;
    }
    setDeletingId(fixture.id);
    try {
      const res = await fetch(`/api/location-fixtures/${fixture.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setFixtures((prev) => prev.filter((f) => f.id !== fixture.id));
      }
    } finally {
      setDeletingId(null);
    }
  }

  async function uploadPhotos(selected: File[]): Promise<boolean> {
    if (!form) return false;
    if (selected.length === 0) return false;
    if (selected.length > MAX_LOCATION_PHOTOS) {
      setError(`Please choose up to ${MAX_LOCATION_PHOTOS} photos at a time.`);
      return false;
    }
    setUploading(true);
    setSaving(true);
    setError(null);
    try {
      const savedFixture = await persistForm(form);
      const fixtureId = savedFixture.id;
      setForm(fixtureToForm(savedFixture));

      const files = await Promise.all(
        selected.map((file) => compressImageForUpload(file))
      );
      const body = new FormData();
      for (const file of files) body.append("photos", file);
      body.append("photoConsent", "yes");
      const res = await fetch(`/api/location-fixtures/${fixtureId}/photo`, {
        method: "POST",
        body,
      });
      const data = (await res
        .json()
        .catch(() => null)) as LocationPhotoJobResponse | null;
      if (!res.ok || !data) {
        throw new Error(
          data?.error ?? "Couldn't draw this place. Please try again."
        );
      }
      const queuedFixture =
        data.fixture ??
        ({
          ...savedFixture,
          establishingImageUrl: data.establishingImageUrl,
          referenceImageUrl: undefined,
          establishingImageStatus: data.status,
          establishingImageJobId: data.jobId,
        } satisfies LocationFixture);
      upsertFixture(queuedFixture);
      if (isPendingLocationImage(data.status)) {
        void pollLocationPhotoJob(fixtureId, data.jobId).catch(() => undefined);
      }
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
      return false;
    } finally {
      setUploading(false);
      setSaving(false);
    }
  }

  function appendCameraPhotos(selected: File[]) {
    if (selected.length === 0) return;
    const remainingSlots = MAX_LOCATION_PHOTOS - cameraPhotos.length;
    if (remainingSlots <= 0) {
      setError(`You already have ${MAX_LOCATION_PHOTOS} photos ready.`);
      return;
    }
    const accepted = selected.slice(0, remainingSlots);
    setCameraPhotos((prev) => [...prev, ...accepted]);
    setError(
      selected.length > remainingSlots
        ? `Added ${accepted.length} photo${accepted.length === 1 ? "" : "s"}. You can use up to ${MAX_LOCATION_PHOTOS} photos.`
        : null
    );
  }

  async function uploadCameraPhotos() {
    const uploaded = await uploadPhotos(cameraPhotos);
    if (uploaded) clearCameraPhotos();
  }

  return (
    <div>
      <div className="mb-6 flex justify-end">
        <Button onClick={startAdd} size="compact">
          <Icon name="plus" />
          Add a location
        </Button>
      </div>

      {fixtures.length === 0 && !form ? (
        <div className="rounded-2xl border border-dashed border-night-200 p-10 text-center">
          <p className="font-bold text-night-700">No saved locations yet</p>
          <p className="mt-1 text-sm text-night-500">
            Save real places you use often — a bedroom, Grandma&apos;s house,
            the car — with notes and a photo, and reuse them across every book.
          </p>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {fixtures.map((fixture) => (
            <li
              key={fixture.id}
              className="flex gap-4 rounded-2xl border border-night-100 p-4"
            >
              {fixture.establishingImageUrl ? (
                <Image
                  src={fixture.establishingImageUrl}
                  alt={`Illustration of ${fixtureLabel(fixture)}`}
                  width={112}
                  height={112}
                  className="h-28 w-28 shrink-0 rounded-xl object-cover shadow-sm"
                />
              ) : (
                <div className="flex h-28 w-28 shrink-0 flex-col items-center justify-center rounded-xl bg-night-50 text-night-300">
                  <Icon name="image" className="h-8 w-8" />
                  {isPendingLocationImage(fixture.establishingImageStatus) ? (
                    <span className="mt-1 text-[10px] font-bold uppercase tracking-wide text-night-400">
                      Drawing…
                    </span>
                  ) : null}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold text-night-800">
                  {fixtureLabel(fixture)}
                </p>
                {fixture.summary ? (
                  <p className="mt-0.5 line-clamp-2 text-xs text-night-500">
                    {fixture.summary}
                  </p>
                ) : null}
                {fixture.notes ? (
                  <p className="mt-1 line-clamp-2 text-xs text-night-400">
                    {fixture.notes}
                  </p>
                ) : null}
                {isPendingLocationImage(fixture.establishingImageStatus) ? (
                  <p className="mt-1 text-xs font-bold text-star-600">
                    Drawing this location in the background — safe to leave this
                    page.
                  </p>
                ) : fixture.establishingImageStatus === "failed" ? (
                  <p className="mt-1 text-xs font-bold text-blush-600">
                    Drawing failed. Edit and try uploading the photos again.
                  </p>
                ) : null}
                <div className="mt-2 flex gap-2">
                  <Button
                    variant="secondary"
                    size="compact"
                    onClick={() => startEdit(fixture)}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="secondary"
                    size="compact"
                    onClick={() => remove(fixture)}
                    disabled={deletingId === fixture.id}
                  >
                    <Icon name="trash" />
                    {deletingId === fixture.id ? "Removing…" : "Remove"}
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {form ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-night-900/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="location-form-title"
        >
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-white shadow-xl">
            <div className="border-b border-night-100 p-5">
              <h2
                id="location-form-title"
                className="text-lg font-bold text-night-800"
              >
                {form.id ? "Edit location" : "Add a location"}
              </h2>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-5">
              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm font-bold text-night-700">
                  Place
                  <input
                    value={form.place}
                    onChange={(e) =>
                      setForm({ ...form, place: e.target.value })
                    }
                    placeholder="e.g. Grandma's house"
                    className="mt-1 w-full rounded-xl border border-night-200 px-3 py-2 text-sm font-normal focus:border-star-300 focus:outline-none"
                  />
                </label>
                <label className="text-sm font-bold text-night-700">
                  Area (optional)
                  <input
                    value={form.area}
                    onChange={(e) => setForm({ ...form, area: e.target.value })}
                    placeholder="e.g. Lounge"
                    className="mt-1 w-full rounded-xl border border-night-200 px-3 py-2 text-sm font-normal focus:border-star-300 focus:outline-none"
                  />
                </label>
              </div>
              <label className="block text-sm font-bold text-night-700">
                Summary (optional)
                <input
                  value={form.summary}
                  onChange={(e) =>
                    setForm({ ...form, summary: e.target.value })
                  }
                  placeholder="A short description of the place"
                  className="mt-1 w-full rounded-xl border border-night-200 px-3 py-2 text-sm font-normal focus:border-star-300 focus:outline-none"
                />
              </label>
              <label className="block text-sm font-bold text-night-700">
                Details to keep consistent (optional)
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={3}
                  placeholder="e.g. white metal cot under the window, grey rug, yellow curtains"
                  className="mt-1 w-full rounded-xl border border-night-200 px-3 py-2 text-sm font-normal focus:border-star-300 focus:outline-none"
                />
              </label>
              <label className="block text-sm font-bold text-night-700">
                Lighting (optional)
                <input
                  value={form.lighting}
                  onChange={(e) =>
                    setForm({ ...form, lighting: e.target.value })
                  }
                  placeholder="e.g. warm afternoon light from the left"
                  className="mt-1 w-full rounded-xl border border-night-200 px-3 py-2 text-sm font-normal focus:border-star-300 focus:outline-none"
                />
              </label>

              <div>
                <p className="text-sm font-bold text-night-700">
                  Illustration of this place (optional)
                </p>
                <p className="mt-0.5 text-xs text-night-400">
                  Add up to {MAX_LOCATION_PHOTOS} photos from different angles —
                  we draw one storybook picture of the space to keep it
                  consistent, then discard your photos. We keep the
                  illustration, not your photos.
                </p>
                {form.establishingImageUrl ? (
                  <div className="mt-3 overflow-hidden rounded-2xl border border-night-100 bg-night-50 shadow-sm">
                    <Image
                      src={form.establishingImageUrl}
                      alt="Illustration of this place"
                      width={720}
                      height={720}
                      sizes="(min-width: 640px) 32rem, 100vw"
                      className="aspect-square w-full object-cover"
                    />
                    <div className="border-t border-night-100 bg-white px-3 py-2">
                      <p className="text-xs font-bold uppercase tracking-[0.18em] text-night-400">
                        Current illustration preview
                      </p>
                    </div>
                  </div>
                ) : null}
                {isPendingLocationImage(form.establishingImageStatus) ? (
                  <p className="mt-3 rounded-xl bg-star-50 px-3 py-2 text-xs font-bold text-star-700">
                    Drawing is running in the background now. Tap Done or close
                    this window — you do not need to wait here. The illustration
                    will appear on this page when it finishes.
                  </p>
                ) : form.establishingImageStatus === "failed" ? (
                  <p className="mt-3 rounded-xl bg-blush-50 px-3 py-2 text-xs font-bold text-blush-700">
                    Drawing failed:{" "}
                    {form.establishingImageError ??
                      "Please try uploading the photos again."}
                  </p>
                ) : null}

                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <label
                    className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-night-200 px-3 py-1.5 text-sm font-bold text-night-700 ${
                      uploading || saving || !form.place.trim()
                        ? "pointer-events-none opacity-60"
                        : "hover:bg-night-50"
                    }`}
                  >
                    <Icon name="image" />
                    {uploading
                      ? "Starting…"
                      : form.establishingImageUrl
                        ? "Start redraw"
                        : "Upload photos"}
                    <input
                      ref={fileInput}
                      type="file"
                      multiple
                      accept="image/jpeg,image/png,image/webp"
                      className="sr-only"
                      disabled={uploading || saving || !form.place.trim()}
                      onChange={(e) => {
                        const files = Array.from(e.target.files ?? []);
                        if (files.length > 0) void uploadPhotos(files);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  <label
                    className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-night-200 px-3 py-1.5 text-sm font-bold text-night-700 ${
                      uploading ||
                      saving ||
                      !form.place.trim() ||
                      cameraPhotos.length >= MAX_LOCATION_PHOTOS
                        ? "pointer-events-none opacity-60"
                        : "hover:bg-night-50"
                    }`}
                  >
                    <Icon name="image" />
                    {cameraPhotos.length > 0
                      ? "Take another photo"
                      : "Take photo"}
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="sr-only"
                      disabled={
                        uploading ||
                        saving ||
                        !form.place.trim() ||
                        cameraPhotos.length >= MAX_LOCATION_PHOTOS
                      }
                      onChange={(e) => {
                        const files = Array.from(e.target.files ?? []);
                        appendCameraPhotos(files);
                        e.target.value = "";
                      }}
                    />
                  </label>
                </div>
                {cameraPhotos.length > 0 ? (
                  <div className="mt-3 rounded-2xl border border-sky-100 bg-sky-50/70 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-bold text-sky-800">
                        {cameraPhotos.length} of {MAX_LOCATION_PHOTOS} camera
                        photo{cameraPhotos.length === 1 ? "" : "s"} ready
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="compact"
                          onClick={() => void uploadCameraPhotos()}
                          disabled={uploading || saving || !form.place.trim()}
                        >
                          {uploading
                            ? "Starting…"
                            : `Start background drawing from ${
                                cameraPhotos.length
                              } photo${cameraPhotos.length === 1 ? "" : "s"}`}
                        </Button>
                        <Button
                          variant="secondary"
                          size="compact"
                          onClick={clearCameraPhotos}
                          disabled={uploading || saving}
                        >
                          Clear
                        </Button>
                      </div>
                    </div>
                    <p className="mt-1 text-xs text-sky-700/75">
                      Take another angle before drawing if you want the layout,
                      window, doors, and furniture positions to be clearer.
                    </p>
                  </div>
                ) : null}
                {!form.id ? (
                  <p className="mt-1 text-xs text-night-400">
                    {form.place.trim()
                      ? "We'll save this place automatically before uploading the photos."
                      : "Add a place name first, then photos can be attached automatically."}
                  </p>
                ) : null}
              </div>

              {error ? (
                <p role="alert" className="text-sm font-bold text-blush-600">
                  {error}
                </p>
              ) : null}
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-night-100 p-5">
              <Button
                variant="secondary"
                onClick={closeForm}
                disabled={saving || uploading}
              >
                {isPendingLocationImage(form.establishingImageStatus)
                  ? "Close"
                  : "Cancel"}
              </Button>
              <Button onClick={save} disabled={saving || uploading}>
                {saving || uploading
                  ? "Starting…"
                  : cameraPhotos.length > 0
                    ? `Save & start drawing in background from ${
                        cameraPhotos.length
                      } photo${cameraPhotos.length === 1 ? "" : "s"}`
                    : isPendingLocationImage(form.establishingImageStatus)
                      ? "Done"
                      : "Save location"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
