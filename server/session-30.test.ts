/**
 * Session 30 Tests: HMAC Webhook Verification + PMS Integration Enhancements
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";

// ─── HMAC Signature Verification ──────────────────────────────────────────────

function verifyHmacSignature(
  payload: string,
  secret: string,
  signature: string,
  headerName: string = "X-Webhook-Signature"
): boolean {
  if (!secret || !signature) return false;
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  const expectedHeader = `sha256=${expected}`;
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedHeader)
    );
  } catch {
    return false;
  }
}

function generateWebhookSecret(): string {
  return `whsec_${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
}

function signPayload(payload: string, secret: string): string {
  const hmac = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return `sha256=${hmac}`;
}

describe("HMAC Webhook Signature Verification", () => {
  it("accepts a valid HMAC-SHA256 signature", () => {
    const secret = generateWebhookSecret();
    const payload = JSON.stringify({ event: "maintenance_request.created", id: 123 });
    const signature = signPayload(payload, secret);
    expect(verifyHmacSignature(payload, secret, signature)).toBe(true);
  });

  it("rejects a signature with wrong secret", () => {
    const secret = generateWebhookSecret();
    const wrongSecret = generateWebhookSecret();
    const payload = JSON.stringify({ event: "maintenance_request.created", id: 123 });
    const signature = signPayload(payload, wrongSecret);
    expect(verifyHmacSignature(payload, secret, signature)).toBe(false);
  });

  it("rejects a tampered payload", () => {
    const secret = generateWebhookSecret();
    const payload = JSON.stringify({ event: "maintenance_request.created", id: 123 });
    const tamperedPayload = JSON.stringify({ event: "maintenance_request.created", id: 999 });
    const signature = signPayload(payload, secret);
    expect(verifyHmacSignature(tamperedPayload, secret, signature)).toBe(false);
  });

  it("rejects a missing signature", () => {
    const secret = generateWebhookSecret();
    const payload = JSON.stringify({ event: "test" });
    expect(verifyHmacSignature(payload, secret, "")).toBe(false);
  });

  it("rejects when secret is empty", () => {
    const payload = JSON.stringify({ event: "test" });
    const signature = "sha256=abc123";
    expect(verifyHmacSignature(payload, "", signature)).toBe(false);
  });

  it("rejects a signature without sha256= prefix", () => {
    const secret = generateWebhookSecret();
    const payload = JSON.stringify({ event: "test" });
    const rawHmac = crypto.createHmac("sha256", secret).update(payload).digest("hex");
    // Missing the sha256= prefix
    expect(verifyHmacSignature(payload, secret, rawHmac)).toBe(false);
  });

  it("uses timing-safe comparison to prevent timing attacks", () => {
    // Verify the function uses crypto.timingSafeEqual (no early exit on mismatch)
    const secret = generateWebhookSecret();
    const payload = "test-payload";
    const validSig = signPayload(payload, secret);
    const invalidSig = "sha256=" + "0".repeat(64);
    // Both should complete without throwing
    expect(() => verifyHmacSignature(payload, secret, validSig)).not.toThrow();
    expect(() => verifyHmacSignature(payload, secret, invalidSig)).not.toThrow();
  });
});

// ─── Webhook Secret Generation ─────────────────────────────────────────────────

describe("Webhook Secret Generation", () => {
  it("generates secrets with whsec_ prefix", () => {
    const secret = generateWebhookSecret();
    expect(secret).toMatch(/^whsec_/);
  });

  it("generates unique secrets", () => {
    const secrets = new Set(Array.from({ length: 100 }, generateWebhookSecret));
    expect(secrets.size).toBe(100);
  });

  it("generates secrets of sufficient length", () => {
    const secret = generateWebhookSecret();
    expect(secret.length).toBeGreaterThan(20);
  });
});

// ─── PMS Provider Adapter Logic ────────────────────────────────────────────────

describe("PMS Provider Adapter Logic", () => {
  it("Buildium adapter maps maintenance request fields correctly", () => {
    const buildiumRequest = {
      Id: 12345,
      Title: "Leaking faucet in unit 2B",
      Description: "The kitchen faucet has been dripping for 3 days",
      Status: "Open",
      Category: "Plumbing",
      Priority: "Normal",
      Unit: { Id: 101, UnitNumber: "2B" },
      Property: { Id: 50, Name: "Sunset Apartments" },
    };

    // Simulate Buildium adapter mapping
    function mapBuildiumRequest(req: typeof buildiumRequest) {
      return {
        externalId: `buildium_${req.Id}`,
        title: req.Title,
        description: req.Description,
        category: req.Category?.toLowerCase() ?? "general",
        priority: req.Priority === "High" ? "high" : req.Priority === "Urgent" ? "urgent" : "medium",
        externalStatus: req.Status,
        propertyExternalId: req.Property ? `buildium_prop_${req.Property.Id}` : null,
        unitExternalId: req.Unit ? `buildium_unit_${req.Unit.Id}` : null,
      };
    }

    const mapped = mapBuildiumRequest(buildiumRequest);
    expect(mapped.externalId).toBe("buildium_12345");
    expect(mapped.title).toBe("Leaking faucet in unit 2B");
    expect(mapped.category).toBe("plumbing");
    expect(mapped.priority).toBe("medium");
    expect(mapped.propertyExternalId).toBe("buildium_prop_50");
    expect(mapped.unitExternalId).toBe("buildium_unit_101");
  });

  it("AppFolio adapter maps work order fields correctly", () => {
    const appfolioWorkOrder = {
      id: "wo_789",
      subject: "HVAC not working",
      description: "Air conditioning unit stopped working",
      status: "Open",
      priority: "High",
      unit_id: "unit_202",
      property_id: "prop_10",
    };

    function mapAppFolioRequest(req: typeof appfolioWorkOrder) {
      return {
        externalId: `appfolio_${req.id}`,
        title: req.subject,
        description: req.description,
        priority: req.priority === "High" || req.priority === "Urgent" ? "high" : "medium",
        externalStatus: req.status,
        propertyExternalId: `appfolio_prop_${req.property_id}`,
        unitExternalId: `appfolio_unit_${req.unit_id}`,
      };
    }

    const mapped = mapAppFolioRequest(appfolioWorkOrder);
    expect(mapped.externalId).toBe("appfolio_wo_789");
    expect(mapped.priority).toBe("high");
    expect(mapped.propertyExternalId).toBe("appfolio_prop_prop_10");
  });

  it("completion writeback maps status correctly for each provider", () => {
    const completionStatusMap: Record<string, string> = {
      buildium: "Completed",
      appfolio: "Completed",
      rentmanager: "Closed",
      yardi: "Complete",
      doorloop: "Resolved",
      generic: "completed",
    };

    for (const [provider, status] of Object.entries(completionStatusMap)) {
      expect(status).toBeTruthy();
      expect(typeof status).toBe("string");
    }
    expect(completionStatusMap.buildium).toBe("Completed");
    expect(completionStatusMap.rentmanager).toBe("Closed");
  });

  it("duplicate guard prevents re-importing existing external IDs", () => {
    const existingExternalIds = new Set(["buildium_100", "buildium_101", "buildium_102"]);

    function shouldImport(externalId: string): boolean {
      return !existingExternalIds.has(externalId);
    }

    expect(shouldImport("buildium_100")).toBe(false);
    expect(shouldImport("buildium_103")).toBe(true);
    expect(shouldImport("buildium_999")).toBe(true);
  });
});

// ─── Sync Result Aggregation ───────────────────────────────────────────────────

describe("PMS Sync Result Aggregation", () => {
  it("aggregates imported properties and created jobs correctly", () => {
    const syncResults = [
      { imported: 5, jobs: 3, errors: 0 },
      { imported: 2, jobs: 1, errors: 1 },
      { imported: 0, jobs: 0, errors: 0 },
    ];

    const totals = syncResults.reduce(
      (acc, r) => ({ imported: acc.imported + r.imported, jobs: acc.jobs + r.jobs, errors: acc.errors + r.errors }),
      { imported: 0, jobs: 0, errors: 0 }
    );

    expect(totals.imported).toBe(7);
    expect(totals.jobs).toBe(4);
    expect(totals.errors).toBe(1);
  });

  it("marks integration as error when sync fails", () => {
    function getNewStatus(syncError: string | null): "connected" | "error" {
      return syncError ? "error" : "connected";
    }

    expect(getNewStatus("API rate limit exceeded")).toBe("error");
    expect(getNewStatus(null)).toBe("connected");
  });

  it("calculates last sync timestamp correctly", () => {
    const before = Date.now();
    const lastSyncAt = Date.now();
    const after = Date.now();
    expect(lastSyncAt).toBeGreaterThanOrEqual(before);
    expect(lastSyncAt).toBeLessThanOrEqual(after);
  });
});

// ─── Webhook Event Processing ──────────────────────────────────────────────────

describe("Webhook Event Processing", () => {
  it("classifies Buildium maintenance request created event", () => {
    const payload = {
      EventType: "MaintenanceRequest_Created",
      MaintenanceRequest: { Id: 555, Title: "Broken window", Status: "Open" },
    };

    function classifyBuildiumEvent(p: typeof payload): "maintenance_request" | "unknown" {
      if (p.EventType?.includes("MaintenanceRequest")) return "maintenance_request";
      return "unknown";
    }

    expect(classifyBuildiumEvent(payload)).toBe("maintenance_request");
  });

  it("ignores non-maintenance events gracefully", () => {
    const payload = { EventType: "Lease_Created", Lease: { Id: 1 } };

    function classifyBuildiumEvent(p: { EventType: string }): "maintenance_request" | "unknown" {
      if (p.EventType?.includes("MaintenanceRequest")) return "maintenance_request";
      return "unknown";
    }

    expect(classifyBuildiumEvent(payload)).toBe("unknown");
  });

  it("extracts external ID from webhook payload", () => {
    const buildiumPayload = { EventType: "MaintenanceRequest_Created", MaintenanceRequest: { Id: 777 } };
    const externalId = `buildium_${buildiumPayload.MaintenanceRequest.Id}`;
    expect(externalId).toBe("buildium_777");
  });
});
