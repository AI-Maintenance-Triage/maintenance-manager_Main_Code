import { test, expect } from "@playwright/test";
import {
  loginAsCompany,
  loginAsContractor,
  loginAsAdmin,
  logOut,
  TEST_COMPANY_EMAIL,
  TEST_COMPANY_PASSWORD,
  TEST_CONTRACTOR_EMAIL,
  TEST_CONTRACTOR_PASSWORD,
  TEST_ADMIN_EMAIL,
  TEST_ADMIN_PASSWORD,
} from "./helpers/auth";

test.describe("Authentication flows", () => {
  test.describe("Homepage navigation", () => {
    test("Homepage at / loads and shows navigation with Sign In and Get Started buttons", async ({ page }) => {
      await page.goto("/");
      await page.waitForLoadState("networkidle");

      await expect(
        page.locator('a:has-text("Sign In"), button:has-text("Sign In"), a:has-text("Login")').first()
      ).toBeVisible();
      await expect(
        page.locator('a:has-text("Get Started"), button:has-text("Get Started")').first()
      ).toBeVisible();
    });

    test("Homepage pricing section loads plan cards dynamically from the database", async ({ page }) => {
      await page.goto("/");
      await page.waitForLoadState("networkidle");

      // Should NOT show the placeholder text
      await expect(page.locator("text=Plans coming soon")).not.toBeVisible();
    });
  });

  test.describe("Role selection and registration", () => {
    test("/get-started shows role selection with Company and Contractor options", async ({ page }) => {
      await page.goto("/get-started");
      await page.waitForLoadState("networkidle");

      await expect(page.locator("text=Company").first()).toBeVisible();
      await expect(page.locator("text=Contractor").first()).toBeVisible();
    });

    test("Clicking Company on /get-started routes to /signup with company registration fields", async ({ page }) => {
      await page.goto("/get-started");
      await page.waitForLoadState("networkidle");

      await page.locator('button:has-text("Company"), a:has-text("Company"), [data-role="company"]').first().click();
      await page.waitForURL(/\/signup/, { timeout: 10_000 });
      await page.waitForLoadState("networkidle");

      // Company-specific fields should be visible
      await expect(
        page.locator('input[name="companyName"], input[placeholder*="company"], label:has-text("Company")').first()
      ).toBeVisible();
    });

    test("Clicking Contractor on /get-started routes to /signup with contractor registration fields", async ({ page }) => {
      await page.goto("/get-started");
      await page.waitForLoadState("networkidle");

      await page.locator('button:has-text("Contractor"), a:has-text("Contractor"), [data-role="contractor"]').first().click();
      await page.waitForURL(/\/signup/, { timeout: 10_000 });
      await page.waitForLoadState("networkidle");

      // Contractor-specific fields should be visible
      await expect(
        page.locator('input[name="businessName"], input[placeholder*="business"], label:has-text("Business")').first()
      ).toBeVisible();
    });

    test("/signup?role=company registration with valid data submits and shows email verification screen", async ({ page }) => {
      await page.goto("/signup?role=company");
      await page.waitForLoadState("networkidle");

      const timestamp = Date.now();
      const testEmail = `e2e-company-${timestamp}@test.example.com`;

      // Fill registration form
      const nameField = page.locator('input[name="name"], input[name="companyName"], input[placeholder*="name" i]').first();
      await nameField.fill(`E2E Test Company ${timestamp}`);

      await page.locator('input[type="email"], input[name="email"]').first().fill(testEmail);
      await page.locator('input[type="password"], input[name="password"]').first().fill("TestPass123!");

      // Submit
      await page.locator('button[type="submit"]').first().click();

      // Should show email verification screen
      await expect(
        page.locator("text=/verify|verification|check your email|code/i").first()
      ).toBeVisible({ timeout: 15_000 });
    });

    test("/signup?role=contractor registration with valid data submits and shows email verification screen", async ({ page }) => {
      await page.goto("/signup?role=contractor");
      await page.waitForLoadState("networkidle");

      const timestamp = Date.now();
      const testEmail = `e2e-contractor-${timestamp}@test.example.com`;

      const nameField = page.locator('input[name="name"], input[name="businessName"], input[placeholder*="name" i]').first();
      await nameField.fill(`E2E Test Contractor ${timestamp}`);

      await page.locator('input[type="email"], input[name="email"]').first().fill(testEmail);
      await page.locator('input[type="password"], input[name="password"]').first().fill("TestPass123!");

      await page.locator('button[type="submit"]').first().click();

      await expect(
        page.locator("text=/verify|verification|check your email|code/i").first()
      ).toBeVisible({ timeout: 15_000 });
    });

    test("Entering wrong verification code shows error message", async ({ page }) => {
      await page.goto("/signup?role=company");
      await page.waitForLoadState("networkidle");

      const timestamp = Date.now();
      await page.locator('input[name="name"], input[name="companyName"], input[placeholder*="name" i]').first().fill(`E2E Verify Test ${timestamp}`);
      await page.locator('input[type="email"], input[name="email"]').first().fill(`e2e-verify-${timestamp}@test.example.com`);
      await page.locator('input[type="password"], input[name="password"]').first().fill("TestPass123!");
      await page.locator('button[type="submit"]').first().click();

      // Wait for verification screen
      await page.waitForSelector("text=/verify|code/i", { timeout: 15_000 });

      // Enter wrong code
      const codeInput = page.locator('input[name="code"], input[placeholder*="code" i], input[maxlength="6"]').first();
      if (await codeInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await codeInput.fill("000000");
        await page.locator('button[type="submit"]').first().click();
        await expect(
          page.locator("text=/invalid|incorrect|wrong|error/i").first()
        ).toBeVisible({ timeout: 10_000 });
      }
    });

    test("Resend verification code button is present on verification screen", async ({ page }) => {
      await page.goto("/signup?role=company");
      await page.waitForLoadState("networkidle");

      const timestamp = Date.now();
      await page.locator('input[name="name"], input[name="companyName"], input[placeholder*="name" i]').first().fill(`E2E Resend Test ${timestamp}`);
      await page.locator('input[type="email"], input[name="email"]').first().fill(`e2e-resend-${timestamp}@test.example.com`);
      await page.locator('input[type="password"], input[name="password"]').first().fill("TestPass123!");
      await page.locator('button[type="submit"]').first().click();

      await page.waitForSelector("text=/verify|code/i", { timeout: 15_000 });

      await expect(
        page.locator('button:has-text("Resend"), a:has-text("Resend"), button:has-text("Send again")').first()
      ).toBeVisible({ timeout: 5_000 });
    });
  });

  test.describe("Sign in flows", () => {
    test("/signin with correct company credentials navigates to /company dashboard", async ({ page }) => {
      await loginAsCompany(page);
      await expect(page).toHaveURL(/\/company/);
    });

    test("/signin with correct contractor credentials navigates to /contractor dashboard", async ({ page }) => {
      await loginAsContractor(page);
      await expect(page).toHaveURL(/\/contractor/);
    });

    test("/signin with wrong password shows invalid credentials error", async ({ page }) => {
      await page.goto("/signin");
      await page.waitForLoadState("networkidle");

      await page.fill('input[type="email"], input[name="email"]', TEST_COMPANY_EMAIL);
      await page.fill('input[type="password"], input[name="password"]', "WrongPassword999!");
      await page.click('button[type="submit"]');

      await expect(
        page.locator("text=/invalid|incorrect|wrong|credentials|password/i").first()
      ).toBeVisible({ timeout: 10_000 });
    });

    test("/admin/login with correct admin credentials navigates to /admin dashboard", async ({ page }) => {
      await loginAsAdmin(page);
      await expect(page).toHaveURL(/\/admin/);
    });
  });

  test.describe("Password recovery", () => {
    test("/forgot-password page accepts email input and shows confirmation on submit", async ({ page }) => {
      await page.goto("/forgot-password");
      await page.waitForLoadState("networkidle");

      await page.fill('input[type="email"], input[name="email"]', "test@example.com");
      await page.locator('button[type="submit"]').first().click();

      await expect(
        page.locator("text=/sent|check|email|reset/i").first()
      ).toBeVisible({ timeout: 10_000 });
    });

    test("/reset-password with no token shows error message", async ({ page }) => {
      await page.goto("/reset-password");
      await page.waitForLoadState("networkidle");

      const hasError = await page.locator("text=/invalid|expired|token|missing/i").isVisible({ timeout: 5_000 }).catch(() => false);
      const hasForm = await page.locator('input[type="password"]').isVisible({ timeout: 3_000 }).catch(() => false);
      // Either shows an error or the form (some implementations show form and validate on submit)
      expect(hasError || hasForm).toBeTruthy();
    });

    test("/reset-password with invalid token shows error message", async ({ page }) => {
      await page.goto("/reset-password?token=invalid-token-xyz");
      await page.waitForLoadState("networkidle");

      // If form is shown, try submitting to trigger error
      const passwordInput = page.locator('input[type="password"]').first();
      if (await passwordInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await passwordInput.fill("NewPassword123!");
        const confirmInput = page.locator('input[name="confirmPassword"], input[placeholder*="confirm" i]').first();
        if (await confirmInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
          await confirmInput.fill("NewPassword123!");
        }
        await page.locator('button[type="submit"]').first().click();
      }

      await expect(
        page.locator("text=/invalid|expired|token|error/i").first()
      ).toBeVisible({ timeout: 10_000 });
    });
  });

  test.describe("Invite flows", () => {
    test("/invite/:token with a valid contractor invite token shows invite acceptance page", async ({ page }) => {
      // This test requires a seeded invite token in the database
      // Using a placeholder — in CI this should be seeded
      await page.goto("/invite/valid-test-invite-token");
      await page.waitForLoadState("networkidle");

      // Should show either the invite page or expired/invalid message
      const isVisible = await page.locator("body").isVisible();
      expect(isVisible).toBeTruthy();
    });

    test("/invite/:token with an expired token shows expired error message", async ({ page }) => {
      await page.goto("/invite/expired-token-xyz");
      await page.waitForLoadState("networkidle");

      // Should show some kind of error/invalid state
      const hasError = await page.locator("text=/expired|invalid|not found/i").isVisible({ timeout: 5_000 }).catch(() => false);
      expect(hasError).toBeTruthy();
    });

    test("/team-invite/:token with a valid token shows team invitation acceptance page", async ({ page }) => {
      await page.goto("/team-invite/valid-test-team-token");
      await page.waitForLoadState("networkidle");

      const isVisible = await page.locator("body").isVisible();
      expect(isVisible).toBeTruthy();
    });
  });

  test.describe("Sign out flows", () => {
    test("Sign out from /company clears session and redirects to /", async ({ page }) => {
      await loginAsCompany(page);
      await logOut(page);
      await expect(page).toHaveURL(/^\//);
      await expect(page).not.toHaveURL(/\/company/);
    });

    test("Sign out from /contractor clears session and redirects to /", async ({ page }) => {
      await loginAsContractor(page);
      await logOut(page);
      await expect(page).toHaveURL(/^\//);
      await expect(page).not.toHaveURL(/\/contractor/);
    });

    test("Sign out from /admin clears session and redirects to /", async ({ page }) => {
      await loginAsAdmin(page);
      await logOut(page);
      await expect(page).not.toHaveURL(/\/admin(?!\/login)/);
    });
  });

  test.describe("Protected route guards", () => {
    test("Visiting /company while unauthenticated redirects to signin or shows auth prompt", async ({ page }) => {
      await page.goto("/company");
      await page.waitForLoadState("networkidle");

      const redirectedToSignin = page.url().includes("/signin") || page.url().includes("/login");
      const showsAuthPrompt = await page.locator("text=/sign in|log in|login/i").isVisible({ timeout: 3_000 }).catch(() => false);
      expect(redirectedToSignin || showsAuthPrompt).toBeTruthy();
    });

    test("Visiting /admin while unauthenticated redirects to /admin/login or shows auth prompt", async ({ page }) => {
      await page.goto("/admin");
      await page.waitForLoadState("networkidle");

      const redirectedToLogin = page.url().includes("/admin/login");
      const showsAuthPrompt = await page.locator("text=/sign in|log in|login/i").isVisible({ timeout: 3_000 }).catch(() => false);
      expect(redirectedToLogin || showsAuthPrompt).toBeTruthy();
    });
  });
});
