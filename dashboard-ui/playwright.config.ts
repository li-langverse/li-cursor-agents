import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.LI_PLAYWRIGHT_UI_PORT ?? 3099);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 20_000 },
  globalSetup: require.resolve("./e2e/global-setup"),
  reporter: process.env.CI ? "github" : [["list"]],
  use: {
    ...devices["Desktop Chrome"],
    // Prefer system Chrome when Playwright browser cache cannot be downloaded (CI/disk).
    channel: process.env.PLAYWRIGHT_CHANNEL ?? "chrome",
    baseURL,
    trace: "on-first-retry",
  },
  webServer: {
    command: "bash ../scripts/playwright-web.sh",
    url: `${baseURL}/activity`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
