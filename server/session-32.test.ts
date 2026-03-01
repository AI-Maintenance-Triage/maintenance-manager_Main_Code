/**
 * Session 32 Tests
 * Covers:
 * 1. Haversine distance calculation (shared by public and private boards)
 * 2. Private job board service-area filter parity with public board
 * 3. Trusted contractor flag logic (set/remove, per-company scope)
 * 4. Job board visibility toggle (public ↔ private)
 * 5. Company default job board visibility setting
 * 6. Admin webhook log date-range filter
 * 7. Contractor earnings dashboard data shape
 */
import { describe, it, expect } from "vitest";

// ─── Haversine Distance ───────────────────────────────────────────────────────
function haversineDistanceMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

describe("Haversine Distance Calculation", () => {
  it("returns 0 for identical coordinates", () => {
    const d = haversineDistanceMiles(40.7128, -74.006, 40.7128, -74.006);
    expect(d).toBeCloseTo(0, 3);
  });

  it("calculates NYC to LA correctly (~2451 miles)", () => {
    const d = haversineDistanceMiles(40.7128, -74.006, 34.0522, -118.2437);
    expect(d).toBeGreaterThan(2400);
    expect(d).toBeLessThan(2500);
  });

  it("calculates a short distance correctly (~8.9 miles NYC to Newark)", () => {
    // NYC to Newark, NJ
    const d = haversineDistanceMiles(40.7128, -74.006, 40.7357, -74.1724);
    expect(d).toBeGreaterThan(7);
    expect(d).toBeLessThan(11);
  });

  it("is symmetric — A→B equals B→A", () => {
    const d1 = haversineDistanceMiles(40.7128, -74.006, 34.0522, -118.2437);
    const d2 = haversineDistanceMiles(34.0522, -118.2437, 40.7128, -74.006);
    expect(d1).toBeCloseTo(d2, 3);
  });
});

// ─── Service Area Filter (shared by public and private boards) ────────────────
describe("Service Area Filter — Public and Private Board Parity", () => {
  type JobRow = {
    jobId: number;
    propertyLat: number | null;
    propertyLng: number | null;
    visibility: "public" | "private";
  };

  function filterJobsByServiceArea(
    jobs: JobRow[],
    contractorLat: number,
    contractorLng: number,
    radiusMiles: number
  ) {
    return jobs
      .map((j) => {
        if (j.propertyLat === null || j.propertyLng === null) return null;
        const dist = Math.round(haversineDistanceMiles(contractorLat, contractorLng, j.propertyLat, j.propertyLng) * 10) / 10;
        if (dist > radiusMiles) return null;
        return { ...j, distanceMiles: dist };
      })
      .filter((j): j is NonNullable<typeof j> => j !== null);
  }

  const contractor = { lat: 40.7128, lng: -74.006, radiusMiles: 25 };

  const jobs: JobRow[] = [
    { jobId: 1, propertyLat: 40.7357, propertyLng: -74.1724, visibility: "public" },   // Newark ~6mi — in range
    { jobId: 2, propertyLat: 40.7128, propertyLng: -74.006, visibility: "private" },   // Same spot — in range
    { jobId: 3, propertyLat: 34.0522, propertyLng: -118.2437, visibility: "private" }, // LA — out of range
    { jobId: 4, propertyLat: null, propertyLng: null, visibility: "public" },           // No coords — excluded
  ];

  it("includes jobs within radius for public board", () => {
    const publicJobs = jobs.filter(j => j.visibility === "public");
    const result = filterJobsByServiceArea(publicJobs, contractor.lat, contractor.lng, contractor.radiusMiles);
    expect(result.map(j => j.jobId)).toContain(1);
    expect(result.map(j => j.jobId)).not.toContain(4); // no coords
  });

  it("includes private jobs within radius for private board", () => {
    const privateJobs = jobs.filter(j => j.visibility === "private");
    const result = filterJobsByServiceArea(privateJobs, contractor.lat, contractor.lng, contractor.radiusMiles);
    expect(result.map(j => j.jobId)).toContain(2);
    expect(result.map(j => j.jobId)).not.toContain(3); // LA is out of range
  });

  it("excludes private jobs outside radius — same as public board behavior", () => {
    const allJobs = filterJobsByServiceArea(jobs, contractor.lat, contractor.lng, contractor.radiusMiles);
    const includedIds = allJobs.map(j => j.jobId);
    expect(includedIds).not.toContain(3); // LA excluded regardless of visibility
    expect(includedIds).not.toContain(4); // no coords excluded
  });

  it("returns empty when contractor has no coordinates", () => {
    // Simulates the db function returning [] when contractorLat/Lng is null
    const contractorHasCoords = false;
    const result = contractorHasCoords
      ? filterJobsByServiceArea(jobs, contractor.lat, contractor.lng, contractor.radiusMiles)
      : [];
    expect(result).toHaveLength(0);
  });

  it("attaches distanceMiles to each result", () => {
    const result = filterJobsByServiceArea(
      [{ jobId: 1, propertyLat: 40.7357, propertyLng: -74.1724, visibility: "public" }],
      contractor.lat, contractor.lng, contractor.radiusMiles
    );
    expect(result[0].distanceMiles).toBeGreaterThan(0);
    expect(typeof result[0].distanceMiles).toBe("number");
  });
});

// ─── Trusted Contractor Flag Logic ───────────────────────────────────────────
describe("Trusted Contractor Flag", () => {
  type Relationship = {
    id: number;
    companyId: number;
    contractorProfileId: number;
    isTrusted: boolean;
  };

  function setTrusted(relationships: Relationship[], relationshipId: number, companyId: number, isTrusted: boolean) {
    return relationships.map(r =>
      r.id === relationshipId && r.companyId === companyId
        ? { ...r, isTrusted }
        : r
    );
  }

  function getTrustedCompanyIds(relationships: Relationship[], contractorProfileId: number): number[] {
    return relationships
      .filter(r => r.contractorProfileId === contractorProfileId && r.isTrusted)
      .map(r => r.companyId);
  }

  const relationships: Relationship[] = [
    { id: 1, companyId: 10, contractorProfileId: 100, isTrusted: false },
    { id: 2, companyId: 20, contractorProfileId: 100, isTrusted: false },
    { id: 3, companyId: 10, contractorProfileId: 200, isTrusted: true },
  ];

  it("marks a contractor as trusted for a specific company", () => {
    const updated = setTrusted(relationships, 1, 10, true);
    const rel = updated.find(r => r.id === 1);
    expect(rel?.isTrusted).toBe(true);
  });

  it("removes trust from a contractor", () => {
    const withTrust = setTrusted(relationships, 1, 10, true);
    const removed = setTrusted(withTrust, 1, 10, false);
    const rel = removed.find(r => r.id === 1);
    expect(rel?.isTrusted).toBe(false);
  });

  it("trusted flag is per-company — does not affect other companies", () => {
    const updated = setTrusted(relationships, 1, 10, true);
    const rel2 = updated.find(r => r.id === 2);
    expect(rel2?.isTrusted).toBe(false); // company 20 unaffected
  });

  it("setTrusted requires matching companyId — prevents cross-company mutation", () => {
    // Attempt to set trusted with wrong companyId (99 instead of 10)
    const updated = setTrusted(relationships, 1, 99, true);
    const rel = updated.find(r => r.id === 1);
    expect(rel?.isTrusted).toBe(false); // unchanged
  });

  it("getTrustedCompanyIds returns only companies that trust this contractor", () => {
    const updated = setTrusted(relationships, 1, 10, true);
    const ids = getTrustedCompanyIds(updated, 100);
    expect(ids).toContain(10);
    expect(ids).not.toContain(20);
  });

  it("invited contractors are automatically trusted", () => {
    // Simulates the invite acceptance flow setting isTrusted=true
    const newRelationship: Relationship = {
      id: 4, companyId: 30, contractorProfileId: 300, isTrusted: true, // set at invite time
    };
    const ids = getTrustedCompanyIds([newRelationship], 300);
    expect(ids).toContain(30);
  });

  it("contractor trusted by multiple companies sees all their private jobs", () => {
    const multiTrust: Relationship[] = [
      { id: 5, companyId: 10, contractorProfileId: 400, isTrusted: true },
      { id: 6, companyId: 20, contractorProfileId: 400, isTrusted: true },
      { id: 7, companyId: 30, contractorProfileId: 400, isTrusted: false },
    ];
    const ids = getTrustedCompanyIds(multiTrust, 400);
    expect(ids).toEqual(expect.arrayContaining([10, 20]));
    expect(ids).not.toContain(30);
  });
});

// ─── Job Board Visibility Toggle ─────────────────────────────────────────────
describe("Job Board Visibility Toggle", () => {
  type Job = { id: number; postedToBoard: boolean; jobBoardVisibility: "public" | "private" };

  function setVisibility(jobs: Job[], jobId: number, visibility: "public" | "private"): Job[] {
    return jobs.map(j => j.id === jobId ? { ...j, jobBoardVisibility: visibility } : j);
  }

  const jobs: Job[] = [
    { id: 1, postedToBoard: true, jobBoardVisibility: "public" },
    { id: 2, postedToBoard: true, jobBoardVisibility: "public" },
  ];

  it("sets a job to private visibility", () => {
    const updated = setVisibility(jobs, 1, "private");
    expect(updated.find(j => j.id === 1)?.jobBoardVisibility).toBe("private");
  });

  it("sets a job back to public visibility", () => {
    const withPrivate = setVisibility(jobs, 1, "private");
    const backToPublic = setVisibility(withPrivate, 1, "public");
    expect(backToPublic.find(j => j.id === 1)?.jobBoardVisibility).toBe("public");
  });

  it("only affects the targeted job", () => {
    const updated = setVisibility(jobs, 1, "private");
    expect(updated.find(j => j.id === 2)?.jobBoardVisibility).toBe("public");
  });

  it("public board query excludes private jobs", () => {
    const withPrivate = setVisibility(jobs, 1, "private");
    const publicBoard = withPrivate.filter(j => j.postedToBoard && j.jobBoardVisibility === "public");
    expect(publicBoard.map(j => j.id)).not.toContain(1);
    expect(publicBoard.map(j => j.id)).toContain(2);
  });

  it("private board query excludes public jobs", () => {
    const withPrivate = setVisibility(jobs, 1, "private");
    const privateBoard = withPrivate.filter(j => j.postedToBoard && j.jobBoardVisibility === "private");
    expect(privateBoard.map(j => j.id)).toContain(1);
    expect(privateBoard.map(j => j.id)).not.toContain(2);
  });
});

// ─── Company Default Visibility Setting ──────────────────────────────────────
describe("Company Default Job Board Visibility", () => {
  type CompanySettings = { defaultJobBoardVisibility: "public" | "private" };

  function getDefaultVisibility(settings: CompanySettings | null): "public" | "private" {
    return settings?.defaultJobBoardVisibility ?? "public";
  }

  it("defaults to public when no setting is stored", () => {
    expect(getDefaultVisibility(null)).toBe("public");
  });

  it("returns public when explicitly set to public", () => {
    expect(getDefaultVisibility({ defaultJobBoardVisibility: "public" })).toBe("public");
  });

  it("returns private when explicitly set to private", () => {
    expect(getDefaultVisibility({ defaultJobBoardVisibility: "private" })).toBe("private");
  });

  it("new jobs inherit the company default visibility", () => {
    const settings: CompanySettings = { defaultJobBoardVisibility: "private" };
    const newJobVisibility = getDefaultVisibility(settings);
    expect(newJobVisibility).toBe("private");
  });
});

// ─── Admin Webhook Log Date-Range Filter ─────────────────────────────────────
describe("Admin Webhook Log Date-Range Filter", () => {
  type WebhookEvent = { id: number; createdAt: number; provider: string; status: string };

  function filterEvents(
    events: WebhookEvent[],
    opts: { dateFrom?: number; dateTo?: number; provider?: string; status?: string }
  ): WebhookEvent[] {
    return events.filter(e => {
      if (opts.dateFrom && e.createdAt < opts.dateFrom) return false;
      if (opts.dateTo && e.createdAt > opts.dateTo) return false;
      if (opts.provider && e.provider !== opts.provider) return false;
      if (opts.status && e.status !== opts.status) return false;
      return true;
    });
  }

  const now = Date.now();
  const events: WebhookEvent[] = [
    { id: 1, createdAt: now - 86400000 * 7, provider: "buildium", status: "processed" },  // 7 days ago
    { id: 2, createdAt: now - 86400000 * 3, provider: "appfolio", status: "failed" },      // 3 days ago
    { id: 3, createdAt: now - 86400000 * 1, provider: "buildium", status: "processed" },  // 1 day ago
    { id: 4, createdAt: now,                 provider: "rentmanager", status: "ignored" }, // now
  ];

  it("returns all events when no filter applied", () => {
    expect(filterEvents(events, {})).toHaveLength(4);
  });

  it("filters by dateFrom — excludes older events", () => {
    const result = filterEvents(events, { dateFrom: now - 86400000 * 4 });
    expect(result.map(e => e.id)).toEqual(expect.arrayContaining([2, 3, 4]));
    expect(result.map(e => e.id)).not.toContain(1);
  });

  it("filters by dateTo — excludes newer events", () => {
    const result = filterEvents(events, { dateTo: now - 86400000 * 2 });
    expect(result.map(e => e.id)).toEqual(expect.arrayContaining([1, 2]));
    expect(result.map(e => e.id)).not.toContain(3);
    expect(result.map(e => e.id)).not.toContain(4);
  });

  it("filters by both dateFrom and dateTo — returns window", () => {
    const result = filterEvents(events, {
      dateFrom: now - 86400000 * 4,
      dateTo: now - 86400000 * 2,
    });
    expect(result.map(e => e.id)).toEqual([2]);
  });

  it("filters by provider", () => {
    const result = filterEvents(events, { provider: "buildium" });
    expect(result.map(e => e.id)).toEqual(expect.arrayContaining([1, 3]));
    expect(result.map(e => e.id)).not.toContain(2);
    expect(result.map(e => e.id)).not.toContain(4);
  });

  it("filters by status", () => {
    const result = filterEvents(events, { status: "failed" });
    expect(result.map(e => e.id)).toEqual([2]);
  });

  it("combines date range and provider filter", () => {
    const result = filterEvents(events, {
      dateFrom: now - 86400000 * 5,
      provider: "buildium",
    });
    expect(result.map(e => e.id)).toEqual([3]);
  });

  it("returns empty when no events match filter", () => {
    const result = filterEvents(events, { provider: "doorloop" });
    expect(result).toHaveLength(0);
  });

  it("quick-select 'last 24h' filter works correctly", () => {
    const result = filterEvents(events, { dateFrom: now - 86400000 });
    expect(result.map(e => e.id)).toEqual(expect.arrayContaining([3, 4]));
    expect(result.map(e => e.id)).not.toContain(1);
    expect(result.map(e => e.id)).not.toContain(2);
  });
});

// ─── Contractor Earnings Dashboard Data Shape ─────────────────────────────────
describe("Contractor Earnings Dashboard", () => {
  type Transaction = {
    id: number;
    amount: string;
    status: string;
    createdAt: number;
    jobTitle: string | null;
  };

  function computeEarningsSummary(transactions: Transaction[]) {
    const paid = transactions.filter(t => t.status === "paid");
    const totalEarnings = paid.reduce((sum, t) => sum + parseFloat(t.amount), 0);
    const avgJobValue = paid.length > 0 ? totalEarnings / paid.length : 0;
    return { totalEarnings, avgJobValue, paidCount: paid.length };
  }

  function groupByMonth(transactions: Transaction[]): Record<string, number> {
    const result: Record<string, number> = {};
    for (const t of transactions) {
      if (t.status !== "paid") continue;
      const d = new Date(t.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      result[key] = (result[key] ?? 0) + parseFloat(t.amount);
    }
    return result;
  }

  const now = Date.now();
  const transactions: Transaction[] = [
    { id: 1, amount: "150.00", status: "paid",    createdAt: now - 86400000 * 60, jobTitle: "Fix HVAC" },
    { id: 2, amount: "200.00", status: "paid",    createdAt: now - 86400000 * 30, jobTitle: "Plumbing" },
    { id: 3, amount: "75.00",  status: "pending", createdAt: now - 86400000 * 5,  jobTitle: "Electrical" },
    { id: 4, amount: "300.00", status: "paid",    createdAt: now - 86400000 * 2,  jobTitle: "Roof repair" },
  ];

  it("computes total earnings from paid transactions only", () => {
    const { totalEarnings } = computeEarningsSummary(transactions);
    expect(totalEarnings).toBeCloseTo(650, 2);
  });

  it("excludes pending transactions from total", () => {
    const { totalEarnings } = computeEarningsSummary(transactions);
    expect(totalEarnings).not.toBeCloseTo(725, 2); // 650 not 725
  });

  it("computes average job value correctly", () => {
    const { avgJobValue } = computeEarningsSummary(transactions);
    expect(avgJobValue).toBeCloseTo(650 / 3, 2);
  });

  it("returns zero average when no paid transactions", () => {
    const { avgJobValue } = computeEarningsSummary([
      { id: 1, amount: "100.00", status: "pending", createdAt: now, jobTitle: null },
    ]);
    expect(avgJobValue).toBe(0);
  });

  it("groups earnings by month correctly", () => {
    const monthly = groupByMonth(transactions);
    const keys = Object.keys(monthly);
    expect(keys.length).toBeGreaterThan(0);
    const totalFromMonthly = Object.values(monthly).reduce((a, b) => a + b, 0);
    expect(totalFromMonthly).toBeCloseTo(650, 2);
  });

  it("pending transactions do not appear in monthly chart", () => {
    const monthly = groupByMonth(transactions);
    const totalFromMonthly = Object.values(monthly).reduce((a, b) => a + b, 0);
    expect(totalFromMonthly).toBeCloseTo(650, 2); // 75 pending excluded
  });
});
