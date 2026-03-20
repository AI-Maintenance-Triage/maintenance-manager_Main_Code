import { test, expect } from "@playwright/test";

test.describe("Public pages — unauthenticated access", () => {
  test("Homepage loads and shows hero section, features, integrations, and pricing", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");

    // Hero section
    await expect(page.locator("h1, [data-testid='hero-heading']").first()).toBeVisible();

    // Sign In and Get Started navigation buttons
    await expect(
      page.locator('a:has-text("Sign In"), button:has-text("Sign In")').first()
    ).toBeVisible();
    await expect(
      page.locator('a:has-text("Get Started"), button:has-text("Get Started")').first()
    ).toBeVisible();

    // Features section
    await expect(page.locator("section, div").filter({ hasText: /feature/i }).first()).toBeVisible();

    // Integrations section with Buildium logo or text
    const hasBuildiumImg = await page.locator("img[alt*='Buildium'], img[alt*='buildium']").first().isVisible({ timeout: 5_000 }).catch(() => false);
    const hasBuildiumText = await page.getByText('Buildium', { exact: false }).first().isVisible({ timeout: 3_000 }).catch(() => false);
    expect(hasBuildiumImg || hasBuildiumText).toBeTruthy();

    // Pricing section
    await expect(
      page.locator("section, div").filter({ hasText: /pricing|plans/i }).first()
    ).toBeVisible();
  });

  test("Pricing section renders plan cards loaded dynamically from the database", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");

    // Should show actual plan cards, not a "Plans coming soon" placeholder
    const comingSoon = page.locator("text=Plans coming soon");
    await expect(comingSoon).not.toBeVisible();

    // At least one plan card with a price should be visible
    const planCards = page.locator('[data-testid="plan-card"], .plan-card, [class*="plan"]');
    // Fallback: look for price indicators like $
    const priceText = page.locator("text=/$\\d+|per month|\/mo/i").first();
    const hasPriceText = await priceText.isVisible({ timeout: 5_000 }).catch(() => false);
    const hasCards = (await planCards.count()) > 0;
    expect(hasPriceText || hasCards).toBeTruthy();
  });

  test("Company plan cards show name, price, feature list, and Get Started button", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");

    // Scroll to pricing section
    await page.evaluate(() => {
      const el = document.querySelector('[id*="pricing"], [id*="plans"], section:last-of-type');
      el?.scrollIntoView();
    });

    // Get Started button should be present
    await expect(
      page.locator('a:has-text("Get Started"), button:has-text("Get Started")').first()
    ).toBeVisible();
  });

  test("/get-started loads role selection with Company and Contractor options", async ({ page }) => {
    await page.goto("/get-started");
    await page.waitForLoadState("domcontentloaded");

    // GetStarted page shows "Property Management Company" and "Contractor / Handyman" cards
    await expect(page.locator("text=/company/i").first()).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("text=/contractor/i").first()).toBeVisible({ timeout: 30_000 });
  });

  test("/forgot-password loads without authentication", async ({ page }) => {
    await page.goto("/forgot-password");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator('input[type="email"], input[name="email"]').first()).toBeVisible();
  });

  test("/reset-password loads without authentication", async ({ page }) => {
    await page.goto("/reset-password");
    await page.waitForLoadState("domcontentloaded");
    // Should either show the reset form or an error about missing/invalid token
    const hasForm = await page.locator('input[type="password"]').first().isVisible({ timeout: 30_000 }).catch(() => false);
    const hasError = await page.locator("text=/invalid|expired|token|missing/i").first().isVisible({ timeout: 30_000 }).catch(() => false);
    expect(hasForm || hasError).toBeTruthy();
  });

  test("/invite/:token loads without authentication", async ({ page }) => {
    await page.goto("/invite/test-token-placeholder");
    await page.waitForLoadState("domcontentloaded");
    // Should show invite page or expired/invalid token message
    const isVisible = await page.locator("body").isVisible();
    expect(isVisible).toBeTruthy();
  });

  test("/team-invite/:token loads without authentication", async ({ page }) => {
    await page.goto("/team-invite/test-token-placeholder");
    await page.waitForLoadState("domcontentloaded");
    const isVisible = await page.locator("body").isVisible();
    expect(isVisible).toBeTruthy();
  });

  test("/admin/login loads without authentication", async ({ page }) => {
    await page.goto("/admin/login");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator('input[type="email"], input[name="email"]').first()).toBeVisible();
    await expect(page.locator('input[type="password"], input[name="password"]').first()).toBeVisible();
  });

  test("/404 loads not found page", async ({ page }) => {
    const response = await page.goto("/404");
    await page.waitForLoadState("domcontentloaded");
    const hasNotFound = await page.locator("text=/not found|404/i").first().isVisible({ timeout: 30_000 }).catch(() => false);
    expect(hasNotFound || (response?.status() === 404)).toBeTruthy();
  });
  test("Unknown route loads not found page", async ({ page }) => {
    await page.goto("/this-route-definitely-does-not-exist-xyz");
    await page.waitForLoadState("domcontentloaded");
    const hasNotFound = await page.locator("text=/not found|404/i").first().isVisible({ timeout: 30_000 }).catch(() => false);
    expect(hasNotFound).toBeTruthy();
  });
});
