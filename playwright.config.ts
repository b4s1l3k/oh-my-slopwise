import { defineConfig, devices } from "@playwright/test"

const e2eDatabaseUrl =
  process.env.E2E_DATABASE_URL ??
  "postgresql://splitwise:splitwise@localhost:5433/splitwise_e2e"
const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3100"
const usesExternalServer = process.env.E2E_EXTERNAL_SERVER === "true"
const webServerCommand =
  process.env.E2E_SERVER_MODE === "production"
    ? "node --import tsx scripts/prepare-standalone-e2e.ts && NODE_ENV=production HOSTNAME=127.0.0.1 PORT=3100 node .next/standalone/server.js"
    : "npm run dev -- --hostname 127.0.0.1 --port 3100"

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  forbidOnly: true,
  retries: 0,
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  outputDir: "test-results/e2e",
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL,
    browserName: "chromium",
    channel: "chrome",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
    locale: "ru-RU",
    timezoneId: "Europe/Moscow",
  },
  projects: [
    {
      name: "desktop-chrome",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: usesExternalServer ? undefined : {
    command: webServerCommand,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...process.env,
      DATABASE_URL: e2eDatabaseUrl,
      NEXTAUTH_URL: baseURL,
      NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET ?? "splitwise-e2e-secret",
      AUTH_SECRET: process.env.AUTH_SECRET ?? "splitwise-e2e-secret",
      ADMIN_EMAIL: "admin.e2e@example.com",
    },
  },
})
