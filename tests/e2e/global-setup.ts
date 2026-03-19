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

  // --- Admin ---
  try {
    console.log("[global-setup] Logging in as admin...");
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    await adminPage.goto(`${BASE_URL}/admin/login`);
    await adminPage.waitForLoadState("domcontentloaded");
    await adminPage.fill('input[type="email"], input[name="email"], #email', "admin@example.com");
    await adminPage.fill('input[type="password"], input[name="password"], #password', "TestAdmin123!");
    await adminPage.click('button[type="submit"]');
    await adminPage.waitForURL(/\/admin/, { timeout: 20_000 });
    await adminContext.storageState({ path: ADMIN_STORAGE_STATE });
    await adminContext.close();
    console.log("[global-setup] Admin auth state saved.");
  } catch (err) {
    console.warn("[global-setup] Admin login failed (tests will run without auth):", err);
    // Write empty state so tests can still run (they'll redirect to login)
    fs.writeFileSync(ADMIN_STORAGE_STATE, JSON.stringify({ cookies: [], origins: [] }));
  }

  // --- Company ---
  try {
    console.log("[global-setup] Logging in as company...");
    const companyContext = await browser.newContext();
    const companyPage = await companyContext.newPage();
    await companyPage.goto(`${BASE_URL}/signin`);
    await companyPage.waitForLoadState("domcontentloaded");
    await companyPage.fill('input[type="email"], input[name="email"], #email', "testcompany@example.com");
    await companyPage.fill('input[type="password"], input[name="password"], #password', "TestCompany123!");
    await companyPage.click('button[type="submit"]');
    await companyPage.waitForURL(/\/company/, { timeout: 20_000 });
    await companyContext.storageState({ path: COMPANY_STORAGE_STATE });
    await companyContext.close();
    console.log("[global-setup] Company auth state saved.");
  } catch (err) {
    console.warn("[global-setup] Company login failed (tests will run without auth):", err);
    fs.writeFileSync(COMPANY_STORAGE_STATE, JSON.stringify({ cookies: [], origins: [] }));
  }

  // --- Contractor ---
  try {
    console.log("[global-setup] Logging in as contractor...");
    const contractorContext = await browser.newContext();
    const contractorPage = await contractorContext.newPage();
    await contractorPage.goto(`${BASE_URL}/signin`);
    await contractorPage.waitForLoadState("domcontentloaded");
    await contractorPage.fill('input[type="email"], input[name="email"], #email', "testcontractor@example.com");
    await contractorPage.fill('input[type="password"], input[name="password"], #password', "TestContractor123!");
    await contractorPage.click('button[type="submit"]');
    await contractorPage.waitForURL(/\/contractor/, { timeout: 20_000 });
    await contractorContext.storageState({ path: CONTRACTOR_STORAGE_STATE });
    await contractorContext.close();
    console.log("[global-setup] Contractor auth state saved.");
  } catch (err) {
    console.warn("[global-setup] Contractor login failed (tests will run without auth):", err);
    fs.writeFileSync(CONTRACTOR_STORAGE_STATE, JSON.stringify({ cookies: [], origins: [] }));
  }

  await browser.close();
  console.log("[global-setup] Setup complete.");
}

export default globalSetup;
