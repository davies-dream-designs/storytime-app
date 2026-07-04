import { test, expect } from "@playwright/test";

test("homepage loads and shows heading", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /app template/i })
  ).toBeVisible();
});

test("health endpoint returns ok", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  expect(body).toEqual({ status: "ok" });
});
