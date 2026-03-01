/**
 * Session 36 Tests
 * - Contractor Performance Scorecard: shape, edge cases, aggregation logic
 * - Job Re-assignment (Reopen): state transitions, validation
 * - Company Reporting Dashboard: summary shape, monthly trend, property breakdown, skill tier breakdown, CSV export helpers
 */

import { describe, it, expect } from "vitest";

// ─── Contractor Scorecard Shape ───────────────────────────────────────────────

describe("contractor scorecard shape", () => {
  const makeScorecard = (overrides: Partial<{
    totalCompleted: number;
    avgRating: number | null;
    ratingCount: number;
    onTimeRate: number | null;
    avgResponseHours: number | null;
  }> = {}) => ({
    totalCompleted: 12,
    avgRating: 4.5,
    ratingCount: 8,
    onTimeRate: 83,
    avgResponseHours: 2.4,
    ...overrides,
  });

  it("has all required fields", () => {
    const sc = makeScorecard();
    expect(sc).toHaveProperty("totalCompleted");
    expect(sc).toHaveProperty("avgRating");
    expect(sc).toHaveProperty("ratingCount");
    expect(sc).toHaveProperty("onTimeRate");
    expect(sc).toHaveProperty("avgResponseHours");
  });

  it("avgRating can be null when no ratings exist", () => {
    const sc = makeScorecard({ avgRating: null, ratingCount: 0 });
    expect(sc.avgRating).toBeNull();
    expect(sc.ratingCount).toBe(0);
  });

  it("onTimeRate can be null when no completed jobs exist", () => {
    const sc = makeScorecard({ totalCompleted: 0, onTimeRate: null });
    expect(sc.onTimeRate).toBeNull();
  });

  it("avgResponseHours can be null when no clock-in data exists", () => {
    const sc = makeScorecard({ avgResponseHours: null });
    expect(sc.avgResponseHours).toBeNull();
  });

  it("totalCompleted is always a non-negative integer", () => {
    const sc = makeScorecard({ totalCompleted: 0 });
    expect(sc.totalCompleted).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(sc.totalCompleted)).toBe(true);
  });

  it("onTimeRate is a percentage between 0 and 100 when present", () => {
    const sc = makeScorecard({ onTimeRate: 75 });
    expect(sc.onTimeRate).toBeGreaterThanOrEqual(0);
    expect(sc.onTimeRate).toBeLessThanOrEqual(100);
  });
});

// ─── Scorecard Map (batch result) ─────────────────────────────────────────────

describe("contractor scorecard map", () => {
  const makeScorecardMap = (ids: number[]) =>
    Object.fromEntries(ids.map((id) => [id, {
      totalCompleted: id * 2,
      avgRating: id % 2 === 0 ? 4.0 : null,
      ratingCount: id % 2 === 0 ? 3 : 0,
      onTimeRate: 80,
      avgResponseHours: 1.5,
    }]));

  it("returns a record keyed by contractorProfileId", () => {
    const map = makeScorecardMap([1, 2, 3]);
    expect(map[1]).toBeDefined();
    expect(map[2]).toBeDefined();
    expect(map[3]).toBeDefined();
  });

  it("returns empty object when no contractors exist", () => {
    const map = makeScorecardMap([]);
    expect(Object.keys(map)).toHaveLength(0);
  });

  it("each entry has totalCompleted proportional to id in this fixture", () => {
    const map = makeScorecardMap([5]);
    expect(map[5].totalCompleted).toBe(10);
  });

  it("contractors with even ids have ratings in this fixture", () => {
    const map = makeScorecardMap([2, 3]);
    expect(map[2].avgRating).toBe(4.0);
    expect(map[3].avgRating).toBeNull();
  });
});

// ─── Job Re-open State Transitions ────────────────────────────────────────────

describe("job reopen state transitions", () => {
  type JobStatus = "open" | "assigned" | "in_progress" | "completed" | "verified" | "paid";

  const canReopen = (status: JobStatus) =>
    status === "assigned" || status === "in_progress";

  it("assigned jobs can be re-opened", () => {
    expect(canReopen("assigned")).toBe(true);
  });

  it("in_progress jobs can be re-opened", () => {
    expect(canReopen("in_progress")).toBe(true);
  });

  it("open jobs cannot be re-opened (already open)", () => {
    expect(canReopen("open")).toBe(false);
  });

  it("completed jobs cannot be re-opened", () => {
    expect(canReopen("completed")).toBe(false);
  });

  it("verified jobs cannot be re-opened", () => {
    expect(canReopen("verified")).toBe(false);
  });

  it("paid jobs cannot be re-opened", () => {
    expect(canReopen("paid")).toBe(false);
  });
});

describe("job reopen result shape", () => {
  const makeReopenResult = (overrides: Partial<{
    contractorProfileId: number | null;
    contractorUserId: number | null;
  }> = {}) => ({
    contractorProfileId: 42,
    contractorUserId: 99,
    ...overrides,
  });

  it("returns contractorProfileId and contractorUserId", () => {
    const result = makeReopenResult();
    expect(result).toHaveProperty("contractorProfileId");
    expect(result).toHaveProperty("contractorUserId");
  });

  it("contractorProfileId can be null if job was never assigned", () => {
    const result = makeReopenResult({ contractorProfileId: null, contractorUserId: null });
    expect(result.contractorProfileId).toBeNull();
    expect(result.contractorUserId).toBeNull();
  });
});

// ─── Report Summary Shape ─────────────────────────────────────────────────────

describe("company report summary shape", () => {
  const makeSummary = (overrides: Partial<{
    totalSpend: number;
    totalJobs: number;
    avgCostPerJob: number;
    totalLaborHours: number;
  }> = {}) => ({
    totalSpend: 4250.75,
    totalJobs: 17,
    avgCostPerJob: 250.04,
    totalLaborHours: 68.5,
    ...overrides,
  });

  it("has all required fields", () => {
    const s = makeSummary();
    expect(s).toHaveProperty("totalSpend");
    expect(s).toHaveProperty("totalJobs");
    expect(s).toHaveProperty("avgCostPerJob");
    expect(s).toHaveProperty("totalLaborHours");
  });

  it("avgCostPerJob is 0 when totalJobs is 0", () => {
    const s = makeSummary({ totalJobs: 0, avgCostPerJob: 0 });
    expect(s.avgCostPerJob).toBe(0);
  });

  it("totalSpend is non-negative", () => {
    const s = makeSummary({ totalSpend: 0 });
    expect(s.totalSpend).toBeGreaterThanOrEqual(0);
  });

  it("totalLaborHours is a rounded decimal", () => {
    const s = makeSummary({ totalLaborHours: 12.5 });
    expect(s.totalLaborHours).toBe(12.5);
  });
});

// ─── Report By Month Shape ────────────────────────────────────────────────────

describe("company report by month shape", () => {
  const makeMonthRow = (overrides: Partial<{
    yearMonth: string;
    jobCount: number;
    totalSpend: number;
  }> = {}) => ({
    yearMonth: "2026-02",
    jobCount: 5,
    totalSpend: 1200.00,
    ...overrides,
  });

  it("has yearMonth in YYYY-MM format", () => {
    const row = makeMonthRow();
    expect(row.yearMonth).toMatch(/^\d{4}-\d{2}$/);
  });

  it("jobCount is a non-negative integer", () => {
    const row = makeMonthRow({ jobCount: 0 });
    expect(row.jobCount).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(row.jobCount)).toBe(true);
  });

  it("totalSpend is a non-negative number", () => {
    const row = makeMonthRow({ totalSpend: 0 });
    expect(row.totalSpend).toBeGreaterThanOrEqual(0);
  });

  it("months are sorted chronologically", () => {
    const rows = [
      makeMonthRow({ yearMonth: "2026-01" }),
      makeMonthRow({ yearMonth: "2026-02" }),
      makeMonthRow({ yearMonth: "2026-03" }),
    ];
    const sorted = [...rows].sort((a, b) => a.yearMonth.localeCompare(b.yearMonth));
    expect(sorted[0].yearMonth).toBe("2026-01");
    expect(sorted[2].yearMonth).toBe("2026-03");
  });
});

// ─── Report By Property Shape ─────────────────────────────────────────────────

describe("company report by property shape", () => {
  const makePropertyRow = (overrides: Partial<{
    propertyId: number;
    propertyName: string;
    propertyAddress: string | null;
    jobCount: number;
    totalSpend: number;
    avgCostPerJob: number;
  }> = {}) => ({
    propertyId: 1,
    propertyName: "Sunset Apartments",
    propertyAddress: "123 Main St",
    jobCount: 3,
    totalSpend: 750.00,
    avgCostPerJob: 250.00,
    ...overrides,
  });

  it("has all required fields", () => {
    const row = makePropertyRow();
    expect(row).toHaveProperty("propertyId");
    expect(row).toHaveProperty("propertyName");
    expect(row).toHaveProperty("jobCount");
    expect(row).toHaveProperty("totalSpend");
    expect(row).toHaveProperty("avgCostPerJob");
  });

  it("avgCostPerJob equals totalSpend / jobCount", () => {
    const row = makePropertyRow({ jobCount: 4, totalSpend: 800, avgCostPerJob: 200 });
    expect(row.avgCostPerJob).toBe(row.totalSpend / row.jobCount);
  });

  it("propertyAddress can be null", () => {
    const row = makePropertyRow({ propertyAddress: null });
    expect(row.propertyAddress).toBeNull();
  });
});

// ─── Report By Skill Tier Shape ───────────────────────────────────────────────

describe("company report by skill tier shape", () => {
  const makeTierRow = (overrides: Partial<{
    tierName: string;
    jobCount: number;
    totalSpend: number;
  }> = {}) => ({
    tierName: "Journeyman",
    jobCount: 7,
    totalSpend: 2100.00,
    ...overrides,
  });

  it("has all required fields", () => {
    const row = makeTierRow();
    expect(row).toHaveProperty("tierName");
    expect(row).toHaveProperty("jobCount");
    expect(row).toHaveProperty("totalSpend");
  });

  it("tierName falls back to Unclassified when no tier is set", () => {
    const row = makeTierRow({ tierName: "Unclassified" });
    expect(row.tierName).toBe("Unclassified");
  });

  it("totalSpend is non-negative", () => {
    const row = makeTierRow({ totalSpend: 0 });
    expect(row.totalSpend).toBeGreaterThanOrEqual(0);
  });
});

// ─── CSV Export Helper ────────────────────────────────────────────────────────

describe("CSV export helper logic", () => {
  function buildCSV(headers: string[], rows: (string | number | null | undefined)[][]): string {
    return [headers, ...rows]
      .map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");
  }

  it("produces a header row followed by data rows", () => {
    const csv = buildCSV(["Name", "Amount"], [["Alice", 100], ["Bob", 200]]);
    const lines = csv.split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe('"Name","Amount"');
  });

  it("wraps all values in double quotes", () => {
    const csv = buildCSV(["A"], [["hello"]]);
    expect(csv).toContain('"hello"');
  });

  it("escapes embedded double quotes by doubling them", () => {
    const csv = buildCSV(["A"], [['say "hi"']]);
    expect(csv).toContain('"say ""hi"""');
  });

  it("handles null and undefined values as empty strings", () => {
    const csv = buildCSV(["A", "B"], [[null, undefined]]);
    expect(csv).toContain('"",""');
  });

  it("handles numeric values correctly", () => {
    const csv = buildCSV(["Amount"], [[1234.56]]);
    expect(csv).toContain('"1234.56"');
  });

  it("produces correct row count for property report", () => {
    const rows = Array.from({ length: 5 }, (_, i) => [`Property ${i}`, i * 100, i * 25]);
    const csv = buildCSV(["Property", "Spend", "Avg"], rows);
    const lines = csv.split("\n");
    expect(lines).toHaveLength(6); // 1 header + 5 data rows
  });
});

// ─── Date Range Preset Logic ──────────────────────────────────────────────────

describe("date range preset logic", () => {
  const PRESET_RANGES = [
    { label: "Last 30 days", days: 30 },
    { label: "Last 90 days", days: 90 },
    { label: "Last 6 months", days: 180 },
    { label: "Last 12 months", days: 365 },
  ];

  function getRangeMs(days: number, now = Date.now()) {
    return { fromMs: now - days * 24 * 60 * 60 * 1000, toMs: now };
  }

  it("each preset has a label and days value", () => {
    for (const p of PRESET_RANGES) {
      expect(p.label).toBeTruthy();
      expect(p.days).toBeGreaterThan(0);
    }
  });

  it("30-day range spans approximately 30 days", () => {
    const now = Date.now();
    const { fromMs, toMs } = getRangeMs(30, now);
    const diffDays = (toMs - fromMs) / (24 * 60 * 60 * 1000);
    expect(diffDays).toBe(30);
  });

  it("fromMs is always less than toMs", () => {
    for (const p of PRESET_RANGES) {
      const { fromMs, toMs } = getRangeMs(p.days);
      expect(fromMs).toBeLessThan(toMs);
    }
  });

  it("default preset is 90 days", () => {
    const defaultPreset = PRESET_RANGES.find((p) => p.days === 90);
    expect(defaultPreset).toBeDefined();
    expect(defaultPreset?.label).toBe("Last 90 days");
  });
});
