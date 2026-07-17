import { defineConfig, devices } from "@playwright/test";

const remoteUrl = process.env.PLAYWRIGHT_BASE_URL
const isRemote = remoteUrl?.startsWith('http')
const vercelBypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET

export default defineConfig({
  testDir: "./e2e",
  globalSetup: require.resolve('./e2e/global.setup.ts'),
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "line",
  use: {
    baseURL: remoteUrl ?? "http://localhost:3333",
    trace: "on-first-retry",
    ...(isRemote && vercelBypassSecret ? {
      extraHTTPHeaders: {
        'x-vercel-protection-bypass': vercelBypassSecret,
        'x-vercel-set-bypass-cookie': 'true',
      },
    } : {}),
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  // Skip local webserver when testing against a remote URL
  ...(isRemote ? {} : {
    webServer: {
      command: "npm run build && PORT=3333 node .next/standalone/server.js",
      url: "http://localhost:3333",
      reuseExistingServer: !process.env.CI,
      timeout: 120 * 1000,
    },
  }),
});
