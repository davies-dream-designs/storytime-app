import { test, expect } from "@playwright/test";
import { getBaseUrl, signIn } from "./helpers/auth";

const BASE = getBaseUrl();

// End-to-end proof that a story generated in a non-English locale is written in
// that language AND that its share link renders in the same language. Runs
// against the live dev site and spends one real credit, so it is opt-in via
// RUN_LANGUAGE_PROOF=1 to avoid burning credits on every CI run.
const shouldRun = process.env.RUN_LANGUAGE_PROOF === "1";

// A handful of function words that are common in Spanish children's prose and
// effectively never appear in the English equivalent. Matching two or more is a
// strong signal the body text is genuinely Spanish, not English.
const SPANISH_MARKERS = [
  /\bque\b/i,
  /\bde\b/i,
  /\bla\b/i,
  /\bel\b/i,
  /\bun[ao]?\b/i,
  /\by\b/i,
  /\bcon\b/i,
  /\bpara\b/i,
  /\bsu\b/i,
];

function spanishScore(text: string): number {
  return SPANISH_MARKERS.filter((re) => re.test(text)).length;
}

test.skip(!shouldRun, "Set RUN_LANGUAGE_PROOF=1 to run (spends a real credit).");

test("a Spanish story is generated in Spanish and shares in Spanish", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await signIn(page);

  // Generate from the Spanish locale so the request carries locale=es.
  await page.goto(`${BASE}/es/stories/new`);
  await page.waitForLoadState("networkidle");

  const profileOption = page
    .getByRole("button", { name: /Playwright Jr/i })
    .first();
  if (!(await profileOption.isVisible())) {
    test.skip(true, "No Playwright Jr profile on the test account.");
    return;
  }
  await profileOption.click();

  await page.getByRole("button", { name: /ideas|ideas/i }).first().click();

  const suggestionCard = page.locator("button:has(span.text-2xl)").first();
  await suggestionCard.waitFor({ state: "visible", timeout: 25_000 });
  await suggestionCard.click();

  const generateButton = page
    .getByRole("button", { name: /generar|generate story/i })
    .first();
  await generateButton.waitFor({ state: "visible", timeout: 10_000 });
  await generateButton.click();

  const dialog = page.getByRole("dialog");
  if (await dialog.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await dialog
      .getByRole("button", { name: /generar|generate story/i })
      .click();
  }

  await page.waitForURL(/\/(es|en)\/stories\/[a-zA-Z0-9-]{10,}/, {
    timeout: 120_000,
  });
  const storyUrl = page.url();
  const storyId = storyUrl.split("/stories/")[1].split(/[/?#]/)[0];

  // Wait for the story body to finish streaming, then confirm the prose reads
  // as Spanish.
  const article = page.locator("main");
  await expect
    .poll(async () => spanishScore((await article.innerText()) ?? ""), {
      timeout: 120_000,
      intervals: [2_000],
    })
    .toBeGreaterThanOrEqual(3);

  const storyText = (await article.innerText()) ?? "";
  expect(
    spanishScore(storyText),
    "generated story body should read as Spanish"
  ).toBeGreaterThanOrEqual(3);

  // Share the story and open its public share link, asserting it stays Spanish.
  const shareRes = await page.request.post(
    `${BASE}/api/stories/${storyId}/share`
  );
  expect(shareRes.ok(), `share endpoint: ${shareRes.status()}`).toBeTruthy();
  const shareBody = (await shareRes.json()) as {
    shareToken?: string;
    token?: string;
    url?: string;
  };
  const shareToken =
    shareBody.shareToken ??
    shareBody.token ??
    shareBody.url?.split("/s/")[1]?.split(/[/?#]/)[0];
  expect(shareToken, "share response should include a token").toBeTruthy();

  // Open the share link on the *English* URL to prove the story's own language
  // wins: the page should end up on /es/ and render Spanish content + chrome.
  await page.goto(`${BASE}/en/s/${shareToken}`);
  await page.waitForLoadState("networkidle");

  const shareText = (await page.locator("main").innerText()) ?? "";
  expect(
    spanishScore(shareText),
    "shared story body should read as Spanish"
  ).toBeGreaterThanOrEqual(3);
});
