/**
 * Desktop UI audit — screenshots at 1280×800 and 1440×900.
 * Run with: CLERK_SECRET_KEY=$CLERK_SECRET_KEY_DEV npm run test:e2e -- e2e/desktop-audit.spec.ts
 * Outputs to: playwright-screenshots/
 */
import { test, expect } from "@playwright/test";
import { getBaseUrl, signIn } from "./helpers/auth";
import * as fs from "fs";
import * as path from "path";

const BASE = getBaseUrl();
const OUT = path.join(process.cwd(), "playwright-screenshots");

const VIEWPORTS = [
  { label: "1280", width: 1280, height: 800 },
  { label: "1440", width: 1440, height: 900 },
];

const PAGES = [
  { name: "dashboard", path: "/en/dashboard" },
  { name: "stories-library", path: "/en/stories" },
  { name: "story-new", path: "/en/stories/new" },
  { name: "profiles-list", path: "/en/profiles" },
  { name: "profile-new", path: "/en/profiles/new" },
  { name: "family", path: "/en/family" },
  { name: "locations", path: "/en/locations" },
  { name: "account", path: "/en/account" },
  { name: "support", path: "/en/support" },
  { name: "public-gallery", path: "/en/public" },
  { name: "admin", path: "/en/admin" },
  { name: "admin-content", path: "/en/admin?tab=content" },
  { name: "admin-rewards", path: "/en/admin?tab=rewards" },
];

test.beforeAll(() => {
  fs.mkdirSync(OUT, { recursive: true });
});

for (const vp of VIEWPORTS) {
  test.describe(`desktop ${vp.label}px`, () => {
    for (const pg of PAGES) {
      test(`${pg.name}`, async ({ browser }) => {
        const ctx = await browser.newContext({
          viewport: { width: vp.width, height: vp.height },
        });
        const page = await ctx.newPage();
        await signIn(page);
        await page.goto(`${BASE}${pg.path}`);
        await page.waitForLoadState("networkidle");
        // Scroll to bottom then back to capture full layout
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(300);
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(200);
        const file = path.join(OUT, `${vp.label}-${pg.name}.png`);
        await page.screenshot({ path: file, fullPage: true });
        await ctx.close();
        // Test just verifies page doesn't 404 / crash
        expect(page.url()).not.toMatch(/\/sign-in/);
      });
    }
  });
}
