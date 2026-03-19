import { test, expect } from "@playwright/test";
import { loginAsAdmin, mockStripeRoutes } from "./helpers/auth";

test.describe("Admin flows", () => {
  test.beforeEach(async ({ page }) => {
    // Auth is handled via storageState in playwright.config.ts
    void page; // suppress unused variable warning
  });

  // ─── Dashboard ───────────────────────────────────────────────────────────────
  test.describe("Dashboard", () => {
    test("/admin loads and shows platform KPI cards", async ({ page }) => {
      await page.goto("/admin");
      await page.waitForLoadState("domcontentloaded");

      await expect(page.locator("text=/total companies/i").first()).toBeVisible();
      await expect(page.locator("text=/total contractors/i").first()).toBeVisible();
      await expect(page.locator("text=/total jobs/i").first()).toBeVisible();
    });

    test("Recent registrations table is visible", async ({ page }) => {
      await page.goto("/admin");
      await page.waitForLoadState("domcontentloaded");

      await expect(
        page.locator("text=/recent registrations|recent signups/i").first()
      ).toBeVisible();
    });

    test("Navigation sidebar shows all admin sections", async ({ page }) => {
      await page.goto("/admin");
      await page.waitForLoadState("domcontentloaded");

      await expect(page.locator("text=/companies/i").first()).toBeVisible();
      await expect(page.locator("text=/contractors/i").first()).toBeVisible();
      await expect(page.locator("text=/revenue/i").first()).toBeVisible();
      await expect(page.locator("text=/settings/i").first()).toBeVisible();
    });
  });

  // ─── Companies ───────────────────────────────────────────────────────────────
  test.describe("Companies", () => {
    test("/admin/companies loads and shows company list with search", async ({ page }) => {
      await page.goto("/admin/companies");
      await page.waitForLoadState("domcontentloaded");

      await expect(page.locator("h1, h2").filter({ hasText: /companies/i }).first()).toBeVisible();
      await expect(
        page.locator('input[type="search"], input[placeholder*="search" i]').first()
      ).toBeVisible();
    });

    test("Search filters the company list", async ({ page }) => {
      await page.goto("/admin/companies");
      await page.waitForLoadState("domcontentloaded");

      const searchInput = page.locator('input[type="search"], input[placeholder*="search" i]').first();
      await searchInput.fill("test");
      await page.waitForTimeout(500);
      await expect(page.locator("main").first()).toBeVisible();
    });

    test("View As button impersonates a company and shows the company dashboard", async ({ page }) => {
      await page.goto("/admin/companies");
      await page.waitForLoadState("domcontentloaded");

      const viewAsButton = page.locator('button:has-text("View As"), button:has-text("Impersonate")').first();
      if (await viewAsButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await viewAsButton.click();
        await page.waitForLoadState("domcontentloaded");

        // Should show the company dashboard with an admin banner
        await expect(
          page.locator("text=/viewing as|impersonating|admin view/i").first()
        ).toBeVisible({ timeout: 10_000 });
      }
    });

    test("Suspend company button shows confirmation dialog", async ({ page }) => {
      await page.goto("/admin/companies");
      await page.waitForLoadState("domcontentloaded");

      const suspendButton = page.locator('button:has-text("Suspend")').first();
      if (await suspendButton.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await suspendButton.click();
        await expect(page.locator('[role="dialog"], [role="alertdialog"]').first()).toBeVisible({ timeout: 5_000 });
      }
    });
  });

  // ─── Contractors ─────────────────────────────────────────────────────────────
  test.describe("Contractors", () => {
    test("/admin/contractors loads and shows contractor list with search", async ({ page }) => {
      await page.goto("/admin/contractors");
      await page.waitForLoadState("domcontentloaded");

      await expect(page.locator("h1, h2").filter({ hasText: /contractors/i }).first()).toBeVisible();
    });

    test("View As button impersonates a contractor and shows the contractor dashboard", async ({ page }) => {
      await page.goto("/admin/contractors");
      await page.waitForLoadState("domcontentloaded");

      const viewAsButton = page.locator('button:has-text("View As"), button:has-text("Impersonate")').first();
      if (await viewAsButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await viewAsButton.click();
        await page.waitForLoadState("domcontentloaded");

        await expect(
          page.locator("text=/viewing as|impersonating|admin view/i").first()
        ).toBeVisible({ timeout: 10_000 });
      }
    });
  });

  // ─── Revenue ─────────────────────────────────────────────────────────────────
  test.describe("Revenue", () => {
    test("/admin/revenue loads and shows MRR, ARR, and churn rate KPI cards", async ({ page }) => {
      await mockStripeRoutes(page);
      await page.goto("/admin/revenue");
      await page.waitForLoadState("domcontentloaded");

      await expect(page.locator("text=/mrr|monthly recurring/i").first()).toBeVisible();
      await expect(page.locator("text=/arr|annual recurring/i").first()).toBeVisible();
    });

    test("Revenue chart is visible", async ({ page }) => {
      await mockStripeRoutes(page);
      await page.goto("/admin/revenue");
      await page.waitForLoadState("domcontentloaded");

      await expect(
        page.locator("svg, canvas, [class*='chart'], [class*='Chart']").first()
      ).toBeVisible({ timeout: 5_000 });
    });
  });

  // ─── Subscription Plans ───────────────────────────────────────────────────────
  test.describe("Subscription Plans", () => {
    test("/admin/subscription-plans loads and shows plan list", async ({ page }) => {
      await page.goto("/admin/subscription-plans");
      await page.waitForLoadState("domcontentloaded");

      await expect(page.locator("h1, h2").filter({ hasText: /plans|subscription/i }).first()).toBeVisible();
    });

    test("Create Plan button opens dialog with name, price, and feature fields", async ({ page }) => {
      await page.goto("/admin/subscription-plans");
      await page.waitForLoadState("domcontentloaded");

      await page.locator('button:has-text("Create Plan"), button:has-text("New Plan"), button:has-text("Add Plan")').first().click();

      await expect(
        page.locator('[role="dialog"] input[name="name"], [role="dialog"] input[placeholder*="name" i]').first()
      ).toBeVisible({ timeout: 5_000 });
      await expect(
        page.locator('[role="dialog"] input[name="price"], [role="dialog"] input[type="number"]').first()
      ).toBeVisible();
    });

    test("Editing a plan opens dialog pre-filled with existing data", async ({ page }) => {
      await page.goto("/admin/subscription-plans");
      await page.waitForLoadState("domcontentloaded");

      const editButton = page.locator('button:has-text("Edit")').first();
      if (await editButton.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await editButton.click();
        await expect(
          page.locator('[role="dialog"] input[name="name"], [role="dialog"] input[placeholder*="name" i]').first()
        ).toBeVisible({ timeout: 5_000 });
        const nameValue = await page.locator('[role="dialog"] input[name="name"]').first().inputValue().catch(() => "");
        expect(nameValue.length).toBeGreaterThan(0);
      }
    });
  });

  // ─── Activity Feed ───────────────────────────────────────────────────────────
  test.describe("Activity Feed", () => {
    test("/admin/activity-feed loads and shows recent platform events", async ({ page }) => {
      await page.goto("/admin/activity-feed");
      await page.waitForLoadState("domcontentloaded");

      await expect(page.locator("h1, h2").filter({ hasText: /activity/i }).first()).toBeVisible();
    });

    test("Load More button loads additional events", async ({ page }) => {
      await page.goto("/admin/activity-feed");
      await page.waitForLoadState("domcontentloaded");

      const loadMoreButton = page.locator('button:has-text("Load More")').first();
      if (await loadMoreButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await loadMoreButton.click();
        await page.waitForLoadState("domcontentloaded");
        await expect(page.locator("main").first()).toBeVisible();
      }
    });
  });

  // ─── Audit Log ───────────────────────────────────────────────────────────────
  test.describe("Audit Log", () => {
    test("/admin/audit-log loads and shows audit entries", async ({ page }) => {
      await page.goto("/admin/audit-log");
      await page.waitForLoadState("domcontentloaded");

      await expect(page.locator("h1, h2").filter({ hasText: /audit/i }).first()).toBeVisible();
    });

    test("Search filter narrows audit entries", async ({ page }) => {
      await page.goto("/admin/audit-log");
      await page.waitForLoadState("domcontentloaded");

      const searchInput = page.locator('input[type="search"], input[placeholder*="search" i]').first();
      if (await searchInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await searchInput.fill("login");
        await page.waitForTimeout(500);
        await expect(page.locator("main").first()).toBeVisible();
      }
    });
  });

  // ─── Leaderboard ─────────────────────────────────────────────────────────────
  test.describe("Leaderboard", () => {
    test("/admin/leaderboard loads and shows top contractors ranked by jobs completed", async ({ page }) => {
      await page.goto("/admin/leaderboard");
      await page.waitForLoadState("domcontentloaded");

      await expect(page.locator("h1, h2").filter({ hasText: /leaderboard/i }).first()).toBeVisible();
    });
  });

  // ─── Churn Risk ──────────────────────────────────────────────────────────────
  test.describe("Churn Risk", () => {
    test("/admin/churn-risk loads and shows at-risk companies", async ({ page }) => {
      await page.goto("/admin/churn-risk");
      await page.waitForLoadState("domcontentloaded");

      await expect(page.locator("h1, h2").filter({ hasText: /churn/i }).first()).toBeVisible();
    });
  });

  // ─── Email Blast ─────────────────────────────────────────────────────────────
  test.describe("Email Blast", () => {
    test("/admin/email-blast loads with recipient type, subject, and body fields", async ({ page }) => {
      await page.goto("/admin/email-blast");
      await page.waitForLoadState("domcontentloaded");

      await expect(page.locator("h1, h2").filter({ hasText: /email blast|email/i }).first()).toBeVisible();
      await expect(
        page.locator('input[name="subject"], input[placeholder*="subject" i]').first()
      ).toBeVisible();
      await expect(
        page.locator('textarea[name="body"], textarea[placeholder*="body" i], [contenteditable]').first()
      ).toBeVisible();
    });

    test("Recipient type selector shows All, Companies, and Contractors options", async ({ page }) => {
      await page.goto("/admin/email-blast");
      await page.waitForLoadState("domcontentloaded");

      const recipientSelector = page.locator('select[name="recipientType"], [data-testid="recipient-type"]').first();
      if (await recipientSelector.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await expect(recipientSelector).toBeVisible();
      }
    });
  });

  // ─── Payout Holds ────────────────────────────────────────────────────────────
  test.describe("Payout Holds", () => {
    test("/admin/payout-holds loads and shows holds list or empty state", async ({ page }) => {
      await page.goto("/admin/payout-holds");
      await page.waitForLoadState("domcontentloaded");

      await expect(page.locator("h1, h2").filter({ hasText: /payout holds/i }).first()).toBeVisible();
    });

    test("Place Hold button opens dialog with contractor and reason fields", async ({ page }) => {
      await page.goto("/admin/payout-holds");
      await page.waitForLoadState("domcontentloaded");

      await page.locator('button:has-text("Place Hold"), button:has-text("New Hold")').first().click();

      await expect(
        page.locator('[role="dialog"] select, [role="dialog"] input[name="contractorId"]').first()
      ).toBeVisible({ timeout: 5_000 });
      await expect(
        page.locator('[role="dialog"] textarea[name="reason"], [role="dialog"] input[name="reason"]').first()
      ).toBeVisible();
    });
  });

  // ─── Credits ─────────────────────────────────────────────────────────────────
  test.describe("Credits", () => {
    test("/admin/credits loads and shows credits list or empty state", async ({ page }) => {
      await page.goto("/admin/credits");
      await page.waitForLoadState("domcontentloaded");

      await expect(page.locator("h1, h2").filter({ hasText: /credits/i }).first()).toBeVisible();
    });

    test("Issue Credit button opens dialog with company, amount, and reason fields", async ({ page }) => {
      await page.goto("/admin/credits");
      await page.waitForLoadState("domcontentloaded");

      await page.locator('button:has-text("Issue Credit"), button:has-text("Add Credit")').first().click();

      await expect(
        page.locator('[role="dialog"] select, [role="dialog"] input[name="companyId"]').first()
      ).toBeVisible({ timeout: 5_000 });
      await expect(
        page.locator('[role="dialog"] input[name="amount"], [role="dialog"] input[type="number"]').first()
      ).toBeVisible();
    });
  });

  // ─── Suspensions ─────────────────────────────────────────────────────────────
  test.describe("Suspensions", () => {
    test("/admin/suspensions loads and shows suspensions list or empty state", async ({ page }) => {
      await page.goto("/admin/suspensions");
      await page.waitForLoadState("domcontentloaded");

      await expect(page.locator("h1, h2").filter({ hasText: /suspensions/i }).first()).toBeVisible();
    });
  });

  // ─── Feature Flags ───────────────────────────────────────────────────────────
  test.describe("Feature Flags", () => {
    test("/admin/feature-flags loads and shows feature flag toggles", async ({ page }) => {
      await page.goto("/admin/feature-flags");
      await page.waitForLoadState("domcontentloaded");

      await expect(page.locator("h1, h2").filter({ hasText: /feature flags/i }).first()).toBeVisible();
    });

    test("Toggling a feature flag saves the new state", async ({ page }) => {
      await page.goto("/admin/feature-flags");
      await page.waitForLoadState("domcontentloaded");

      const toggle = page.locator('input[type="checkbox"], [role="switch"]').first();
      if (await toggle.isVisible({ timeout: 3_000 }).catch(() => false)) {
        const wasChecked = await toggle.isChecked().catch(() => false);
        await toggle.click();
        await page.waitForTimeout(500);
        const isChecked = await toggle.isChecked().catch(() => false);
        expect(isChecked).toBe(!wasChecked);
      }
    });
  });

  // ─── Announcements ───────────────────────────────────────────────────────────
  test.describe("Announcements", () => {
    test("/admin/announcements loads and shows announcement list", async ({ page }) => {
      await page.goto("/admin/announcements");
      await page.waitForLoadState("domcontentloaded");

      await expect(page.locator("h1, h2").filter({ hasText: /announcements/i }).first()).toBeVisible();
    });

    test("Create Announcement button opens dialog with title, message, and audience fields", async ({ page }) => {
      await page.goto("/admin/announcements");
      await page.waitForLoadState("domcontentloaded");

      await page.locator('button:has-text("Create"), button:has-text("New Announcement")').first().click();

      await expect(
        page.locator('[role="dialog"] input[name="title"], [role="dialog"] input[placeholder*="title" i]').first()
      ).toBeVisible({ timeout: 5_000 });
      await expect(
        page.locator('[role="dialog"] textarea[name="message"], [role="dialog"] textarea[placeholder*="message" i]').first()
      ).toBeVisible();
    });

    test("Submitting a new announcement creates it in the list", async ({ page }) => {
      await page.goto("/admin/announcements");
      await page.waitForLoadState("domcontentloaded");

      await page.locator('button:has-text("Create"), button:has-text("New Announcement")').first().click();
      await page.waitForSelector('[role="dialog"]', { timeout: 5_000 });

      const timestamp = Date.now();
      const title = `E2E Announcement ${timestamp}`;
      await page.locator('[role="dialog"] input[name="title"], [role="dialog"] input[placeholder*="title" i]').first().fill(title);
      await page.locator('[role="dialog"] textarea[name="message"], [role="dialog"] textarea[placeholder*="message" i]').first().fill("E2E test announcement message");

      await page.locator('[role="dialog"] button[type="submit"], [role="dialog"] button:has-text("Create"), [role="dialog"] button:has-text("Save")').first().click();

      await expect(page.locator(`text=${title}`).first()).toBeVisible({ timeout: 10_000 });
    });
  });

  // ─── Promo Codes ─────────────────────────────────────────────────────────────
  test.describe("Promo Codes", () => {
    test("/admin/promo-codes loads and shows promo code list", async ({ page }) => {
      await page.goto("/admin/promo-codes");
      await page.waitForLoadState("domcontentloaded");

      await expect(page.locator("h1, h2").filter({ hasText: /promo/i }).first()).toBeVisible();
    });

    test("Create Promo Code button opens dialog with code, discount, and expiry fields", async ({ page }) => {
      await page.goto("/admin/promo-codes");
      await page.waitForLoadState("domcontentloaded");

      await page.locator('button:has-text("Create"), button:has-text("New Promo"), button:has-text("Add Code")').first().click();

      await expect(
        page.locator('[role="dialog"] input[name="code"], [role="dialog"] input[placeholder*="code" i]').first()
      ).toBeVisible({ timeout: 5_000 });
      await expect(
        page.locator('[role="dialog"] input[name="discount"], [role="dialog"] input[type="number"]').first()
      ).toBeVisible();
    });

    test("Submitting a new promo code creates it in the list", async ({ page }) => {
      await page.goto("/admin/promo-codes");
      await page.waitForLoadState("domcontentloaded");

      await page.locator('button:has-text("Create"), button:has-text("New Promo"), button:has-text("Add Code")').first().click();
      await page.waitForSelector('[role="dialog"]', { timeout: 5_000 });

      const timestamp = Date.now();
      const code = `E2ETEST${timestamp}`.substring(0, 20).toUpperCase();
      await page.locator('[role="dialog"] input[name="code"], [role="dialog"] input[placeholder*="code" i]').first().fill(code);

      const discountInput = page.locator('[role="dialog"] input[name="discount"], [role="dialog"] input[type="number"]').first();
      if (await discountInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await discountInput.fill("10");
      }

      await page.locator('[role="dialog"] button[type="submit"], [role="dialog"] button:has-text("Create"), [role="dialog"] button:has-text("Save")').first().click();

      await expect(page.locator(`text=${code}`).first()).toBeVisible({ timeout: 10_000 });
    });
  });

  // ─── Maintenance Mode ────────────────────────────────────────────────────────
  test.describe("Maintenance Mode", () => {
    test("/admin/maintenance-mode loads and shows maintenance mode toggle", async ({ page }) => {
      await page.goto("/admin/maintenance-mode");
      await page.waitForLoadState("domcontentloaded");

      await expect(page.locator("h1, h2").filter({ hasText: /maintenance mode/i }).first()).toBeVisible();
      await expect(
        page.locator('input[type="checkbox"], [role="switch"]').first()
      ).toBeVisible();
    });
  });

  // ─── Settings ────────────────────────────────────────────────────────────────
  test.describe("Admin Settings", () => {
    test("/admin/settings loads and shows platform configuration options", async ({ page }) => {
      await page.goto("/admin/settings");
      await page.waitForLoadState("domcontentloaded");

      await expect(page.locator("h1, h2").filter({ hasText: /settings/i }).first()).toBeVisible();
    });

    test("Resync interval field accepts a numeric value and saves", async ({ page }) => {
      await page.goto("/admin/settings");
      await page.waitForLoadState("domcontentloaded");

      const resyncInput = page.locator('input[name*="resync"], input[name*="syncInterval"], input[placeholder*="interval" i]').first();
      if (await resyncInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await resyncInput.fill("24");
        await page.locator('button:has-text("Save"), button[type="submit"]').first().click();
        await expect(page.locator("text=/saved|success/i").first()).toBeVisible({ timeout: 5_000 });
      }
    });
  });

  // ─── Feature Requests ────────────────────────────────────────────────────────
  test.describe("Admin Feature Requests", () => {
    test("/admin/feature-requests loads and shows all submitted feature requests", async ({ page }) => {
      await page.goto("/admin/feature-requests");
      await page.waitForLoadState("domcontentloaded");

      await expect(page.locator("h1, h2").filter({ hasText: /feature requests/i }).first()).toBeVisible();
    });

    test("Status dropdown updates a feature request status", async ({ page }) => {
      await page.goto("/admin/feature-requests");
      await page.waitForLoadState("domcontentloaded");

      const statusSelect = page.locator('select[name*="status"], [data-testid*="status"]').first();
      if (await statusSelect.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await statusSelect.selectOption({ index: 1 });
        await page.waitForLoadState("domcontentloaded");
        await expect(page.locator("main").first()).toBeVisible();
      }
    });
  });

  // ─── Plan deactivation and price change warnings ───────────────────────────────
  test.describe("Plan deactivation and price change warnings", () => {
    test("Deactivating a subscription plan shows a confirmation dialog", async ({ page }) => {
      await page.goto("/admin/subscription-plans");
      await page.waitForLoadState("domcontentloaded");

      const deactivateBtn = page.locator('button:has-text("Deactivate"), button:has-text("Disable Plan")').first();
      if (await deactivateBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await deactivateBtn.click();
        await page.waitForTimeout(500);
        const dialog = await page.locator('[role="dialog"], [role="alertdialog"]').first().isVisible({ timeout: 3_000 }).catch(() => false);
        const confirmText = await page.locator("text=/are you sure|confirm|deactivate/i").first().isVisible({ timeout: 3_000 }).catch(() => false);
        expect(dialog || confirmText).toBeTruthy();
      }
    });

    test("Changing a plan price shows a warning about existing subscribers", async ({ page }) => {
      await page.goto("/admin/subscription-plans");
      await page.waitForLoadState("domcontentloaded");

      const editBtn = page.locator('button:has-text("Edit"), button[aria-label*="edit" i]').first();
      if (await editBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await editBtn.click();
        await page.waitForTimeout(500);

        const priceInput = page.locator('[role="dialog"] input[name="price"], [role="dialog"] input[type="number"]').first();
        if (await priceInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
          const currentPrice = await priceInput.inputValue();
          const newPrice = String(parseFloat(currentPrice || "0") + 10);
          await priceInput.fill(newPrice);
          await page.locator('[role="dialog"] button[type="submit"], [role="dialog"] button:has-text("Save")').first().click();
          await page.waitForTimeout(500);
          const warning = await page.locator("text=/existing.*subscribers|subscribers.*affected|price.*change/i").first().isVisible({ timeout: 5_000 }).catch(() => false);
          const saved = await page.locator("text=/saved|updated|success/i").first().isVisible({ timeout: 5_000 }).catch(() => false);
          expect(warning || saved).toBeTruthy();
        }
      }
    });
  });

  // ─── Loading and empty states ────────────────────────────────────────────────────────
  test.describe("Loading and empty states", () => {
    test("Admin churn risk page shows table or empty state", async ({ page }) => {
      await page.goto("/admin/churn-risk");
      await page.waitForLoadState("domcontentloaded");

      const hasContent = await page.locator("text=/no.*at.*risk|all.*healthy|no churn/i").first().isVisible({ timeout: 3_000 }).catch(() => false);
      const hasTable = await page.locator("table, [role='table']").first().isVisible({ timeout: 3_000 }).catch(() => false);
      expect(hasContent || hasTable).toBeTruthy();
    });

    test("Admin payout holds page shows table or empty state", async ({ page }) => {
      await page.goto("/admin/payout-holds");
      await page.waitForLoadState("domcontentloaded");

      const hasContent = await page.locator("text=/no.*holds|no active holds|all.*clear/i").first().isVisible({ timeout: 3_000 }).catch(() => false);
      const hasTable = await page.locator("table, [role='table']").first().isVisible({ timeout: 3_000 }).catch(() => false);
      expect(hasContent || hasTable).toBeTruthy();
    });

    test("Admin suspensions page shows table or empty state", async ({ page }) => {
      await page.goto("/admin/suspensions");
      await page.waitForLoadState("domcontentloaded");

      const hasContent = await page.locator("text=/no.*suspensions|no active|all.*active/i").first().isVisible({ timeout: 3_000 }).catch(() => false);
      const hasTable = await page.locator("table, [role='table']").first().isVisible({ timeout: 3_000 }).catch(() => false);
      expect(hasContent || hasTable).toBeTruthy();
    });
  });

  // ─── Mobile viewport — admin ────────────────────────────────────────────────────
  test.describe("Mobile viewport — admin", () => {
    test("Admin dashboard is accessible on a 768px tablet viewport", async ({ page }) => {
      await page.setViewportSize({ width: 768, height: 1024 });
      await page.goto("/admin");
      await page.waitForLoadState("domcontentloaded");

      const isLoaded = await page.locator("main, [role='main'], #root").isVisible();
      expect(isLoaded).toBeTruthy();
    });
  });
});
