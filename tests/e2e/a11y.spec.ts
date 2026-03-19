/**
 * a11y.spec.ts
 * WCAG 2.1 accessibility audits using @axe-core/playwright.
 *
 * Audits the most-used pages across all three roles:
 *   - Public: Landing page, Pricing, Contact
 *   - Auth: Login, Register, Reset Password
 *   - Company: Dashboard, Properties, Jobs, Settings, Billing, Integrations
 *   - Contractor: Dashboard, Job Board, Profile
 *   - Admin: Dashboard, Companies, Revenue
 *
 * Each test fails if axe-core finds any "critical" or "serious" violations.
 *
 * Run with:  pnpm test:e2e -- tests/e2e/a11y.spec.ts
 */

import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { loginAsCompany, loginAsContractor, loginAsAdmin } from "./helpers/auth";

// ─── Helper ───────────────────────────────────────────────────────────────────
async function checkA11y(page: Parameters<typeof AxeBuilder>[0]) {
  const results = await new AxeBuilder({ page })
    .include("body")
    .exclude("iframe")
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"])
    .analyze();

  const blocking = results.violations.filter(
    (v) => v.impact === "critical" || v.impact === "serious"
  );

  if (blocking.length > 0) {
    const summary = blocking
      .map(
        (v) =>
          `[${v.impact?.toUpperCase()}] ${v.id}: ${v.description}\n` +
          v.nodes
            .slice(0, 2)
            .map((n) => `  → ${n.html}`)
            .join("\n")
      )
      .join("\n\n");
    expect(blocking, `Accessibility violations found:\n\n${summary}`).toHaveLength(0);
  }

  return results;
}

// ─── Public pages ─────────────────────────────────────────────────────────────
test.describe("Accessibility — Public pages", () => {
  test("Landing page has no critical/serious WCAG violations", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await checkA11y(page);
  });

  test("Pricing page has no critical/serious WCAG violations", async ({ page }) => {
    await page.goto("/pricing");
    await page.waitForLoadState("networkidle");
    await checkA11y(page);
  });

  test("Contact page has no critical/serious WCAG violations", async ({ page }) => {
    await page.goto("/contact");
    await page.waitForLoadState("networkidle");
    await checkA11y(page);
  });
});

// ─── Auth pages ───────────────────────────────────────────────────────────────
test.describe("Accessibility — Auth pages", () => {
  test("Login page has no critical/serious WCAG violations", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    await checkA11y(page);
  });

  test("Register page has no critical/serious WCAG violations", async ({ page }) => {
    await page.goto("/register");
    await page.waitForLoadState("networkidle");
    await checkA11y(page);
  });

  test("Password reset page has no critical/serious WCAG violations", async ({ page }) => {
    await page.goto("/reset-password");
    await page.waitForLoadState("networkidle");
    await checkA11y(page);
  });

  test("Login form — all inputs have accessible labels", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    const results = await new AxeBuilder({ page })
      .withRules(["label", "label-content-name-mismatch"])
      .analyze();
    expect(results.violations.filter((v) => v.id === "label" || v.id === "label-content-name-mismatch")).toHaveLength(0);
  });

  test("Register form — all inputs have accessible labels", async ({ page }) => {
    await page.goto("/register");
    await page.waitForLoadState("networkidle");
    const results = await new AxeBuilder({ page })
      .withRules(["label", "label-content-name-mismatch"])
      .analyze();
    expect(results.violations.filter((v) => v.id === "label" || v.id === "label-content-name-mismatch")).toHaveLength(0);
  });
});

// ─── Company pages ────────────────────────────────────────────────────────────
test.describe("Accessibility — Company pages", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsCompany(page);
  });

  test("Company dashboard has no critical/serious WCAG violations", async ({ page }) => {
    await page.goto("/company");
    await page.waitForLoadState("networkidle");
    await checkA11y(page);
  });

  test("Company properties page has no critical/serious WCAG violations", async ({ page }) => {
    await page.goto("/company/properties");
    await page.waitForLoadState("networkidle");
    await checkA11y(page);
  });

  test("Company jobs page has no critical/serious WCAG violations", async ({ page }) => {
    await page.goto("/company/jobs");
    await page.waitForLoadState("networkidle");
    await checkA11y(page);
  });

  test("Company settings page has no critical/serious WCAG violations", async ({ page }) => {
    await page.goto("/company/settings");
    await page.waitForLoadState("networkidle");
    await checkA11y(page);
  });

  test("Company billing page has no critical/serious WCAG violations", async ({ page }) => {
    await page.goto("/company/billing");
    await page.waitForLoadState("networkidle");
    await checkA11y(page);
  });

  test("Company integrations — interactive elements have accessible names", async ({ page }) => {
    await page.goto("/company/integrations");
    await page.waitForLoadState("networkidle");
    const results = await new AxeBuilder({ page })
      .withRules(["button-name", "link-name", "aria-required-attr"])
      .analyze();
    expect(results.violations).toHaveLength(0);
  });
});

// ─── Contractor pages ─────────────────────────────────────────────────────────
test.describe("Accessibility — Contractor pages", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsContractor(page);
  });

  test("Contractor dashboard has no critical/serious WCAG violations", async ({ page }) => {
    await page.goto("/contractor");
    await page.waitForLoadState("networkidle");
    await checkA11y(page);
  });

  test("Contractor job board has no critical/serious WCAG violations", async ({ page }) => {
    await page.goto("/contractor/jobs");
    await page.waitForLoadState("networkidle");
    await checkA11y(page);
  });

  test("Contractor profile page has no critical/serious WCAG violations", async ({ page }) => {
    await page.goto("/contractor/profile");
    await page.waitForLoadState("networkidle");
    await checkA11y(page);
  });
});

// ─── Admin pages ──────────────────────────────────────────────────────────────
test.describe("Accessibility — Admin pages", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("Admin dashboard has no critical/serious WCAG violations", async ({ page }) => {
    await page.goto("/admin");
    await page.waitForLoadState("networkidle");
    await checkA11y(page);
  });

  test("Admin companies page has no critical/serious WCAG violations", async ({ page }) => {
    await page.goto("/admin/companies");
    await page.waitForLoadState("networkidle");
    await checkA11y(page);
  });

  test("Admin revenue page has no critical/serious WCAG violations", async ({ page }) => {
    await page.goto("/admin/revenue");
    await page.waitForLoadState("networkidle");
    await checkA11y(page);
  });
});

// ─── Color contrast ───────────────────────────────────────────────────────────
test.describe("Accessibility — Color contrast", () => {
  test("Landing page passes color-contrast check", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const results = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
    expect(results.violations.filter((v) => v.id === "color-contrast" && (v.impact === "critical" || v.impact === "serious"))).toHaveLength(0);
  });

  test("Login page passes color-contrast check", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    const results = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
    expect(results.violations.filter((v) => v.id === "color-contrast" && (v.impact === "critical" || v.impact === "serious"))).toHaveLength(0);
  });
});

// ─── Keyboard navigation ──────────────────────────────────────────────────────
test.describe("Accessibility — Keyboard navigation", () => {
  test("Landing page — no keyboard trap", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    let previousFocused = "";
    let stuckCount = 0;

    for (let i = 0; i < 30; i++) {
      await page.keyboard.press("Tab");
      const focused = await page.evaluate(() => document.activeElement?.tagName ?? "");
      stuckCount = focused === previousFocused ? stuckCount + 1 : 0;
      previousFocused = focused;
      expect(stuckCount).toBeLessThan(3);
    }
  });

  test("Login page — tabindex and focus order are valid", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    const results = await new AxeBuilder({ page })
      .withRules(["tabindex", "focus-order-semantics"])
      .analyze();
    expect(results.violations).toHaveLength(0);
  });
});
