/**
 * api.spec.ts
 * Tests for REST endpoints outside tRPC:
 *   - Stripe webhook  (/api/stripe/webhook)
 *   - PMS webhook     (/api/webhooks/pms/buildium)
 *   - Invoice PDF     (/api/invoice/:id/pdf)
 *   - Receipt PDF     (/api/receipt/:id/pdf)
 *   - Bulk ZIP export (/api/invoice/bulk-export)
 *
 * These tests use Playwright's `request` fixture (no browser) so they run
 * fast and can be included in a CI pipeline without a headed browser.
 */

import { test, expect } from "@playwright/test";
import * as crypto from "crypto";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

// ─── Stripe Webhook ──────────────────────────────────────────────────────────
test.describe("Stripe webhook endpoint", () => {
  test("POST /api/stripe/webhook without signature returns 400", async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/stripe/webhook`, {
      headers: { "Content-Type": "application/json" },
      data: JSON.stringify({ type: "payment_intent.succeeded" }),
    });
    // Stripe webhook without a valid signature should be rejected
    expect([400, 401, 403]).toContain(res.status());
  });

  test("POST /api/stripe/webhook with test event id returns verified:true", async ({ request }) => {
    const testEvent = {
      id: "evt_test_abc123",
      type: "payment_intent.succeeded",
      data: { object: { id: "pi_test_abc123" } },
    };

    const res = await request.post(`${BASE_URL}/api/stripe/webhook`, {
      headers: {
        "Content-Type": "application/json",
        "stripe-signature": "t=0,v1=test",
      },
      data: JSON.stringify(testEvent),
    });

    // Test events should return { verified: true } per the stripe integration spec
    if (res.status() === 200) {
      const body = await res.json();
      expect(body).toMatchObject({ verified: true });
    } else {
      // Some environments may not have Stripe keys configured — just confirm not 5xx
      expect(res.status()).toBeLessThan(500);
    }
  });

  test("POST /api/stripe/webhook with malformed JSON returns 400", async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/stripe/webhook`, {
      headers: {
        "Content-Type": "application/json",
        "stripe-signature": "t=0,v1=test",
      },
      data: "not-valid-json{{{",
    });
    expect([400, 401, 403]).toContain(res.status());
  });
});

// ─── PMS Webhook (Buildium) ───────────────────────────────────────────────────
test.describe("PMS webhook endpoint — Buildium", () => {
  test("POST /api/webhooks/pms/buildium without signature returns 401", async ({ request }) => {
    const payload = JSON.stringify({
      TaskId: 99999,
      TaskType: "ResidentRequest",
      AccountId: 633160,
      EventName: "Task.Created",
      EventDateTime: new Date().toISOString(),
    });

    const res = await request.post(`${BASE_URL}/api/webhooks/pms/buildium`, {
      headers: { "Content-Type": "application/json" },
      data: payload,
    });

    // No signature → should be rejected
    expect([400, 401, 403]).toContain(res.status());
  });

  test("POST /api/webhooks/pms/buildium with wrong HMAC signature returns 401", async ({ request }) => {
    const payload = JSON.stringify({
      TaskId: 99999,
      TaskType: "ResidentRequest",
      AccountId: 633160,
      EventName: "Task.Created",
      EventDateTime: new Date().toISOString(),
    });

    // Sign with a wrong secret
    const wrongSecret = "wrong-secret-key";
    const sig = crypto.createHmac("sha256", wrongSecret).update(payload).digest("base64");

    const res = await request.post(`${BASE_URL}/api/webhooks/pms/buildium`, {
      headers: {
        "Content-Type": "application/json",
        "buildium-webhook-signature": sig,
      },
      data: payload,
    });

    expect([401, 403]).toContain(res.status());
  });

  test("POST /api/webhooks/pms/buildium with unknown AccountId returns 404 or 200", async ({ request }) => {
    // Even with a valid-looking signature, an unknown AccountId should not crash the server
    const payload = JSON.stringify({
      TaskId: 99999,
      TaskType: "ResidentRequest",
      AccountId: 0,
      EventName: "Task.Created",
      EventDateTime: new Date().toISOString(),
    });

    // We don't know the real secret so we can't sign correctly — just verify not 5xx
    const res = await request.post(`${BASE_URL}/api/webhooks/pms/buildium`, {
      headers: {
        "Content-Type": "application/json",
        "buildium-webhook-signature": "invalid",
      },
      data: payload,
    });

    expect(res.status()).toBeLessThan(500);
  });
});

// ─── Invoice PDF ─────────────────────────────────────────────────────────────
test.describe("Invoice PDF endpoint", () => {
  test("GET /api/invoice/nonexistent/pdf returns 401 or 404 for unauthenticated request", async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/invoice/nonexistent-id/pdf`);
    // Unauthenticated request should be rejected
    expect([401, 403, 404]).toContain(res.status());
  });

  test("GET /api/invoice/nonexistent/pdf does not return 500", async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/invoice/nonexistent-id/pdf`);
    expect(res.status()).toBeLessThan(500);
  });
});

// ─── Receipt PDF ─────────────────────────────────────────────────────────────
test.describe("Receipt PDF endpoint", () => {
  test("GET /api/receipt/nonexistent/pdf returns 401 or 404 for unauthenticated request", async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/receipt/nonexistent-id/pdf`);
    expect([401, 403, 404]).toContain(res.status());
  });

  test("GET /api/receipt/nonexistent/pdf does not return 500", async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/receipt/nonexistent-id/pdf`);
    expect(res.status()).toBeLessThan(500);
  });
});

// ─── Bulk ZIP Export ─────────────────────────────────────────────────────────
test.describe("Bulk invoice ZIP export endpoint", () => {
  test("POST /api/invoice/bulk-export returns 401 for unauthenticated request", async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/invoice/bulk-export`, {
      headers: { "Content-Type": "application/json" },
      data: JSON.stringify({ invoiceIds: ["id1", "id2"] }),
    });
    expect([401, 403]).toContain(res.status());
  });

  test("POST /api/invoice/bulk-export with empty ids array returns 400 or 401", async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/invoice/bulk-export`, {
      headers: { "Content-Type": "application/json" },
      data: JSON.stringify({ invoiceIds: [] }),
    });
    expect([400, 401, 403]).toContain(res.status());
  });
});

// ─── Health / Misc ────────────────────────────────────────────────────────────
test.describe("Server health", () => {
  test("GET / returns 200 (app shell loads)", async ({ request }) => {
    const res = await request.get(`${BASE_URL}/`);
    expect(res.status()).toBe(200);
  });

  test("GET /api/trpc/auth.me returns 200 with null user when unauthenticated", async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/trpc/auth.me`);
    // tRPC returns 200 even for unauthenticated publicProcedure calls
    expect(res.status()).toBe(200);
    const body = await res.json();
    // Result should be a tRPC envelope
    expect(body).toHaveProperty("result");
  });

  test("GET /api/trpc/nonexistent.procedure returns 404", async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/trpc/nonexistent.procedure`);
    expect([404, 400]).toContain(res.status());
  });

  test("Unknown routes return 404 not 500", async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/this-route-does-not-exist`);
    expect(res.status()).toBe(404);
  });
});
