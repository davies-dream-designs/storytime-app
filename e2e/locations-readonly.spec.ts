import { test, expect } from "@playwright/test";
import { getBaseUrl, signIn } from "./helpers/auth";

const BASE = getBaseUrl();

// Read-only verification of the locations UI changes on this branch's preview.
// Deliberately does NOT save a location, upload a photo, or spend credits — it
// only opens pages/modals to confirm the new UI renders on the deployed build.

test("health endpoint is ok", async ({ request }) => {
  const res = await request.get(`${BASE}/api/health`);
  expect(res.ok()).toBeTruthy();
  expect(await res.json()).toEqual({ status: "ok" });
});

test("authenticated app is healthy on the branch preview (stories library renders)", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(`${BASE}/en/stories`);
  await page.waitForLoadState("networkidle");
  // Not an error boundary — a real page rendered.
  await expect(page.locator("h1")).not.toHaveText(/fluttered out of place/i);
  await expect(page.getByRole("link", { name: /^stories$/i })).toBeVisible();
});

// NOTE: /en/locations cannot be exercised against this preview until migration
// 0023 (the location_fixtures.views column) is applied to the preview's
// database — otherwise the page 500s ("A page fluttered out of place."). That
// migration is intentionally authored-but-unapplied; see the manual checklist.
test.skip("locations page + multi-perspective UI (needs migration 0023 applied)", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(`${BASE}/en/locations`);
  await page.waitForLoadState("networkidle");
  await expect(
    page.getByRole("heading", { name: /locations/i }).first()
  ).toBeVisible();
  await page.getByRole("button", { name: /add a location/i }).first().click();
  await expect(
    page.getByRole("heading", { name: /add a location/i })
  ).toBeVisible();
});
