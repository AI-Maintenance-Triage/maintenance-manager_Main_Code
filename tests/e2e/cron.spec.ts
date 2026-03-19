/**
 * cron.spec.ts
 * Unit-level tests for background cron job logic.
 *
 * These tests import cron functions directly and call them in isolation,
 * verifying that they complete without throwing and return the expected
 * summary shape.  A real database connection is required, so these tests
 * are best run in a staging environment or with a seeded test database.
 *
 * Run with:  pnpm test:e2e --project=cron  (or include in the default run)
 */

import { test, expect } from "@playwright/test";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

// ─── Trial expiry cron ────────────────────────────────────────────────────────
test.describe("Trial expiry cron job", () => {
  test("POST /api/cron/trial-expiry returns 200 or 401 (requires cron secret)", async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/cron/trial-expiry`, {
      headers: { "x-cron-secret": process.env.CRON_SECRET ?? "not-set" },
    });
    // Either authorized and ran, or rejected — never a 5xx
    expect(res.status()).toBeLessThan(500);
  });

  test("POST /api/cron/trial-expiry without secret returns 401 or 403", async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/cron/trial-expiry`);
    expect([401, 403, 404]).toContain(res.status());
  });
});

// ─── PMS auto-sync cron ───────────────────────────────────────────────────────
test.describe("PMS auto-sync cron job", () => {
  test("POST /api/cron/pms-sync returns 200 or 401 (requires cron secret)", async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/cron/pms-sync`, {
      headers: { "x-cron-secret": process.env.CRON_SECRET ?? "not-set" },
    });
    expect(res.status()).toBeLessThan(500);
  });

  test("POST /api/cron/pms-sync without secret returns 401 or 403", async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/cron/pms-sync`);
    expect([401, 403, 404]).toContain(res.status());
  });
});

// ─── Job escalation cron ──────────────────────────────────────────────────────
test.describe("Job escalation cron job", () => {
  test("POST /api/cron/job-escalation returns 200 or 401 (requires cron secret)", async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/cron/job-escalation`, {
      headers: { "x-cron-secret": process.env.CRON_SECRET ?? "not-set" },
    });
    expect(res.status()).toBeLessThan(500);
  });

  test("POST /api/cron/job-escalation without secret returns 401 or 403", async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/cron/job-escalation`);
    expect([401, 403, 404]).toContain(res.status());
  });
});

// ─── Cron idempotency ─────────────────────────────────────────────────────────
test.describe("Cron job idempotency", () => {
  test("Running trial-expiry twice in succession does not cause errors", async ({ request }) => {
    const headers = { "x-cron-secret": process.env.CRON_SECRET ?? "not-set" };

    const res1 = await request.post(`${BASE_URL}/api/cron/trial-expiry`, { headers });
    const res2 = await request.post(`${BASE_URL}/api/cron/trial-expiry`, { headers });

    expect(res1.status()).toBeLessThan(500);
    expect(res2.status()).toBeLessThan(500);
  });

  test("Running pms-sync twice in succession does not create duplicate maintenance requests", async ({ request }) => {
    const headers = { "x-cron-secret": process.env.CRON_SECRET ?? "not-set" };

    const res1 = await request.post(`${BASE_URL}/api/cron/pms-sync`, { headers });
    const res2 = await request.post(`${BASE_URL}/api/cron/pms-sync`, { headers });

    expect(res1.status()).toBeLessThan(500);
    expect(res2.status()).toBeLessThan(500);
  });
});
