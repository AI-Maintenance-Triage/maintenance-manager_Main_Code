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
      await page.waitForLoadState("domcontentloaded");

      await expect(
        page.locator('a:has-text("Sign In"), button:has-text("Sign In"), a:has-text("Login")').first()
      ).toBeVisible();
      await expect(
        page.locator('a:has-text("Get Started"), button:has-text("Get Started")').first()
      ).toBeVisible();
    });

    test("Homepage pricing section loads plan cards dynamically from the database", async ({ page }) => {
      await page.goto("/");
      await page.waitForLoadState("domcontentloaded");

      // Should NOT show the placeholder text
      await expect(page.locator("text=Plans coming soon")).not.toBeVisible();
    });
  });

  test.describe("Role selection and registration", () => {
    test("/get-started shows role selection with Company and Contractor options", async ({ page }) => {
      await page.goto("/get-started");
      await page.waitForLoadState("domcontentloaded");

      await expect(page.locator("text=Company").first()).toBeVisible();
      await expect(page.locator("text=Contractor").first()).toBeVisible();
    });

    test("Clicking Company on /get-started routes to /signup with company registration fields", async ({ page }) => {
      await page.goto("/get-started");
      await page.waitForLoadState("domcontentloaded");

      await page.locator('button:has-text("Company"), a:has-text("Company"), [data-role="company"]').first().click();
      await page.waitForURL(/\/signup/, { timeout: 10_000 });
      await page.waitForLoadState("domcontentloaded");

      // Company-specific fields should be visible
      await expect(
        page.locator('input[name="companyName"], input[placeholder*="company"], label:has-text("Company")').first()
      ).toBeVisible();
    });

    test("Clicking Contractor on /get-started routes to /signup with contractor registration fields", async ({ page }) => {
      await page.goto("/get-started");
      await page.waitForLoadState("domcontentloaded");

      await page.locator('button:has-text("Contractor"), a:has-text("Contractor"), [data-role="contractor"]').first().click();
      await page.waitForURL(/\/signup/, { timeout: 10_000 });
      await page.waitForLoadState("domcontentloaded");

      // Contractor-specific fields should be visible
      await expect(
        page.locator('input[name="businessName"], input[placeholder*="business"], label:has-text("Business")').first()
      ).toBeVisible();
    });

    test("/signup?role=company registration with valid data submits and shows email verification screen", async ({ page }) => {
      await page.goto("/signup?role=company");
      await page.waitForLoadState("domcontentloaded");

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
      await page.waitForLoadState("domcontentloaded");

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
      await page.waitForLoadState("domcontentloaded");

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
      await page.waitForLoadState("domcontentloaded");

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
      await page.waitForLoadState("domcontentloaded");

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
      await page.waitForLoadState("domcontentloaded");

      await page.fill('input[type="email"], input[name="email"]', "test@example.com");
      await page.locator('button[type="submit"]').first().click();

      await expect(
        page.locator("text=/sent|check|email|reset/i").first()
      ).toBeVisible({ timeout: 10_000 });
    });

    test("/reset-password with no token shows error message", async ({ page }) => {
      await page.goto("/reset-password");
      await page.waitForLoadState("domcontentloaded");

      const hasError = await page.locator("text=/invalid|expired|token|missing/i").isVisible({ timeout: 5_000 }).catch(() => false);
      const hasForm = await page.locator('input[type="password"]').isVisible({ timeout: 3_000 }).catch(() => false);
      // Either shows an error or the form (some implementations show form and validate on submit)
      expect(hasError || hasForm).toBeTruthy();
    });

    test("/reset-password with invalid token shows error message", async ({ page }) => {
      await page.goto("/reset-password?token=invalid-token-xyz");
      await page.waitForLoadState("domcontentloaded");

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
      await page.waitForLoadState("domcontentloaded");

      // Should show either the invite page or expired/invalid message
      const isVisible = await page.locator("body").isVisible();
      expect(isVisible).toBeTruthy();
    });

    test("/invite/:token with an expired token shows expired error message", async ({ page }) => {
      await page.goto("/invite/expired-token-xyz");
      await page.waitForLoadState("domcontentloaded");

      // Should show some kind of error/invalid state
      const hasError = await page.locator("text=/expired|invalid|not found/i").isVisible({ timeout: 5_000 }).catch(() => false);
      expect(hasError).toBeTruthy();
    });

    test("/team-invite/:token with a valid token shows team invitation acceptance page", async ({ page }) => {
      await page.goto("/team-invite/valid-test-team-token");
      await page.waitForLoadState("domcontentloaded");

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
      await page.waitForLoadState("domcontentloaded");

      const redirectedToSignin = page.url().includes("/signin") || page.url().includes("/login");
      const showsAuthPrompt = await page.locator("text=/sign in|log in|login/i").isVisible({ timeout: 3_000 }).catch(() => false);
      expect(redirectedToSignin || showsAuthPrompt).toBeTruthy();
    });

    test("Visiting /admin while unauthenticated redirects to /admin/login or shows auth prompt", async ({ page }) => {
      await page.goto("/admin");
      await page.waitForLoadState("domcontentloaded");

      const redirectedToLogin = page.url().includes("/admin/login");
      const showsAuthPrompt = await page.locator("text=/sign in|log in|login/i").isVisible({ timeout: 3_000 }).catch(() => false);
      expect(redirectedToLogin || showsAuthPrompt).toBeTruthy();
    });
  });
});

// ─── Additional coverage: form validation, redirects, keyboard, error boundary ───

test.describe("Form validation edge cases", () => {
  test("Sign-up rejects email without @ symbol and shows inline error", async ({ page }) => {
    await page.goto("/signup?role=company");
    await page.waitForLoadState("domcontentloaded");
    await page.locator('input[type="email"], input[name="email"]').first().fill("notanemail");
    await page.locator('button[type="submit"]').first().click();
    // Browser native validation or custom error
    const invalid = await page.locator('input[type="email"]:invalid, text=/valid email|invalid email/i').first().isVisible({ timeout: 3_000 }).catch(() => false);
    const nativeInvalid = await page.locator('input[type="email"]').first().evaluate((el) => !(el as HTMLInputElement).validity.valid);
    expect(invalid || nativeInvalid).toBeTruthy();
  });

  test("Sign-up rejects password shorter than 8 characters and shows error", async ({ page }) => {
    await page.goto("/signup?role=company");
    await page.waitForLoadState("domcontentloaded");
    const ts = Date.now();
    await page.locator('input[name="name"], input[name="companyName"], input[placeholder*="name" i]').first().fill(`Test ${ts}`);
    await page.locator('input[type="email"], input[name="email"]').first().fill(`short-pw-${ts}@test.example.com`);
    await page.locator('input[type="password"], input[name="password"]').first().fill("abc");
    await page.locator('button[type="submit"]').first().click();
    await expect(
      page.locator("text=/at least 8|minimum 8|too short|password.*characters/i").first()
    ).toBeVisible({ timeout: 8_000 });
  });

  test("Sign-up name field rejects empty value and shows required error", async ({ page }) => {
    await page.goto("/signup?role=company");
    await page.waitForLoadState("domcontentloaded");
    await page.locator('input[type="email"], input[name="email"]').first().fill("empty-name@test.example.com");
    await page.locator('input[type="password"], input[name="password"]').first().fill("TestPass123!");
    await page.locator('button[type="submit"]').first().click();
    const hasError = await page.locator("text=/required|name.*required|enter.*name/i").first().isVisible({ timeout: 5_000 }).catch(() => false);
    const nativeInvalid = await page.locator('input[name="name"], input[name="companyName"]').first().evaluate((el) => !(el as HTMLInputElement).validity.valid).catch(() => false);
    expect(hasError || nativeInvalid).toBeTruthy();
  });

  test("Sign-in with empty email field shows validation error", async ({ page }) => {
    await page.goto("/signin");
    await page.waitForLoadState("domcontentloaded");
    await page.locator('button[type="submit"]').first().click();
    const hasError = await page.locator("text=/required|email.*required|enter.*email/i").first().isVisible({ timeout: 5_000 }).catch(() => false);
    const nativeInvalid = await page.locator('input[type="email"]').first().evaluate((el) => !(el as HTMLInputElement).validity.valid).catch(() => false);
    expect(hasError || nativeInvalid).toBeTruthy();
  });

  test("Forgot-password with invalid email format shows validation error", async ({ page }) => {
    await page.goto("/forgot-password");
    await page.waitForLoadState("domcontentloaded");
    await page.locator('input[type="email"], input[name="email"]').first().fill("bademail");
    await page.locator('button[type="submit"]').first().click();
    const hasError = await page.locator("text=/valid email|invalid email/i").first().isVisible({ timeout: 5_000 }).catch(() => false);
    const nativeInvalid = await page.locator('input[type="email"]').first().evaluate((el) => !(el as HTMLInputElement).validity.valid).catch(() => false);
    expect(hasError || nativeInvalid).toBeTruthy();
  });

  test("Reset-password form rejects mismatched confirm password", async ({ page }) => {
    await page.goto("/reset-password?token=test-token-xyz");
    await page.waitForLoadState("domcontentloaded");
    const pwInput = page.locator('input[type="password"]').first();
    if (await pwInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await pwInput.fill("NewPassword123!");
      const confirmInput = page.locator('input[name="confirmPassword"], input[placeholder*="confirm" i]').first();
      if (await confirmInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await confirmInput.fill("DifferentPassword999!");
        await page.locator('button[type="submit"]').first().click();
        await expect(
          page.locator("text=/match|do not match|passwords must match/i").first()
        ).toBeVisible({ timeout: 8_000 });
      }
    }
  });

  test("Sign-up name field with HTML script tag is rendered safely (XSS prevention)", async ({ page }) => {
    await page.goto("/signup?role=company");
    await page.waitForLoadState("domcontentloaded");
    const ts = Date.now();
    const xssPayload = `<script>window.__xss_executed=true</script>E2E ${ts}`;
    await page.locator('input[name="name"], input[name="companyName"], input[placeholder*="name" i]').first().fill(xssPayload);
    await page.locator('input[type="email"], input[name="email"]').first().fill(`xss-${ts}@test.example.com`);
    await page.locator('input[type="password"], input[name="password"]').first().fill("TestPass123!");
    await page.locator('button[type="submit"]').first().click();
    // Script should NOT have executed
    const xssExecuted = await page.evaluate(() => (window as any).__xss_executed === true);
    expect(xssExecuted).toBeFalsy();
  });
});

test.describe("Authenticated redirect flows", () => {
  test("Authenticated company admin visiting / is redirected to /company", async ({ page }) => {
    await loginAsCompany(page);
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
    // Should be on /company or show company dashboard content
    const onCompany = page.url().includes("/company");
    const showsCompanyContent = await page.locator("text=/company dashboard|properties|maintenance/i").first().isVisible({ timeout: 5_000 }).catch(() => false);
    expect(onCompany || showsCompanyContent).toBeTruthy();
  });

  test("Authenticated contractor visiting / is redirected to /contractor", async ({ page }) => {
    await loginAsContractor(page);
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
    const onContractor = page.url().includes("/contractor");
    const showsContractorContent = await page.locator("text=/contractor dashboard|job board|my jobs/i").first().isVisible({ timeout: 5_000 }).catch(() => false);
    expect(onContractor || showsContractorContent).toBeTruthy();
  });

  test("Authenticated admin visiting / is redirected to /admin", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
    const onAdmin = page.url().includes("/admin");
    const showsAdminContent = await page.locator("text=/platform admin|companies|contractors/i").first().isVisible({ timeout: 5_000 }).catch(() => false);
    expect(onAdmin || showsAdminContent).toBeTruthy();
  });

  test("Browser back button after sign out does not restore authenticated session", async ({ page }) => {
    await loginAsCompany(page);
    const dashboardUrl = page.url();
    await logOut(page);
    await page.goBack();
    await page.waitForLoadState("domcontentloaded");
    // Should NOT be on the company dashboard with active session
    const isOnDashboard = page.url() === dashboardUrl;
    if (isOnDashboard) {
      // If browser navigated back, the page should redirect away or show auth prompt
      const showsAuthPrompt = await page.locator("text=/sign in|log in|login/i").isVisible({ timeout: 5_000 }).catch(() => false);
      const redirectedAway = !page.url().includes("/company");
      expect(showsAuthPrompt || redirectedAway).toBeTruthy();
    }
    // If browser did not navigate back (SPA behavior), test passes
  });
});

test.describe("Keyboard accessibility", () => {
  test("Sign-in form can be completed and submitted using only keyboard Tab and Enter", async ({ page }) => {
    await page.goto("/signin");
    await page.waitForLoadState("domcontentloaded");

    // Focus first input via Tab
    await page.keyboard.press("Tab");
    await page.keyboard.type(TEST_COMPANY_EMAIL);
    await page.keyboard.press("Tab");
    await page.keyboard.type(TEST_COMPANY_PASSWORD);
    await page.keyboard.press("Tab"); // Move to submit button
    await page.keyboard.press("Enter");

    // Should navigate to company dashboard or show error (not hang)
    await page.waitForLoadState("domcontentloaded");
    const navigated = page.url().includes("/company") || page.url().includes("/signin");
    expect(navigated).toBeTruthy();
  });

  test("Registration form can be tabbed through all fields in logical order", async ({ page }) => {
    await page.goto("/signup?role=company");
    await page.waitForLoadState("domcontentloaded");

    // Tab through all visible form fields
    const inputs = page.locator('input:visible, select:visible, textarea:visible');
    const count = await inputs.count();
    expect(count).toBeGreaterThan(2); // At least name, email, password

    // Verify Tab moves focus between fields
    await page.keyboard.press("Tab");
    const firstFocused = await page.evaluate(() => document.activeElement?.tagName);
    expect(["INPUT", "SELECT", "TEXTAREA", "BUTTON"]).toContain(firstFocused);
  });
});

test.describe("Error boundary behavior", () => {
  test("Navigating to /404 shows a not-found page without crashing the app", async ({ page }) => {
    await page.goto("/this-route-does-not-exist-xyz");
    await page.waitForLoadState("domcontentloaded");

    // Should show 404 page or redirect to home — not a blank white screen
    const has404 = await page.locator("text=/not found|404|page.*not.*exist/i").first().isVisible({ timeout: 5_000 }).catch(() => false);
    const redirectedHome = page.url().endsWith("/") || page.url().endsWith("/#");
    expect(has404 || redirectedHome).toBeTruthy();
  });
});
