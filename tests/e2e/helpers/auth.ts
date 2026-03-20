import { Page } from "@playwright/test";

// ─── Test seed account constants ─────────────────────────────────────────────
// These match the seeded test database accounts.
export const TEST_COMPANY_EMAIL = "testcompany@example.com";
export const TEST_COMPANY_PASSWORD = "TestCompany123!";

export const TEST_CONTRACTOR_EMAIL = "testcontractor@example.com";
export const TEST_CONTRACTOR_PASSWORD = "TestContractor123!";

export const TEST_ADMIN_EMAIL = "admin@example.com";
export const TEST_ADMIN_PASSWORD = "TestAdmin123!";

// ─── Auth helpers ─────────────────────────────────────────────────────────────

/**
 * Log in as a company admin.
 * Navigates to /signin, fills credentials, clicks sign in, and waits for /company.
 */
export async function loginAsCompany(
  page: Page,
  email = TEST_COMPANY_EMAIL,
  password = TEST_COMPANY_PASSWORD
): Promise<void> {
  await page.goto("/signin");
  await page.waitForLoadState("domcontentloaded");
  await page.fill('input[type="email"], input[name="email"]', email);
  await page.fill('input[type="password"], input[name="password"]', password);
  await page.click('button[type="submit"]');
  // The SignIn page redirects to "/" then the Home page redirects to /company
  // This two-hop redirect can take up to 30s in CI
  await page.waitForURL(/\/company/, { timeout: 30_000 });
  await page.waitForLoadState("domcontentloaded");
}

/**
 * Log in as a contractor.
 * Navigates to /signin, fills credentials, clicks sign in, and waits for /contractor.
 */
export async function loginAsContractor(
  page: Page,
  email = TEST_CONTRACTOR_EMAIL,
  password = TEST_CONTRACTOR_PASSWORD
): Promise<void> {
  await page.goto("/signin");
  await page.waitForLoadState("domcontentloaded");
  await page.fill('input[type="email"], input[name="email"]', email);
  await page.fill('input[type="password"], input[name="password"]', password);
  await page.click('button[type="submit"]');
  // The SignIn page redirects to "/" then the Home page redirects to /contractor
  // This two-hop redirect can take up to 30s in CI
  await page.waitForURL(/\/contractor/, { timeout: 30_000 });
  await page.waitForLoadState("domcontentloaded");
}

/**
 * Log in as a platform admin.
 * Navigates to /admin/login, fills credentials, clicks sign in, and waits for /admin.
 */
export async function loginAsAdmin(
  page: Page,
  email = TEST_ADMIN_EMAIL,
  password = TEST_ADMIN_PASSWORD
): Promise<void> {
  await page.goto("/admin/login");
  await page.waitForLoadState("domcontentloaded");
  await page.fill('input[type="email"], input[name="email"]', email);
  await page.fill('input[type="password"], input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/admin/, { timeout: 15_000 });
  await page.waitForLoadState("domcontentloaded");
}

/**
 * Log out from any dashboard.
 * Opens the user avatar dropdown in the sidebar footer, then clicks Sign Out.
 */
export async function logOut(page: Page): Promise<void> {
  // The sign-out button is inside a DropdownMenu in the sidebar footer.
  // We must click the avatar trigger first to open the dropdown.
  const avatarTrigger = page.locator('[data-sidebar="footer"] button').first();
  if (await avatarTrigger.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await avatarTrigger.click();
    // Wait for the dropdown to open and find the sign-out item
    const signOutItem = page.locator('[data-testid="sign-out"]').first();
    await signOutItem.waitFor({ state: 'visible', timeout: 5_000 });
    await signOutItem.click();
    await page.waitForURL(/\/$/, { timeout: 10_000 });
    return;
  }

  // Fallback: try direct selectors if sidebar is not present
  const directSelectors = [
    '[data-testid="sign-out"]',
    'button:has-text("Sign Out")',
    'a:has-text("Sign Out")',
  ];
  for (const selector of directSelectors) {
    const el = page.locator(selector).first();
    if (await el.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await el.click();
      await page.waitForURL(/\/$/, { timeout: 10_000 });
      return;
    }
  }
}

// ─── Mock helpers ─────────────────────────────────────────────────────────────

/**
 * Mock all Stripe API calls so no real charges occur during tests.
 */
export async function mockStripeRoutes(page: Page): Promise<void> {
  await page.route(/api\.stripe\.com/, async (route) => {
    const url = route.request().url();

    if (url.includes("/checkout/sessions")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "cs_test_mock",
          url: "https://checkout.stripe.com/pay/cs_test_mock",
          status: "open",
        }),
      });
    } else if (url.includes("/payment_methods")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: [], has_more: false, object: "list" }),
      });
    } else if (url.includes("/invoices")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: [], has_more: false, object: "list" }),
      });
    } else if (url.includes("/subscriptions")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "sub_test_mock",
          status: "active",
          current_period_end: Math.floor(Date.now() / 1000) + 86400 * 30,
        }),
      });
    } else {
      await route.continue();
    }
  });
}

/**
 * Mock all Google Maps API calls so no real API keys are needed during tests.
 */
export async function mockGoogleMapsRoutes(page: Page): Promise<void> {
  await page.route(/maps\.googleapis\.com/, async (route) => {
    const url = route.request().url();

    if (url.includes("/geocode/json")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "OK",
          results: [
            {
              formatted_address: "123 Test St, Morgantown, WV 26505, USA",
              geometry: {
                location: { lat: 39.43, lng: -80.14 },
                location_type: "ROOFTOP",
              },
              address_components: [
                { long_name: "WV", short_name: "WV", types: ["administrative_area_level_1"] },
              ],
            },
          ],
        }),
      });
    } else if (url.includes("/directions/json")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "OK",
          routes: [
            {
              legs: [{ distance: { text: "5 mi" }, duration: { text: "10 mins" }, steps: [] }],
              overview_polyline: { points: "" },
            },
          ],
        }),
      });
    } else {
      await route.continue();
    }
  });
}

/**
 * Inject a fixed GPS coordinate (West Virginia: 39.43, -80.14) for all geolocation calls.
 */
export async function mockGeolocation(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const mockPosition: GeolocationPosition = {
      coords: {
        latitude: 39.43,
        longitude: -80.14,
        accuracy: 10,
        altitude: null,
        altitudeAccuracy: null,
        heading: null,
        speed: null,
      },
      timestamp: Date.now(),
    };

    Object.defineProperty(navigator, "geolocation", {
      value: {
        getCurrentPosition: (success: PositionCallback) => success(mockPosition),
        watchPosition: (success: PositionCallback) => {
          success(mockPosition);
          return 1;
        },
        clearWatch: () => {},
      },
      configurable: true,
    });
  });
}
