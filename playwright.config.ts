import { defineConfig, devices } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";

// Storage state paths for pre-authenticated sessions
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH_DIR = path.join(__dirname, "tests/e2e/.auth");

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 4 : 2,
  reporter: [["html", { outputFolder: "playwright-report" }], ["list"]],
  timeout: 30_000,
  expect: { timeout: 8_000 },

  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:5000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  projects: [
    // ─── Unauthenticated tests ─────────────────────────────────────────────────────────────
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      testMatch: [
        "**/public.spec.ts",
        "**/auth.spec.ts",
        "**/api.spec.ts",
        "**/cron.spec.ts",
        "**/a11y.spec.ts",
      ],
    },

    // ─── Admin tests (pre-authenticated) ───────────────────────────────────────────────
    {
      name: "admin",
      use: {
        ...devices["Desktop Chrome"],
        storageState: path.join(AUTH_DIR, "admin.json"),
      },
      testMatch: ["**/admin.spec.ts"],
    },

    // ─── Company tests (pre-authenticated) ──────────────────────────────────────────────
    {
      name: "company",
      use: {
        ...devices["Desktop Chrome"],
        storageState: path.join(AUTH_DIR, "company.json"),
      },
      testMatch: ["**/company.spec.ts"],
    },

    // ─── Contractor tests (pre-authenticated) ────────────────────────────────────────────
    {
      name: "contractor",
      use: {
        ...devices["Desktop Chrome"],
        storageState: path.join(AUTH_DIR, "contractor.json"),
      },
      testMatch: ["**/contractor.spec.ts"],
    },
  ],
});
