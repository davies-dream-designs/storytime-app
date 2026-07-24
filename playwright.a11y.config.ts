import { defineConfig, devices } from "@playwright/test";

const remoteUrl = process.env.PLAYWRIGHT_BASE_URL ?? "https://dev.storycot.com";
const vercelBypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/a11y.spec.ts",
  fullyParallel: false,
  retries: 1,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: remoteUrl,
    trace: "on-first-retry",
    ...(vercelBypassSecret
      ? {
          extraHTTPHeaders: {
            "x-vercel-protection-bypass": vercelBypassSecret,
            "x-vercel-set-bypass-cookie": "true",
          },
        }
      : {}),
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  // No globalSetup — auth handled per-test via Clerk sign-in token API
});
