import { test, expect } from "@playwright/test";

test("landing tells an illustrated story and explains paid upgrades", async ({
  page,
}) => {
  await page.goto("/en");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Their little world. An extraordinary story."
  );
  await page.getByRole("link", { name: "Step inside a story" }).first().click();
  await expect(page).toHaveURL(/#story$/);
  await expect(
    page.getByRole("heading", { name: "It starts with someone you know." })
  ).toBeVisible();
  await expect(
    page.getByText(/Stories cost 1 credit; illustrations cost extra/)
  ).toBeVisible();
  const artwork = page.locator('img[src*="landing"]');
  await expect(artwork).toHaveCount(4);
  for (const image of await artwork.all()) {
    await image.scrollIntoViewIfNeeded();
    await expect
      .poll(() =>
        image.evaluate(
          (element: HTMLImageElement) =>
            element.complete && element.naturalWidth > 0
        )
      )
      .toBe(true);
    await expect(image).toHaveAttribute("alt", /.+/);
  }
  await expect(
    page.getByRole("link", { name: "Create your first story" }).first()
  ).toHaveAttribute("href", "/en/dashboard");
});

for (const width of [390, 1440]) {
  test(`landing fits a ${width}px viewport and switches UI language`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/en");
    await page.getByRole("button", { name: "Language", exact: true }).click();
    await page.getByRole("option", { name: /Español/ }).click();
    await expect(page).toHaveURL(/\/es\/?$/);
    await expect(page.getByRole("heading", { level: 1 })).not.toHaveText(
      "Their little world. An extraordinary story."
    );
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      )
    ).toBe(true);
  });
}

test("health endpoint returns ok", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  expect(body).toEqual({ status: "ok" });
});
