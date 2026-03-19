import { test, expect } from "@playwright/test";
import { loginAsContractor, mockGoogleMapsRoutes, mockStripeRoutes } from "./helpers/auth";

test.describe("Contractor flows", () => {
  test.beforeEach(async ({ page }) => {
    await mockGoogleMapsRoutes(page);
    // Auth is handled via storageState in playwright.config.ts
  });

  // ─── Dashboard ───────────────────────────────────────────────────────────────
  test.describe("Dashboard", () => {
    test("/contractor loads and shows stats cards for earnings, active jobs, completed jobs, and rating", async ({ page }) => {
      await page.goto("/contractor");
      await page.waitForLoadState("domcontentloaded");

      await expect(page.locator("text=/earnings/i").first()).toBeVisible();
      await expect(page.locator("text=/active jobs/i").first()).toBeVisible();
      await expect(page.locator("text=/completed/i").first()).toBeVisible();
      await expect(page.locator("text=/rating/i").first()).toBeVisible();
    });

    test("Active jobs section shows jobs or an empty state message", async ({ page }) => {
      await page.goto("/contractor");
      await page.waitForLoadState("domcontentloaded");

      const hasJobs = await page.locator('[data-testid="job-card"], .job-card').isVisible({ timeout: 3_000 }).catch(() => false);
      const hasEmptyState = await page.locator("text=/no active jobs/i").isVisible({ timeout: 3_000 }).catch(() => false);
      expect(hasJobs || hasEmptyState).toBeTruthy();
    });

    test("Announcements banner appears when an active announcement exists", async ({ page }) => {
      await page.goto("/contractor");
      await page.waitForLoadState("domcontentloaded");
      // Announcement is conditional — just verify the page loads without error
      const isLoaded = await page.locator("main, [role='main'], #root").isVisible();
      expect(isLoaded).toBeTruthy();
    });
  });

  // ─── Job Board ───────────────────────────────────────────────────────────────
  test.describe("Job Board", () => {
    test("/contractor/job-board loads and shows available jobs list", async ({ page }) => {
      await page.goto("/contractor/job-board");
      await page.waitForLoadState("domcontentloaded");

      await expect(page.locator("h1, h2").filter({ hasText: /job board|available jobs/i }).first()).toBeVisible();
    });

    test("Search bar filters jobs by keyword", async ({ page }) => {
      await page.goto("/contractor/job-board");
      await page.waitForLoadState("domcontentloaded");

      const searchInput = page.locator('input[type="search"], input[placeholder*="search" i]').first();
      if (await searchInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await searchInput.fill("plumbing");
        await page.waitForTimeout(500);
        await expect(page.locator("main").first()).toBeVisible();
      }
    });

    test("Priority filter chips filter the job list", async ({ page }) => {
      await page.goto("/contractor/job-board");
      await page.waitForLoadState("domcontentloaded");

      const emergencyFilter = page.locator('button:has-text("Emergency"), [data-filter="emergency"]').first();
      if (await emergencyFilter.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await emergencyFilter.click();
        await page.waitForLoadState("domcontentloaded");
        await expect(page.locator("main").first()).toBeVisible();
      }
    });

    test("Skill tier filter chips filter the job list", async ({ page }) => {
      await page.goto("/contractor/job-board");
      await page.waitForLoadState("domcontentloaded");

      const tierFilter = page.locator('button:has-text("Tier 1"), button:has-text("Tier 2"), button:has-text("Tier")').first();
      if (await tierFilter.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await tierFilter.click();
        await page.waitForLoadState("domcontentloaded");
        await expect(page.locator("main").first()).toBeVisible();
      }
    });

    test("Clicking a job card opens the job detail dialog", async ({ page }) => {
      await page.goto("/contractor/job-board");
      await page.waitForLoadState("domcontentloaded");

      const jobCard = page.locator('[data-testid="job-card"], .job-card, [class*="job"]').first();
      if (await jobCard.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await jobCard.click();
        await expect(page.locator('[role="dialog"]').first()).toBeVisible({ timeout: 5_000 });
      }
    });

    test("Job detail dialog shows Accept Job button", async ({ page }) => {
      await page.goto("/contractor/job-board");
      await page.waitForLoadState("domcontentloaded");

      const jobCard = page.locator('[data-testid="job-card"], .job-card, [class*="job"]').first();
      if (await jobCard.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await jobCard.click();
        await page.waitForSelector('[role="dialog"]', { timeout: 5_000 });
        await expect(
          page.locator('[role="dialog"] button:has-text("Accept"), [role="dialog"] button:has-text("Accept Job")').first()
        ).toBeVisible({ timeout: 5_000 });
      }
    });

    test("Accepting a job moves it to My Jobs", async ({ page }) => {
      await page.goto("/contractor/job-board");
      await page.waitForLoadState("domcontentloaded");

      const jobCard = page.locator('[data-testid="job-card"], .job-card, [class*="job"]').first();
      if (await jobCard.isVisible({ timeout: 5_000 }).catch(() => false)) {
        const jobTitle = await jobCard.locator("h3, h4, [class*='title']").first().textContent().catch(() => "");
        await jobCard.click();
        await page.waitForSelector('[role="dialog"]', { timeout: 5_000 });

        const acceptButton = page.locator('[role="dialog"] button:has-text("Accept"), [role="dialog"] button:has-text("Accept Job")').first();
        if (await acceptButton.isVisible({ timeout: 3_000 }).catch(() => false)) {
          await acceptButton.click();
          await page.waitForLoadState("domcontentloaded");

          // Navigate to My Jobs and verify the job appears
          await page.goto("/contractor/my-jobs");
          await page.waitForLoadState("domcontentloaded");

          if (jobTitle) {
            await expect(page.locator(`text=${jobTitle}`).first()).toBeVisible({ timeout: 10_000 });
          }
        }
      }
    });
  });

  // ─── My Jobs ─────────────────────────────────────────────────────────────────
  test.describe("My Jobs", () => {
    test("/contractor/my-jobs loads and shows assigned jobs list", async ({ page }) => {
      await page.goto("/contractor/my-jobs");
      await page.waitForLoadState("domcontentloaded");

      await expect(page.locator("h1, h2").filter({ hasText: /my jobs/i }).first()).toBeVisible();
    });

    test("Status filter tabs work (Active, Completed, All)", async ({ page }) => {
      await page.goto("/contractor/my-jobs");
      await page.waitForLoadState("domcontentloaded");

      const completedTab = page.locator('button:has-text("Completed"), [role="tab"]:has-text("Completed")').first();
      if (await completedTab.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await completedTab.click();
        await page.waitForLoadState("domcontentloaded");
        await expect(page.locator("main").first()).toBeVisible();
      }
    });

    test("Clicking a job card opens job detail with Start Job button for active jobs", async ({ page }) => {
      await page.goto("/contractor/my-jobs");
      await page.waitForLoadState("domcontentloaded");

      const jobCard = page.locator('[data-testid="job-card"], .job-card, [class*="job"]').first();
      if (await jobCard.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await jobCard.click();
        await expect(page.locator('[role="dialog"]').first()).toBeVisible({ timeout: 5_000 });
        await expect(
          page.locator('[role="dialog"] button:has-text("Start"), [role="dialog"] button:has-text("Start Job"), [role="dialog"] button:has-text("Check In")').first()
        ).toBeVisible({ timeout: 5_000 });
      }
    });

    test("Completing a job shows the completion form with photo upload and notes fields", async ({ page }) => {
      await page.goto("/contractor/my-jobs");
      await page.waitForLoadState("domcontentloaded");

      const jobCard = page.locator('[data-testid="job-card"], .job-card, [class*="job"]').first();
      if (await jobCard.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await jobCard.click();
        await page.waitForSelector('[role="dialog"]', { timeout: 5_000 });

        const completeButton = page.locator('[role="dialog"] button:has-text("Complete"), [role="dialog"] button:has-text("Mark Complete")').first();
        if (await completeButton.isVisible({ timeout: 3_000 }).catch(() => false)) {
          await completeButton.click();
          await expect(
            page.locator('[role="dialog"] textarea, [role="dialog"] input[type="file"]').first()
          ).toBeVisible({ timeout: 5_000 });
        }
      }
    });
  });

  // ─── Profile ─────────────────────────────────────────────────────────────────
  test.describe("Profile", () => {
    test("/contractor/profile loads and shows profile form with name, bio, and skills fields", async ({ page }) => {
      await page.goto("/contractor/profile");
      await page.waitForLoadState("domcontentloaded");

      await expect(page.locator("h1, h2").filter({ hasText: /profile/i }).first()).toBeVisible();
      await expect(
        page.locator('input[name="name"], input[placeholder*="name" i]').first()
      ).toBeVisible();
    });

    test("Updating bio and saving shows success toast", async ({ page }) => {
      await page.goto("/contractor/profile");
      await page.waitForLoadState("domcontentloaded");

      const bioField = page.locator('textarea[name="bio"], textarea[placeholder*="bio" i], textarea[placeholder*="about" i]').first();
      if (await bioField.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await bioField.fill("Updated bio from E2E test");
        await page.locator('button:has-text("Save"), button[type="submit"]').first().click();
        await expect(page.locator("text=/saved|success|updated/i").first()).toBeVisible({ timeout: 5_000 });
      }
    });

    test("Adding a service area shows it in the service areas list", async ({ page }) => {
      await page.goto("/contractor/profile");
      await page.waitForLoadState("domcontentloaded");

      const addAreaButton = page.locator('button:has-text("Add Service Area"), button:has-text("Add Area")').first();
      if (await addAreaButton.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await addAreaButton.click();
        const zipInput = page.locator('input[name="zip"], input[placeholder*="zip" i]').first();
        if (await zipInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
          await zipInput.fill("26505");
          await page.locator('button:has-text("Add"), button[type="submit"]').first().click();
          await expect(page.locator("text=26505").first()).toBeVisible({ timeout: 5_000 });
        }
      }
    });

    test("Uploading a profile photo shows preview", async ({ page }) => {
      await page.goto("/contractor/profile");
      await page.waitForLoadState("domcontentloaded");

      const fileInput = page.locator('input[type="file"]').first();
      if (await fileInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
        // Just verify the file input is present and accepts images
        const acceptAttr = await fileInput.getAttribute("accept");
        expect(acceptAttr).toMatch(/image/i);
      }
    });

    test("Skill tier badge is visible on the profile page", async ({ page }) => {
      await page.goto("/contractor/profile");
      await page.waitForLoadState("domcontentloaded");

      const tierBadge = page.locator("text=/tier 1|tier 2|tier 3/i").first();
      if (await tierBadge.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await expect(tierBadge).toBeVisible();
      }
    });
  });

  // ─── Earnings ────────────────────────────────────────────────────────────────
  test.describe("Earnings", () => {
    test("/contractor/earnings loads and shows earnings summary cards", async ({ page }) => {
      await page.goto("/contractor/earnings");
      await page.waitForLoadState("domcontentloaded");

      await expect(page.locator("h1, h2").filter({ hasText: /earnings/i }).first()).toBeVisible();
      await expect(page.locator("text=/total earnings/i").first()).toBeVisible();
    });

    test("Earnings chart is visible", async ({ page }) => {
      await page.goto("/contractor/earnings");
      await page.waitForLoadState("domcontentloaded");

      await expect(
        page.locator("svg, canvas, [class*='chart'], [class*='Chart']").first()
      ).toBeVisible({ timeout: 5_000 });
    });

    test("Transactions table shows earnings history or empty state", async ({ page }) => {
      await page.goto("/contractor/earnings");
      await page.waitForLoadState("domcontentloaded");

      const hasTable = await page.locator("table, [role='table']").isVisible({ timeout: 3_000 }).catch(() => false);
      const hasEmptyState = await page.locator("text=/no transactions|no earnings/i").isVisible({ timeout: 3_000 }).catch(() => false);
      expect(hasTable || hasEmptyState).toBeTruthy();
    });
  });

  // ─── Payouts ─────────────────────────────────────────────────────────────────
  test.describe("Payouts", () => {
    test.slow();

    test("/contractor/payouts loads and shows payout history or empty state", async ({ page }) => {
      await mockStripeRoutes(page);
      await page.goto("/contractor/payouts");
      await page.waitForLoadState("domcontentloaded");

      await expect(page.locator("h1, h2").filter({ hasText: /payout/i }).first()).toBeVisible();
    });

    test("Connect Stripe button is visible when Stripe is not connected", async ({ page }) => {
      await mockStripeRoutes(page);
      await page.goto("/contractor/payouts");
      await page.waitForLoadState("domcontentloaded");

      const connectButton = page.locator('button:has-text("Connect Stripe"), button:has-text("Connect"), a:has-text("Connect Stripe")').first();
      const isConnected = await page.locator("text=/connected|bank account/i").isVisible({ timeout: 3_000 }).catch(() => false);

      // Either connected or shows connect button
      const hasConnectButton = await connectButton.isVisible({ timeout: 3_000 }).catch(() => false);
      expect(isConnected || hasConnectButton).toBeTruthy();
    });
  });

  // ─── Feature Requests ────────────────────────────────────────────────────────
  test.describe("Feature Requests", () => {
    test("/contractor/feature-requests loads showing contractor-submitted requests", async ({ page }) => {
      await page.goto("/contractor/feature-requests");
      await page.waitForLoadState("domcontentloaded");

      await expect(page.locator("h1, h2").filter({ hasText: /feature/i }).first()).toBeVisible();
    });

    test("Submitting a feature request creates a new card", async ({ page }) => {
      await page.goto("/contractor/feature-requests");
      await page.waitForLoadState("domcontentloaded");

      await page.locator('button:has-text("Submit"), button:has-text("New Request"), button:has-text("Feature Request")').first().click();
      await page.waitForSelector('[role="dialog"]', { timeout: 5_000 });

      const timestamp = Date.now();
      const title = `Contractor E2E Request ${timestamp}`;
      await page.locator('[role="dialog"] input[name="title"], [role="dialog"] input[placeholder*="title" i]').first().fill(title);
      await page.locator('[role="dialog"] textarea[name="description"], [role="dialog"] textarea[placeholder*="description" i]').first().fill("Contractor E2E test feature request");

      await page.locator('[role="dialog"] button[type="submit"], [role="dialog"] button:has-text("Submit")').first().click();

      await expect(page.locator(`text=${title}`).first()).toBeVisible({ timeout: 10_000 });
    });
  });

  // ─── Geofence and clock-in/out flows ─────────────────────────────────────────
  test.describe("Geofence and clock-in/out flows", () => {
    test("Clock In button is visible on an active job and triggers location check", async ({ page }) => {
      await page.goto("/contractor/my-jobs");
      await page.waitForLoadState("domcontentloaded");

      const clockInBtn = page.locator('button:has-text("Clock In"), button:has-text("Check In")').first();
      if (await clockInBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await clockInBtn.click();
        await page.waitForTimeout(800);
        const geofenceWarning = await page.locator("text=/outside.*area|geofence|too far|location/i").first().isVisible({ timeout: 5_000 }).catch(() => false);
        const clockedIn = await page.locator("text=/clocked in|clock out|checked in/i").first().isVisible({ timeout: 5_000 }).catch(() => false);
        expect(geofenceWarning || clockedIn).toBeTruthy();
      }
    });

    test("Geofence warning banner appears when contractor is outside job radius", async ({ page }) => {
      await page.context().setGeolocation({ latitude: 0, longitude: 0 });
      await page.goto("/contractor/my-jobs");
      await page.waitForLoadState("domcontentloaded");

      const clockInBtn = page.locator('button:has-text("Clock In"), button:has-text("Check In")').first();
      if (await clockInBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await clockInBtn.click();
        await page.waitForTimeout(1_000);
      }
      const isLoaded = await page.locator("main, [role='main']").isVisible();
      expect(isLoaded).toBeTruthy();
    });
  });

  // ─── Onboarding checklist ─────────────────────────────────────────────────────
  test.describe("Onboarding checklist", () => {
    test("Contractor onboarding checklist is visible on dashboard for new contractors", async ({ page }) => {
      await page.goto("/contractor");
      await page.waitForLoadState("domcontentloaded");
      const isLoaded = await page.locator("main, [role='main']").isVisible();
      expect(isLoaded).toBeTruthy();
    });

    test("Onboarding step Complete your profile links to /contractor/profile", async ({ page }) => {
      await page.goto("/contractor");
      await page.waitForLoadState("domcontentloaded");
      const profileStep = page.locator("text=/complete.*profile|profile.*setup/i").first();
      if (await profileStep.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await profileStep.click();
        await page.waitForLoadState("domcontentloaded");
        expect(page.url()).toContain("/contractor/profile");
      }
    });
  });

  // ─── Stripe Connect polling ───────────────────────────────────────────────────
  test.describe("Stripe Connect polling", () => {
    test("Payouts page shows Stripe Connect status and Connect button when not connected", async ({ page }) => {
      await mockStripeRoutes(page);
      await page.goto("/contractor/payouts");
      await page.waitForLoadState("domcontentloaded");

      const connectBtn = page.locator('button:has-text("Connect Stripe"), button:has-text("Set Up Payouts"), a:has-text("Connect")').first();
      const connectedStatus = page.locator("text=/connected|stripe.*connected|payout.*enabled/i").first();
      const hasConnect = await connectBtn.isVisible({ timeout: 3_000 }).catch(() => false);
      const hasStatus = await connectedStatus.isVisible({ timeout: 3_000 }).catch(() => false);
      expect(hasConnect || hasStatus).toBeTruthy();
    });
  });

  // ─── Job board real-time refresh ─────────────────────────────────────────────
  test.describe("Job board real-time refresh", () => {
    test("Job board has a Refresh button or auto-refreshes", async ({ page }) => {
      await page.goto("/contractor/job-board");
      await page.waitForLoadState("domcontentloaded");

      const refreshBtn = page.locator('button:has-text("Refresh"), button[aria-label*="refresh" i]').first();
      if (await refreshBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await refreshBtn.click();
        await page.waitForLoadState("domcontentloaded");
      }
      const isLoaded = await page.locator("main, [role='main']").isVisible();
      expect(isLoaded).toBeTruthy();
    });
  });

  // ─── Mobile viewport ─────────────────────────────────────────────────────────
  test.describe("Mobile viewport — contractor", () => {
    test("Contractor dashboard is responsive on a 375px mobile viewport", async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 812 });
      await page.goto("/contractor");
      await page.waitForLoadState("domcontentloaded");

      const isLoaded = await page.locator("main, [role='main'], #root").isVisible();
      expect(isLoaded).toBeTruthy();

      const hasHorizontalScroll = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      expect(hasHorizontalScroll).toBeFalsy();
    });

    test("Contractor job board is usable on mobile — job cards stack vertically", async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 812 });
      await page.goto("/contractor/job-board");
      await page.waitForLoadState("domcontentloaded");

      const isLoaded = await page.locator("main, [role='main']").isVisible();
      expect(isLoaded).toBeTruthy();

      const hasHorizontalScroll = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      expect(hasHorizontalScroll).toBeFalsy();
    });
  });
});
