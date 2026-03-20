/**
 * global-setup.ts
 * Playwright global setup — runs once before all tests.
 *
 * 1. Calls POST /api/test-setup to ensure test accounts exist in the database.
 * 2. Logs in as each test role and saves the session cookies to storage state files.
 *    These files are then used by tests via `storageState` in playwright.config.ts.
 *
 * Required env vars (set as GitHub Actions secrets):
 *   PLAYWRIGHT_BASE_URL   — e.g. https://firstgrabmaintenance.ai
 *   TEST_SETUP_SECRET     — secret for /api/test-setup endpoint
 */
import { chromium, FullConfig } from "@playwright/test";
import * as path from "path";
import * as fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const TEST_SETUP_SECRET = process.env.TEST_SETUP_SECRET ?? "";

// Storage state file paths — relative to project root
export const ADMIN_STORAGE_STATE = path.join(__dirname, ".auth", "admin.json");
export const COMPANY_STORAGE_STATE = path.join(__dirname, ".auth", "company.json");
export const CONTRACTOR_STORAGE_STATE = path.join(__dirname, ".auth", "contractor.json");

/**
 * Login via the /signin page and save the auth state.
 * Intercepts the /api/auth/login response to detect errors early.
 */
async function loginAndSaveState(
  browser: Awaited<ReturnType<typeof chromium.launch>>,
  email: string,
  password: string,
  expectedUrlPattern: RegExp,
  storagePath: string,
  label: string
): Promise<void> {
  const context = await browser.newContext();
  const page = await context.newPage();

  let loginApiResponse: { success?: boolean; error?: string; role?: string } | null = null;

  // Intercept the login API response for early error detection
  page.on("response", async (response) => {
    if (response.url().includes("/api/auth/login") && response.request().method() === "POST") {
      try {
        const body = await response.json();
        loginApiResponse = body;
        if (body.success) {
          console.log(`[global-setup] ${label} login API success, role: ${body.user?.role}`);
        } else {
          console.warn(`[global-setup] ${label} login API error (${response.status()}): ${body.error}`);
        }
      } catch {
        console.warn(`[global-setup] ${label} could not parse login API response`);
      }
    }
  });

  try {
    await page.goto(`${BASE_URL}/signin`);
    await page.waitForLoadState("domcontentloaded");
    await page.fill('input[type="email"], input[name="email"], #email', email);
    await page.fill('input[type="password"], input[name="password"], #password', password);
    await page.click('button[type="submit"]');

    // Wait for the login API response first (up to 20s)
    await page.waitForResponse(
      (res) => res.url().includes("/api/auth/login") && res.request().method() === "POST",
      { timeout: 20_000 }
    ).catch(() => console.warn(`[global-setup] ${label} login API response not detected within 20s`));

    // If the API returned an error, don't wait for URL change
    if (loginApiResponse && !loginApiResponse.success) {
      console.warn(`[global-setup] ${label} login failed with API error: ${loginApiResponse.error}`);
      await context.close();
      fs.writeFileSync(storagePath, JSON.stringify({ cookies: [], origins: [] }));
      return;
    }

    // Wait for URL to change to the expected pattern (direct redirect from SignIn.tsx)
    await page.waitForURL(expectedUrlPattern, { timeout: 30_000 });
    await context.storageState({ path: storagePath });
    await context.close();
    console.log(`[global-setup] ${label} auth state saved.`);
  } catch (err) {
    const currentUrl = page.url();
    console.warn(`[global-setup] ${label} login failed (tests will run without auth). Current URL: ${currentUrl}`, err);
    await context.close();
    fs.writeFileSync(storagePath, JSON.stringify({ cookies: [], origins: [] }));
  }
}

async function globalSetup(_config: FullConfig) {
  // Ensure .auth directory exists
  const authDir = path.join(__dirname, ".auth");
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }

  // Step 1: Call test-setup endpoint to ensure test accounts exist
  if (TEST_SETUP_SECRET) {
    console.log("[global-setup] Calling /api/test-setup to ensure test accounts exist...");
    try {
      const res = await fetch(`${BASE_URL}/api/test-setup`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-test-setup-secret": TEST_SETUP_SECRET,
        },
      });
      if (res.ok) {
        const data = await res.json();
        console.log("[global-setup] Test accounts ready:", data.results);
      } else {
        const text = await res.text();
        console.warn(`[global-setup] test-setup returned ${res.status}: ${text}`);
      }
    } catch (err) {
      console.warn("[global-setup] Failed to call test-setup endpoint:", err);
    }
  } else {
    console.log("[global-setup] TEST_SETUP_SECRET not set — skipping account creation");
  }

  // Step 2: Log in as each role and save storage state
  const browser = await chromium.launch();

  // --- Admin (uses /admin/login, not /signin) ---
  try {
    console.log("[global-setup] Logging in as admin...");
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    await adminPage.goto(`${BASE_URL}/admin/login`);
    await adminPage.waitForLoadState("domcontentloaded");
    await adminPage.fill('input[type="email"], input[name="email"], #email', "admin@example.com");
    await adminPage.fill('input[type="password"], input[name="password"], #password', "TestAdmin123!");
    await adminPage.click('button[type="submit"]');
    await adminPage.waitForURL(/\/admin/, { timeout: 30_000 });
    await adminContext.storageState({ path: ADMIN_STORAGE_STATE });
    await adminContext.close();
    console.log("[global-setup] Admin auth state saved.");
  } catch (err) {
    console.warn("[global-setup] Admin login failed (tests will run without auth):", err);
    fs.writeFileSync(ADMIN_STORAGE_STATE, JSON.stringify({ cookies: [], origins: [] }));
  }

  // --- Company ---
  console.log("[global-setup] Logging in as company...");
  await loginAndSaveState(
    browser,
    "testcompany@example.com",
    "TestCompany123!",
    /\/company/,
    COMPANY_STORAGE_STATE,
    "Company"
  );

  // --- Contractor ---
  console.log("[global-setup] Logging in as contractor...");
  await loginAndSaveState(
    browser,
    "testcontractor@example.com",
    "TestContractor123!",
    /\/contractor/,
    CONTRACTOR_STORAGE_STATE,
    "Contractor"
  );

  await browser.close();
  console.log("[global-setup] Setup complete.");
}

export default globalSetup;
