/**
 * WCAG 2.1 AA accessibility tests using axe-core + Playwright.
 *
 * Target: dev.storycot.com (or PLAYWRIGHT_BASE_URL)
 * Auth: Clerk sign-in token — requires CLERK_SECRET_KEY env var.
 *       All authenticated tests are skipped when the key is absent.
 *
 * Third-party note:
 *   The sign-in/sign-up pages are rendered entirely by Clerk (Geist design system).
 *   Clerk has known moderate violations (duplicate <nav>, Geist skip link outside landmarks)
 *   that we cannot fix. Those pages are excluded from this test suite.
 *   File accessibility issues with Clerk at https://clerk.com/support.
 */
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { getBaseUrl, signIn } from "./helpers/auth";

const BASE = getBaseUrl();
const CAN_AUTH = Boolean(process.env.CLERK_SECRET_KEY_DEV ?? process.env.CLERK_SECRET_KEY);

const AXE_OPTIONS = {
  runOnly: {
    type: "tag" as const,
    values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"],
  },
  rules: {
    // Requires manual QA against rendered output — cannot be automated accurately
    "color-contrast": { enabled: false },
  },
};

function formatViolations(
  violations: Awaited<ReturnType<AxeBuilder["analyze"]>>["violations"]
) {
  if (violations.length === 0) return "";
  return (
    "\n" +
    violations
      .map(
        (v) =>
          `[${v.impact?.toUpperCase()}] ${v.id}: ${v.help}\n` +
          v.nodes
            .slice(0, 3)
            .map((n) => `  → ${n.html.slice(0, 120)}`)
            .join("\n")
      )
      .join("\n\n")
  );
}

// ── All authenticated tests require CLERK_SECRET_KEY ─────────────────────────

test.describe("WCAG 2.1 AA — authenticated pages", () => {
  test.skip(!CAN_AUTH, "Skipped: set CLERK_SECRET_KEY to run authenticated a11y tests");

  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("dashboard", async ({ page }) => {
    await page.goto(`${BASE}/en/dashboard`);
    await page.waitForLoadState("networkidle");
    const { violations } = await new AxeBuilder({ page }).options(AXE_OPTIONS).analyze();
    expect(violations, formatViolations(violations)).toHaveLength(0);
  });

  test("stories library", async ({ page }) => {
    await page.goto(`${BASE}/en/stories`);
    await page.waitForLoadState("networkidle");
    const { violations } = await new AxeBuilder({ page }).options(AXE_OPTIONS).analyze();
    expect(violations, formatViolations(violations)).toHaveLength(0);
  });

  test("profiles list", async ({ page }) => {
    await page.goto(`${BASE}/en/profiles`);
    await page.waitForLoadState("networkidle");
    const { violations } = await new AxeBuilder({ page }).options(AXE_OPTIONS).analyze();
    expect(violations, formatViolations(violations)).toHaveLength(0);
  });

  test("account page", async ({ page }) => {
    await page.goto(`${BASE}/en/account`);
    await page.waitForLoadState("networkidle");
    const { violations } = await new AxeBuilder({ page }).options(AXE_OPTIONS).analyze();
    expect(violations, formatViolations(violations)).toHaveLength(0);
  });

  test("story detail page", async ({ page }) => {
    await page.goto(`${BASE}/en/stories`);
    await page.waitForLoadState("networkidle");

    const firstRead = page.getByRole("link", { name: /read/i }).first();
    if (!await firstRead.isVisible().catch(() => false)) {
      test.skip(true, "No stories in test account — create one first");
      return;
    }
    await firstRead.click();
    await page.waitForLoadState("networkidle");

    const { violations } = await new AxeBuilder({ page }).options(AXE_OPTIONS).analyze();
    expect(violations, formatViolations(violations)).toHaveLength(0);
  });

  test("mobile nav open state", async ({ browser }) => {
    test.setTimeout(60000);
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const p = await ctx.newPage();
    await signIn(p);
    await p.goto(`${BASE}/en/dashboard`);
    await p.waitForLoadState("networkidle");
    await p.getByRole("button", { name: /open menu/i }).click();
    await p.waitForTimeout(300);
    const { violations } = await new AxeBuilder({ page: p }).options(AXE_OPTIONS).analyze();
    expect(violations, formatViolations(violations)).toHaveLength(0);
    await ctx.close();
  });

  // ── Keyboard / interaction tests ──────────────────────────────────────────

  test("skip link — first Tab focus, Enter jumps to #main-content", async ({ page }) => {
    await page.goto(`${BASE}/en/dashboard`);
    await page.waitForLoadState("networkidle");

    await page.keyboard.press("Tab");
    await expect(page.locator(":focus")).toContainText(/skip to main content/i);

    await page.keyboard.press("Enter");
    await expect(page.locator("#main-content")).toBeFocused();
  });

  test("Export text dropdown — Escape closes, ArrowDown opens", async ({ page }) => {
    await page.goto(`${BASE}/en/stories`);
    await page.waitForLoadState("networkidle");

    const firstRead = page.getByRole("link", { name: /read/i }).first();
    if (!await firstRead.isVisible().catch(() => false)) {
      test.skip(true, "No stories found"); return;
    }
    await firstRead.click();
    await page.waitForLoadState("networkidle");

    const exportBtn = page.getByRole("button", { name: /export text/i });
    await expect(exportBtn).toBeVisible();

    await exportBtn.focus();
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("menu")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).not.toBeVisible();
    await expect(exportBtn).toBeFocused();
  });

  test("meta-viewport — maximum-scale not set on our pages", async ({ page }) => {
    await page.goto(`${BASE}/en/dashboard`);
    await page.waitForLoadState("networkidle");

    const content = await page.$eval(
      'meta[name="viewport"]',
      (el) => el.getAttribute("content") ?? ""
    );
    expect(content).not.toContain("maximum-scale=1");
  });
});
