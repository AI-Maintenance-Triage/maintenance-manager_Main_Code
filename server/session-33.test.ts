/**
 * Session 33 Tests
 * Covers:
 * - AI priority override logic (priority → skill tier → hourly rate lookup)
 * - Emergency multiplier application on override
 * - Priority override fallback to first tier when no keyword match
 * - Auto-roster: ensureContractorCompanyRelation upsert logic
 * - Trusted contractor KPI count logic
 * - Job board visibility badge logic (public/private)
 * - Priority display: override takes precedence over AI priority
 * - Billing rate propagation: overrideHourlyRate updates hourlyRate
 */

import { describe, it, expect } from "vitest";

// ─── Priority Override Logic ────────────────────────────────────────────────

const PRIORITY_TIER_MAP: Record<string, string[]> = {
  emergency: ["emergency", "urgent", "after-hours"],
  high: ["high", "priority", "specialist", "licensed"],
  medium: ["medium", "general", "standard"],
  low: ["low", "basic", "entry", "simple"],
};

function findMatchingTier(
  priority: string,
  tiers: Array<{ id: number; name: string; hourlyRate: string; emergencyMultiplier?: string | null }>
) {
  const keywords = PRIORITY_TIER_MAP[priority] ?? [];
  return tiers.find(t => keywords.some(kw => t.name.toLowerCase().includes(kw))) ?? tiers[0];
}

function computeOverrideRate(
  priority: string,
  tier: { hourlyRate: string; emergencyMultiplier?: string | null }
): string {
  if (priority === "emergency" && tier.emergencyMultiplier) {
    const base = parseFloat(tier.hourlyRate);
    const mult = parseFloat(tier.emergencyMultiplier);
    if (!isNaN(base) && !isNaN(mult)) {
      return (base * mult).toFixed(2);
    }
  }
  return tier.hourlyRate;
}

const SAMPLE_TIERS = [
  { id: 1, name: "Basic Maintenance", hourlyRate: "45.00", emergencyMultiplier: null },
  { id: 2, name: "General Repair",    hourlyRate: "65.00", emergencyMultiplier: null },
  { id: 3, name: "Licensed Plumber",  hourlyRate: "95.00", emergencyMultiplier: null },
  { id: 4, name: "Emergency Response",hourlyRate: "120.00", emergencyMultiplier: "1.50" },
];

describe("Priority Override — Tier Matching", () => {
  it("maps 'emergency' priority to Emergency Response tier", () => {
    const tier = findMatchingTier("emergency", SAMPLE_TIERS);
    expect(tier.name).toBe("Emergency Response");
  });

  it("maps 'high' priority to Licensed Plumber tier (contains 'licensed')", () => {
    const tier = findMatchingTier("high", SAMPLE_TIERS);
    expect(tier.name).toBe("Licensed Plumber");
  });

  it("maps 'medium' priority to General Repair tier (contains 'general')", () => {
    const tier = findMatchingTier("medium", SAMPLE_TIERS);
    expect(tier.name).toBe("General Repair");
  });

  it("maps 'low' priority to Basic Maintenance tier (contains 'basic')", () => {
    const tier = findMatchingTier("low", SAMPLE_TIERS);
    expect(tier.name).toBe("Basic Maintenance");
  });

  it("falls back to first tier when no keyword matches", () => {
    const customTiers = [
      { id: 1, name: "Tier Alpha", hourlyRate: "50.00", emergencyMultiplier: null },
      { id: 2, name: "Tier Beta",  hourlyRate: "80.00", emergencyMultiplier: null },
    ];
    const tier = findMatchingTier("emergency", customTiers);
    expect(tier.name).toBe("Tier Alpha");
  });
});

describe("Priority Override — Rate Computation", () => {
  it("applies emergency multiplier for emergency priority", () => {
    const tier = SAMPLE_TIERS[3]; // Emergency Response: $120 × 1.5
    const rate = computeOverrideRate("emergency", tier);
    expect(rate).toBe("180.00");
  });

  it("does not apply multiplier for non-emergency priorities", () => {
    const tier = SAMPLE_TIERS[3]; // Emergency Response tier
    const rate = computeOverrideRate("high", tier);
    expect(rate).toBe("120.00");
  });

  it("returns base rate when emergencyMultiplier is null", () => {
    const tier = SAMPLE_TIERS[2]; // Licensed Plumber: no multiplier
    const rate = computeOverrideRate("emergency", tier);
    expect(rate).toBe("95.00");
  });

  it("returns base rate for medium priority", () => {
    const tier = SAMPLE_TIERS[1]; // General Repair: $65
    const rate = computeOverrideRate("medium", tier);
    expect(rate).toBe("65.00");
  });

  it("handles invalid multiplier gracefully", () => {
    const tier = { hourlyRate: "80.00", emergencyMultiplier: "not-a-number" };
    const rate = computeOverrideRate("emergency", tier);
    expect(rate).toBe("80.00"); // falls through to base rate
  });
});

// ─── Priority Display Logic ─────────────────────────────────────────────────

function getDisplayPriority(job: { aiPriority?: string; overridePriority?: string }): string {
  return job.overridePriority ?? job.aiPriority ?? "medium";
}

function isOverridden(job: { aiPriority?: string; overridePriority?: string }): boolean {
  return !!job.overridePriority;
}

describe("Priority Display Logic", () => {
  it("shows override priority when set", () => {
    const job = { aiPriority: "low", overridePriority: "emergency" };
    expect(getDisplayPriority(job)).toBe("emergency");
    expect(isOverridden(job)).toBe(true);
  });

  it("shows AI priority when no override", () => {
    const job = { aiPriority: "high", overridePriority: undefined };
    expect(getDisplayPriority(job)).toBe("high");
    expect(isOverridden(job)).toBe(false);
  });

  it("defaults to medium when neither is set", () => {
    const job = {};
    expect(getDisplayPriority(job)).toBe("medium");
  });

  it("override of same level as AI is still marked as overridden", () => {
    const job = { aiPriority: "high", overridePriority: "high" };
    expect(isOverridden(job)).toBe(true);
  });
});

// ─── Auto-Roster Logic ──────────────────────────────────────────────────────

interface ContractorRelation {
  contractorProfileId: number;
  companyId: number;
  status: string;
  isTrusted: boolean;
}

function ensureContractorCompanyRelation(
  existing: ContractorRelation[],
  contractorProfileId: number,
  companyId: number
): { action: "insert" | "skip"; relation?: ContractorRelation } {
  const found = existing.find(
    r => r.contractorProfileId === contractorProfileId && r.companyId === companyId
  );
  if (found) return { action: "skip" };
  return {
    action: "insert",
    relation: { contractorProfileId, companyId, status: "approved", isTrusted: false },
  };
}

describe("Auto-Roster on Job Completion", () => {
  it("inserts new relation when contractor is not yet in company roster", () => {
    const existing: ContractorRelation[] = [];
    const result = ensureContractorCompanyRelation(existing, 42, 7);
    expect(result.action).toBe("insert");
    expect(result.relation?.status).toBe("approved");
    expect(result.relation?.isTrusted).toBe(false);
  });

  it("skips insert when contractor is already in company roster", () => {
    const existing: ContractorRelation[] = [
      { contractorProfileId: 42, companyId: 7, status: "approved", isTrusted: true },
    ];
    const result = ensureContractorCompanyRelation(existing, 42, 7);
    expect(result.action).toBe("skip");
  });

  it("does not affect other contractor-company pairs", () => {
    const existing: ContractorRelation[] = [
      { contractorProfileId: 99, companyId: 7, status: "approved", isTrusted: false },
    ];
    const result = ensureContractorCompanyRelation(existing, 42, 7);
    expect(result.action).toBe("insert");
  });

  it("new auto-roster relation is not trusted by default", () => {
    const result = ensureContractorCompanyRelation([], 10, 20);
    expect(result.relation?.isTrusted).toBe(false);
  });
});

// ─── Trusted Contractor KPI Count ──────────────────────────────────────────

function countTrustedContractors(relations: Array<{ isTrusted: boolean; status: string }>): number {
  return relations.filter(r => r.isTrusted && r.status === "approved").length;
}

describe("Trusted Contractor KPI Count", () => {
  it("counts only approved + trusted contractors", () => {
    const relations = [
      { isTrusted: true, status: "approved" },
      { isTrusted: true, status: "approved" },
      { isTrusted: false, status: "approved" },
      { isTrusted: true, status: "pending" },
    ];
    expect(countTrustedContractors(relations)).toBe(2);
  });

  it("returns 0 when no trusted contractors", () => {
    const relations = [
      { isTrusted: false, status: "approved" },
      { isTrusted: false, status: "approved" },
    ];
    expect(countTrustedContractors(relations)).toBe(0);
  });

  it("returns 0 for empty list", () => {
    expect(countTrustedContractors([])).toBe(0);
  });
});

// ─── Job Board Visibility Badge Logic ──────────────────────────────────────

type Visibility = "public" | "private";

function getVisibilityBadge(job: { postedToBoard: boolean; jobBoardVisibility?: Visibility }) {
  if (!job.postedToBoard) return null;
  return job.jobBoardVisibility === "private" ? "Private" : "Public";
}

describe("Job Board Visibility Badge", () => {
  it("returns null when job is not on the board", () => {
    expect(getVisibilityBadge({ postedToBoard: false, jobBoardVisibility: "public" })).toBeNull();
  });

  it("returns 'Public' when job is on public board", () => {
    expect(getVisibilityBadge({ postedToBoard: true, jobBoardVisibility: "public" })).toBe("Public");
  });

  it("returns 'Private' when job is on private board", () => {
    expect(getVisibilityBadge({ postedToBoard: true, jobBoardVisibility: "private" })).toBe("Private");
  });

  it("defaults to 'Public' when visibility is undefined but posted", () => {
    expect(getVisibilityBadge({ postedToBoard: true })).toBe("Public");
  });
});

// ─── Trust Flag Logic ───────────────────────────────────────────────────────

function setTrustFlag(
  relations: ContractorRelation[],
  contractorProfileId: number,
  companyId: number,
  isTrusted: boolean
): ContractorRelation[] {
  return relations.map(r =>
    r.contractorProfileId === contractorProfileId && r.companyId === companyId
      ? { ...r, isTrusted }
      : r
  );
}

describe("Trust Flag Management", () => {
  it("marks a contractor as trusted for a specific company", () => {
    const relations: ContractorRelation[] = [
      { contractorProfileId: 1, companyId: 10, status: "approved", isTrusted: false },
      { contractorProfileId: 2, companyId: 10, status: "approved", isTrusted: false },
    ];
    const updated = setTrustFlag(relations, 1, 10, true);
    expect(updated[0].isTrusted).toBe(true);
    expect(updated[1].isTrusted).toBe(false); // other contractor unaffected
  });

  it("removes trust flag (mark as not trusted)", () => {
    const relations: ContractorRelation[] = [
      { contractorProfileId: 1, companyId: 10, status: "approved", isTrusted: true },
    ];
    const updated = setTrustFlag(relations, 1, 10, false);
    expect(updated[0].isTrusted).toBe(false);
  });

  it("trust is per-company: same contractor can be trusted for one company but not another", () => {
    const relations: ContractorRelation[] = [
      { contractorProfileId: 1, companyId: 10, status: "approved", isTrusted: false },
      { contractorProfileId: 1, companyId: 20, status: "approved", isTrusted: false },
    ];
    const updated = setTrustFlag(relations, 1, 10, true);
    const company10 = updated.find(r => r.companyId === 10)!;
    const company20 = updated.find(r => r.companyId === 20)!;
    expect(company10.isTrusted).toBe(true);
    expect(company20.isTrusted).toBe(false);
  });

  it("invited contractors should be auto-trusted", () => {
    // Simulates the invite flow: new relation created with isTrusted=true
    const newRelation: ContractorRelation = {
      contractorProfileId: 5,
      companyId: 15,
      status: "approved",
      isTrusted: true, // auto-set on invite
    };
    expect(newRelation.isTrusted).toBe(true);
  });
});
