import { defineConfig, devices } from "@playwright/test";

const fixtureMode = process.env.PLAYWRIGHT_FIXTURE_MODE === "1";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: "html",
  use: {
    baseURL: fixtureMode ? "http://127.0.0.1:3001" : "http://127.0.0.1:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: fixtureMode
    ? {
        command: "npm run dev -- --port 3001",
        url: "http://127.0.0.1:3001",
        reuseExistingServer: false,
      }
    : {
        command: "npm run dev",
        url: "http://127.0.0.1:3000",
        reuseExistingServer: !process.env.CI,
      },
});
