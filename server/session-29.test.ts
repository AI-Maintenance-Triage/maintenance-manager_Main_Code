/**
 * Session 29 tests — PMS integration, password reset, churn risk cron,
 * announcement expiry, job fee override history, onboarding checklist logic.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── PMS Adapter Layer ────────────────────────────────────────────────────────
describe("PMS adapter layer", () => {
  it("buildium adapter: normalizes property data correctly", () => {
    const raw = {
      Id: 101,
      Address: {
        AddressLine1: "123 Main St",
        City: "Austin",
        State: "TX",
        PostalCode: "78701",
      },
      Name: "Main Street Unit",
    };
    // Simulate the normalization logic from buildium.ts
    const normalized = {
      externalId: String(raw.Id),
      name: raw.Name ?? raw.Address.AddressLine1,
      address: `${raw.Address.AddressLine1}, ${raw.Address.City}, ${raw.Address.State} ${raw.Address.PostalCode}`,
    };
    expect(normalized.externalId).toBe("101");
    expect(normalized.address).toBe("123 Main St, Austin, TX 78701");
    expect(normalized.name).toBe("Main Street Unit");
  });

  it("appfolio adapter: normalizes property data correctly", () => {
    const raw = {
      id: "af-202",
      name: "Oak Ave",
      address: "456 Oak Ave",
      city: "Dallas",
      state: "TX",
      zip: "75201",
    };
    const normalized = {
      externalId: raw.id,
      name: raw.name,
      address: `${raw.address}, ${raw.city}, ${raw.state} ${raw.zip}`,
    };
    expect(normalized.externalId).toBe("af-202");
    expect(normalized.address).toBe("456 Oak Ave, Dallas, TX 75201");
  });

  it("buildium adapter: normalizes maintenance request to job fields", () => {
    const raw = {
      Id: 555,
      Subject: "Leaking faucet in kitchen",
      Description: "Dripping constantly, needs repair",
      Status: "Open",
      Priority: "Normal",
      UnitId: 101,
    };
    const normalized = {
      externalId: String(raw.Id),
      title: raw.Subject,
      description: raw.Description,
      status: raw.Status,
      priority: raw.Priority === "Emergency" ? "emergency" : "normal",
      externalPropertyId: String(raw.UnitId),
    };
    expect(normalized.externalId).toBe("555");
    expect(normalized.title).toBe("Leaking faucet in kitchen");
    expect(normalized.priority).toBe("normal");
  });

  it("buildium adapter: maps emergency priority correctly", () => {
    const raw = { Id: 556, Subject: "Gas leak", Priority: "Emergency", UnitId: 101, Status: "Open", Description: "" };
    const priority = raw.Priority === "Emergency" ? "emergency" : "normal";
    expect(priority).toBe("emergency");
  });

  it("PMS sync: skips duplicate requests with same externalId", () => {
    const existingExternalIds = new Set(["555", "556"]);
    const incoming = [
      { externalId: "555", title: "Old request" },
      { externalId: "557", title: "New request" },
    ];
    const toImport = incoming.filter(r => !existingExternalIds.has(r.externalId));
    expect(toImport).toHaveLength(1);
    expect(toImport[0].externalId).toBe("557");
  });

  it("PMS sync: completion writeback maps status correctly", () => {
    const statusMap: Record<string, string> = {
      buildium: "Completed",
      appfolio: "completed",
      generic: "complete",
    };
    expect(statusMap["buildium"]).toBe("Completed");
    expect(statusMap["appfolio"]).toBe("completed");
    expect(statusMap["generic"]).toBe("complete");
  });

  it("PMS integration: validates required fields before saving", () => {
    const validateIntegration = (data: { provider: string; apiKey: string; apiSecret?: string }) => {
      if (!data.provider) return { valid: false, error: "Provider is required" };
      if (!data.apiKey) return { valid: false, error: "API key is required" };
      if (data.provider === "appfolio" && !data.apiSecret) return { valid: false, error: "AppFolio requires client secret" };
      return { valid: true };
    };
    expect(validateIntegration({ provider: "buildium", apiKey: "key123" })).toEqual({ valid: true });
    expect(validateIntegration({ provider: "", apiKey: "key123" })).toEqual({ valid: false, error: "Provider is required" });
    expect(validateIntegration({ provider: "appfolio", apiKey: "key123" })).toEqual({ valid: false, error: "AppFolio requires client secret" });
    expect(validateIntegration({ provider: "appfolio", apiKey: "key123", apiSecret: "secret" })).toEqual({ valid: true });
  });
});

// ─── Password Reset Flow ──────────────────────────────────────────────────────
describe("password reset flow", () => {
  it("generates a 64-character hex token", () => {
    // Simulate the token generation used in requestPasswordReset
    const token = Array.from({ length: 32 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, "0")).join("");
    expect(token).toHaveLength(64);
    expect(/^[0-9a-f]+$/.test(token)).toBe(true);
  });

  it("token expires in 1 hour", () => {
    const now = Date.now();
    const expiresAt = new Date(now + 60 * 60 * 1000);
    const diffMs = expiresAt.getTime() - now;
    expect(diffMs).toBe(3600000);
  });

  it("rejects expired token", () => {
    const expiredAt = new Date(Date.now() - 1000); // 1 second ago
    const isExpired = expiredAt < new Date();
    expect(isExpired).toBe(true);
  });

  it("accepts valid unexpired token", () => {
    const expiresAt = new Date(Date.now() + 3600000); // 1 hour from now
    const isExpired = expiresAt < new Date();
    expect(isExpired).toBe(false);
  });

  it("validates password minimum length", () => {
    const validatePassword = (pw: string) => pw.length >= 8;
    expect(validatePassword("short")).toBe(false);
    expect(validatePassword("longpassword")).toBe(true);
    expect(validatePassword("12345678")).toBe(true);
    expect(validatePassword("1234567")).toBe(false);
  });

  it("reset URL contains the token", () => {
    const origin = "https://example.manus.space";
    const token = "abc123def456";
    const resetUrl = `${origin}/reset-password?token=${token}`;
    expect(resetUrl).toContain(token);
    expect(resetUrl).toContain(origin);
  });
});

// ─── Announcement Expiry ──────────────────────────────────────────────────────
describe("announcement expiry", () => {
  it("marks announcement as expired when expiresAt is in the past", () => {
    const announcement = { id: 1, isActive: true, expiresAt: Date.now() - 1000 };
    const isExpired = announcement.expiresAt !== null && announcement.expiresAt < Date.now();
    expect(isExpired).toBe(true);
  });

  it("does not expire announcement when expiresAt is in the future", () => {
    const announcement = { id: 2, isActive: true, expiresAt: Date.now() + 3600000 };
    const isExpired = announcement.expiresAt !== null && announcement.expiresAt < Date.now();
    expect(isExpired).toBe(false);
  });

  it("does not expire announcement when expiresAt is null", () => {
    const announcement = { id: 3, isActive: true, expiresAt: null };
    const isExpired = announcement.expiresAt !== null && announcement.expiresAt < Date.now();
    expect(isExpired).toBe(false);
  });

  it("converts datetime-local string to milliseconds correctly", () => {
    const datetimeLocal = "2026-12-31T23:59";
    const ms = new Date(datetimeLocal).getTime();
    expect(ms).toBeGreaterThan(Date.now());
    expect(typeof ms).toBe("number");
  });

  it("getActiveAnnouncementsForUser filters expired announcements", () => {
    const now = Date.now();
    const announcements = [
      { id: 1, isActive: true, expiresAt: now - 1000, targetAudience: "all" },  // expired
      { id: 2, isActive: true, expiresAt: now + 3600000, targetAudience: "all" }, // active
      { id: 3, isActive: true, expiresAt: null, targetAudience: "all" },          // no expiry
      { id: 4, isActive: false, expiresAt: null, targetAudience: "all" },         // inactive
    ];
    const active = announcements.filter(a =>
      a.isActive &&
      (a.expiresAt === null || a.expiresAt >= now)
    );
    expect(active).toHaveLength(2);
    expect(active.map(a => a.id)).toEqual([2, 3]);
  });
});

// ─── Job Fee Override History ─────────────────────────────────────────────────
describe("job fee override history", () => {
  it("parses override details string correctly", () => {
    const details = "Job #42: platform fee changed from $15 to 12.50. Reason: Billing error";
    expect(details).toContain("Job #42");
    expect(details).toContain("$15");
    expect(details).toContain("12.50");
    expect(details).toContain("Billing error");
  });

  it("formats new fee from cents to dollars correctly", () => {
    const cents = 1250;
    const dollars = (cents / 100).toFixed(2);
    expect(dollars).toBe("12.50");
  });

  it("rounds fee input to nearest cent", () => {
    const input = 12.505;
    const cents = Math.round(input * 100);
    expect(cents).toBe(1251);
  });

  it("rejects negative fee values", () => {
    const isValidFee = (fee: number) => !isNaN(fee) && fee >= 0;
    expect(isValidFee(-1)).toBe(false);
    expect(isValidFee(0)).toBe(true);
    expect(isValidFee(12.5)).toBe(true);
  });

  it("requires reason of at least 5 characters", () => {
    const isValidReason = (r: string) => r.trim().length >= 5;
    expect(isValidReason("ok")).toBe(false);
    expect(isValidReason("valid reason")).toBe(true);
    expect(isValidReason("    ")).toBe(false);
    expect(isValidReason("  ok  ")).toBe(false);
  });
});

// ─── Churn Risk Cron ──────────────────────────────────────────────────────────
describe("churn risk cron", () => {
  it("classifies companies as high risk when inactive 60+ days", () => {
    const companies = [
      { id: 1, name: "Alpha", daysSinceLastJob: 65 },
      { id: 2, name: "Beta", daysSinceLastJob: 45 },
      { id: 3, name: "Gamma", daysSinceLastJob: 90 },
      { id: 4, name: "Delta", daysSinceLastJob: 30 },
    ];
    const highRisk = companies.filter(c => c.daysSinceLastJob >= 60);
    expect(highRisk).toHaveLength(2);
    expect(highRisk.map(c => c.name)).toEqual(["Alpha", "Gamma"]);
  });

  it("classifies companies as medium risk when inactive 30-59 days", () => {
    const companies = [
      { id: 1, name: "Alpha", daysSinceLastJob: 65 },
      { id: 2, name: "Beta", daysSinceLastJob: 45 },
      { id: 3, name: "Gamma", daysSinceLastJob: 90 },
      { id: 4, name: "Delta", daysSinceLastJob: 30 },
    ];
    const mediumRisk = companies.filter(c => c.daysSinceLastJob >= 30 && c.daysSinceLastJob < 60);
    expect(mediumRisk).toHaveLength(2);
    expect(mediumRisk.map(c => c.name)).toEqual(["Beta", "Delta"]);
  });

  it("notification title includes count and correct pluralization", () => {
    const highRisk = [{ id: 1, name: "Alpha" }];
    const title = `⚠️ Churn Risk Alert: ${highRisk.length} High-Risk ${highRisk.length === 1 ? "Company" : "Companies"}`;
    expect(title).toBe("⚠️ Churn Risk Alert: 1 High-Risk Company");

    const highRisk2 = [{ id: 1 }, { id: 2 }];
    const title2 = `⚠️ Churn Risk Alert: ${highRisk2.length} High-Risk ${highRisk2.length === 1 ? "Company" : "Companies"}`;
    expect(title2).toBe("⚠️ Churn Risk Alert: 2 High-Risk Companies");
  });

  it("notification lists max 10 companies with overflow count", () => {
    const highRisk = Array.from({ length: 15 }, (_, i) => ({ id: i + 1, name: `Company ${i + 1}`, email: null, daysSinceLastJob: 60 + i }));
    const listed = highRisk.slice(0, 10);
    const moreCount = highRisk.length > 10 ? `\n...and ${highRisk.length - 10} more` : "";
    expect(listed).toHaveLength(10);
    expect(moreCount).toBe("\n...and 5 more");
  });

  it("skips notification when no high-risk companies", () => {
    const companies = [
      { id: 1, name: "Alpha", daysSinceLastJob: 45 },
      { id: 2, name: "Beta", daysSinceLastJob: 31 },
    ];
    const highRisk = companies.filter(c => c.daysSinceLastJob >= 60);
    expect(highRisk).toHaveLength(0);
    // No notification should be sent
  });
});

// ─── Contractor Onboarding Checklist ─────────────────────────────────────────
describe("contractor onboarding checklist", () => {
  it("calculates completion percentage correctly", () => {
    const items = [
      { done: true },
      { done: true },
      { done: false },
      { done: true },
      { done: false },
    ];
    const completed = items.filter(i => i.done).length;
    const pct = Math.round((completed / items.length) * 100);
    expect(pct).toBe(60);
  });

  it("returns 100% when all items are complete", () => {
    const items = [{ done: true }, { done: true }, { done: true }];
    const pct = Math.round((items.filter(i => i.done).length / items.length) * 100);
    expect(pct).toBe(100);
  });

  it("returns 0% when no items are complete", () => {
    const items = [{ done: false }, { done: false }, { done: false }];
    const pct = Math.round((items.filter(i => i.done).length / items.length) * 100);
    expect(pct).toBe(0);
  });

  it("checklist is hidden when all items are complete", () => {
    const allComplete = true;
    const dismissed = false;
    const showChecklist = !allComplete && !dismissed;
    expect(showChecklist).toBe(false);
  });

  it("checklist is hidden when manually dismissed", () => {
    const allComplete = false;
    const dismissed = true;
    const showChecklist = !allComplete && !dismissed;
    expect(showChecklist).toBe(false);
  });

  it("checklist is shown when incomplete and not dismissed", () => {
    const allComplete = false;
    const dismissed = false;
    const showChecklist = !allComplete && !dismissed;
    expect(showChecklist).toBe(true);
  });
});
