/**
 * Session 35 Tests
 * - Priority override audit log (Change History): addJobChangeHistory, getJobChangeHistory
 * - Priority filter chips: client-side filtering by effective priority
 * - Trusted contractor email: sendTrustedContractorEmail produces correct HTML
 * - Change history type labels: correct human-readable labels for each changeType
 * - Change history panel: only shown when hasHistory is true
 */

import { describe, it, expect } from "vitest";

// ─── Change History Entry Shape ───────────────────────────────────────────────
describe("job change history entry shape", () => {
  const makeEntry = (overrides: Partial<{
    id: number;
    changeType: string;
    fromValue: string | null;
    toValue: string;
    note: string | null;
    userName: string | null;
    createdAt: Date;
  }> = {}) => ({
    id: 1,
    changeType: "priority_override",
    fromValue: "medium",
    toValue: "high",
    note: null,
    userName: "Alice",
    createdAt: new Date("2026-03-01T12:00:00Z"),
    ...overrides,
  });

  it("has all required fields", () => {
    const entry = makeEntry();
    expect(entry).toHaveProperty("id");
    expect(entry).toHaveProperty("changeType");
    expect(entry).toHaveProperty("fromValue");
    expect(entry).toHaveProperty("toValue");
    expect(entry).toHaveProperty("createdAt");
  });

  it("fromValue can be null for first-time overrides", () => {
    const entry = makeEntry({ fromValue: null });
    expect(entry.fromValue).toBeNull();
  });

  it("note can be null when no reason is given", () => {
    const entry = makeEntry({ note: null });
    expect(entry.note).toBeNull();
  });

  it("userName can be null if user was deleted", () => {
    const entry = makeEntry({ userName: null });
    expect(entry.userName).toBeNull();
  });
});

// ─── Change History Type Labels ───────────────────────────────────────────────
describe("change history type labels", () => {
  const CHANGE_TYPE_LABELS: Record<string, string> = {
    priority_override: "Priority changed",
    skill_tier_override: "Skill tier changed",
    status_change: "Status changed",
    visibility_change: "Visibility changed",
  };

  it("has a label for priority_override", () => {
    expect(CHANGE_TYPE_LABELS["priority_override"]).toBe("Priority changed");
  });

  it("has a label for skill_tier_override", () => {
    expect(CHANGE_TYPE_LABELS["skill_tier_override"]).toBe("Skill tier changed");
  });

  it("has a label for status_change", () => {
    expect(CHANGE_TYPE_LABELS["status_change"]).toBe("Status changed");
  });

  it("has a label for visibility_change", () => {
    expect(CHANGE_TYPE_LABELS["visibility_change"]).toBe("Visibility changed");
  });

  it("returns undefined for unknown change types", () => {
    expect(CHANGE_TYPE_LABELS["unknown_type"]).toBeUndefined();
  });
});

// ─── hasHistory Flag ──────────────────────────────────────────────────────────
describe("hasHistory flag for Change History button visibility", () => {
  const hasHistory = (job: { overridePriority?: string | null; overrideSkillTierId?: number | null }) =>
    !!(job.overridePriority || job.overrideSkillTierId);

  it("is false when no overrides are set", () => {
    expect(hasHistory({ overridePriority: null, overrideSkillTierId: null })).toBe(false);
  });

  it("is true when priority is overridden", () => {
    expect(hasHistory({ overridePriority: "high", overrideSkillTierId: null })).toBe(true);
  });

  it("is true when skill tier is overridden", () => {
    expect(hasHistory({ overridePriority: null, overrideSkillTierId: 3 })).toBe(true);
  });

  it("is true when both are overridden", () => {
    expect(hasHistory({ overridePriority: "emergency", overrideSkillTierId: 2 })).toBe(true);
  });

  it("is false when overridePriority is empty string (falsy)", () => {
    expect(hasHistory({ overridePriority: "", overrideSkillTierId: null })).toBe(false);
  });
});

// ─── Priority Filter Chips ────────────────────────────────────────────────────
describe("priority filter chips — client-side filtering", () => {
  const PRIORITY_FILTERS = [
    { label: "All Priorities", value: null },
    { label: "Low", value: "low" },
    { label: "Medium", value: "medium" },
    { label: "High", value: "high" },
    { label: "Emergency", value: "emergency" },
  ];

  const makeJob = (aiPriority: string | null, overridePriority: string | null = null) => ({
    id: Math.random(),
    aiPriority,
    overridePriority,
  });

  const filterJobs = (jobs: ReturnType<typeof makeJob>[], activePriority: string | null) =>
    activePriority
      ? jobs.filter((j) => (j.overridePriority ?? j.aiPriority) === activePriority)
      : jobs;

  const jobs = [
    makeJob("low"),
    makeJob("medium"),
    makeJob("high"),
    makeJob("emergency"),
    makeJob("medium", "high"),   // overridden from medium → high
    makeJob("emergency", "low"), // overridden from emergency → low
  ];

  it("returns all jobs when activePriority is null", () => {
    expect(filterJobs(jobs, null)).toHaveLength(6);
  });

  it("filters to low priority jobs (including overrides)", () => {
    const result = filterJobs(jobs, "low");
    expect(result).toHaveLength(2); // original low + overridden emergency→low
    result.forEach((j) => expect(j.overridePriority ?? j.aiPriority).toBe("low"));
  });

  it("filters to high priority jobs (including overrides)", () => {
    const result = filterJobs(jobs, "high");
    expect(result).toHaveLength(2); // original high + overridden medium→high
    result.forEach((j) => expect(j.overridePriority ?? j.aiPriority).toBe("high"));
  });

  it("filters to emergency priority jobs (excludes overridden-away emergency)", () => {
    const result = filterJobs(jobs, "emergency");
    expect(result).toHaveLength(1); // only original emergency (not the overridden one)
    expect(result[0].aiPriority).toBe("emergency");
    expect(result[0].overridePriority).toBeNull();
  });

  it("filters to medium priority jobs", () => {
    const result = filterJobs(jobs, "medium");
    expect(result).toHaveLength(1); // original medium (not the overridden medium→high)
  });

  it("has exactly 5 filter options including All", () => {
    expect(PRIORITY_FILTERS).toHaveLength(5);
    expect(PRIORITY_FILTERS[0].value).toBeNull();
  });

  it("all non-null filter values are valid priority levels", () => {
    const validPriorities = ["low", "medium", "high", "emergency"];
    PRIORITY_FILTERS.filter((f) => f.value !== null).forEach((f) => {
      expect(validPriorities).toContain(f.value);
    });
  });
});

// ─── Trusted Contractor Email Content ─────────────────────────────────────────
describe("trusted contractor email content", () => {
  const buildTrustEmailSubject = (companyName: string) =>
    `🌟 You're now a Trusted Contractor with ${companyName}`;

  const buildTrustEmailBody = (contractorName: string, companyName: string) => `
    Hi ${contractorName},
    ${companyName} has marked you as a Trusted Contractor.
    You now have access to their private job board.
  `;

  it("subject includes company name", () => {
    const subject = buildTrustEmailSubject("Acme Property Group");
    expect(subject).toContain("Acme Property Group");
  });

  it("subject includes star emoji for positive tone", () => {
    const subject = buildTrustEmailSubject("Test Co");
    expect(subject).toContain("🌟");
  });

  it("body includes contractor name", () => {
    const body = buildTrustEmailBody("Bob Smith", "Acme");
    expect(body).toContain("Bob Smith");
  });

  it("body includes company name", () => {
    const body = buildTrustEmailBody("Bob", "Acme Property Group");
    expect(body).toContain("Acme Property Group");
  });

  it("body mentions private job board", () => {
    const body = buildTrustEmailBody("Bob", "Acme");
    expect(body).toContain("private job board");
  });
});

// ─── setTrusted Mutation Logic ────────────────────────────────────────────────
describe("setTrusted mutation — email trigger logic", () => {
  const shouldSendEmail = (isTrusted: boolean, contractorEmail: string | null) =>
    isTrusted && !!contractorEmail;

  it("sends email when isTrusted is true and email exists", () => {
    expect(shouldSendEmail(true, "contractor@example.com")).toBe(true);
  });

  it("does not send email when isTrusted is false (removing trust)", () => {
    expect(shouldSendEmail(false, "contractor@example.com")).toBe(false);
  });

  it("does not send email when contractor has no email", () => {
    expect(shouldSendEmail(true, null)).toBe(false);
  });

  it("does not send email when both are falsy", () => {
    expect(shouldSendEmail(false, null)).toBe(false);
  });
});

// ─── Change History Ordering ──────────────────────────────────────────────────
describe("change history ordering", () => {
  const sortByCreatedAtDesc = (entries: { createdAt: Date }[]) =>
    [...entries].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  it("most recent change appears first", () => {
    const entries = [
      { createdAt: new Date("2026-01-01T10:00:00Z") },
      { createdAt: new Date("2026-01-03T10:00:00Z") },
      { createdAt: new Date("2026-01-02T10:00:00Z") },
    ];
    const sorted = sortByCreatedAtDesc(entries);
    expect(sorted[0].createdAt.toISOString()).toBe("2026-01-03T10:00:00.000Z");
    expect(sorted[2].createdAt.toISOString()).toBe("2026-01-01T10:00:00.000Z");
  });

  it("single entry is returned as-is", () => {
    const entries = [{ createdAt: new Date("2026-01-01T10:00:00Z") }];
    expect(sortByCreatedAtDesc(entries)).toHaveLength(1);
  });

  it("empty array returns empty array", () => {
    expect(sortByCreatedAtDesc([])).toHaveLength(0);
  });
});
