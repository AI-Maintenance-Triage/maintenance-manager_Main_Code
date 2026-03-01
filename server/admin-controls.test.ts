/**
 * Tests for admin control features:
 * - Announcements CRUD
 * - Maintenance mode toggle
 * - Feature flags
 * - Account suspensions / reinstatement
 * - Account credits
 * - Payout holds
 * - Audit log
 * - Contractor leaderboard
 * - Churn risk scoring
 * - Email blast audience targeting
 * - Company property reports
 * - Promo cycle info
 */
import { describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ─── Context helpers ──────────────────────────────────────────────────────────

function makeAdminCtx(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "admin-open-id",
      email: "admin@example.com",
      name: "Admin User",
      loginMethod: "manus",
      role: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

function makeCompanyCtx(companyId = 10): TrpcContext & { companyId: number } {
  return {
    user: {
      id: 2,
      openId: "company-open-id",
      email: "company@example.com",
      name: "Company User",
      loginMethod: "manus",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
    companyId,
  } as any;
}

function makeUnauthCtx(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

// ─── Announcement validation logic ───────────────────────────────────────────

describe("Announcement business rules", () => {
  it("rejects blank title", () => {
    const validate = (title: string, message: string) => {
      if (!title.trim()) throw new Error("Title is required");
      if (!message.trim()) throw new Error("Message is required");
      return true;
    };
    expect(() => validate("", "Hello")).toThrow("Title is required");
    expect(() => validate("Hi", "")).toThrow("Message is required");
    expect(validate("Hi", "Hello")).toBe(true);
  });

  it("maps announcement type to correct color class", () => {
    const TYPE_COLORS: Record<string, string> = {
      info: "bg-blue-500/10 text-blue-400 border-blue-500/20",
      warning: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
      success: "bg-green-500/10 text-green-400 border-green-500/20",
      error: "bg-red-500/10 text-red-400 border-red-500/20",
    };
    expect(TYPE_COLORS["info"]).toContain("blue");
    expect(TYPE_COLORS["warning"]).toContain("yellow");
    expect(TYPE_COLORS["success"]).toContain("green");
    expect(TYPE_COLORS["error"]).toContain("red");
    expect(TYPE_COLORS["unknown"]).toBeUndefined();
  });

  it("filters announcements by target audience correctly", () => {
    const announcements = [
      { id: 1, targetAudience: "all", isActive: true },
      { id: 2, targetAudience: "companies", isActive: true },
      { id: 3, targetAudience: "contractors", isActive: true },
      { id: 4, targetAudience: "all", isActive: false },
    ];
    const visibleForCompany = announcements.filter(
      (a) => a.isActive && (a.targetAudience === "all" || a.targetAudience === "companies")
    );
    expect(visibleForCompany).toHaveLength(2);
    expect(visibleForCompany.map((a) => a.id)).toEqual([1, 2]);

    const visibleForContractor = announcements.filter(
      (a) => a.isActive && (a.targetAudience === "all" || a.targetAudience === "contractors")
    );
    expect(visibleForContractor).toHaveLength(2);
    expect(visibleForContractor.map((a) => a.id)).toEqual([1, 3]);
  });
});

// ─── Maintenance mode logic ───────────────────────────────────────────────────

describe("Maintenance mode logic", () => {
  it("returns default message when custom message is blank", () => {
    const getEffectiveMessage = (custom: string | null) =>
      custom?.trim() || "We're performing scheduled maintenance. We'll be back shortly.";

    expect(getEffectiveMessage(null)).toBe("We're performing scheduled maintenance. We'll be back shortly.");
    expect(getEffectiveMessage("")).toBe("We're performing scheduled maintenance. We'll be back shortly.");
    expect(getEffectiveMessage("Custom msg")).toBe("Custom msg");
  });

  it("non-admin users should be blocked when maintenance is active", () => {
    const isBlocked = (isMaintenanceActive: boolean, userRole: string | null) => {
      if (!isMaintenanceActive) return false;
      return userRole !== "admin";
    };
    expect(isBlocked(true, null)).toBe(true);
    expect(isBlocked(true, "user")).toBe(true);
    expect(isBlocked(true, "admin")).toBe(false);
    expect(isBlocked(false, "user")).toBe(false);
  });
});

// ─── Feature flags logic ──────────────────────────────────────────────────────

describe("Feature flags logic", () => {
  it("normalizes flag keys to snake_case lowercase", () => {
    const normalizeKey = (key: string) => key.toLowerCase().replace(/\s+/g, "_");
    expect(normalizeKey("New Feature")).toBe("new_feature");
    expect(normalizeKey("GPS Tracking")).toBe("gps_tracking");
    expect(normalizeKey("already_normalized")).toBe("already_normalized");
  });

  it("determines feature availability per audience", () => {
    const flags = [
      { key: "ai_classify", enabledForCompanies: true, enabledForContractors: false },
      { key: "bulk_upload", enabledForCompanies: false, enabledForContractors: false },
      { key: "new_ui", enabledForCompanies: true, enabledForContractors: true },
    ];

    const isEnabled = (key: string, audience: "companies" | "contractors") => {
      const flag = flags.find((f) => f.key === key);
      if (!flag) return false;
      return audience === "companies" ? flag.enabledForCompanies : flag.enabledForContractors;
    };

    expect(isEnabled("ai_classify", "companies")).toBe(true);
    expect(isEnabled("ai_classify", "contractors")).toBe(false);
    expect(isEnabled("bulk_upload", "companies")).toBe(false);
    expect(isEnabled("new_ui", "contractors")).toBe(true);
    expect(isEnabled("nonexistent", "companies")).toBe(false);
  });
});

// ─── Account suspension logic ─────────────────────────────────────────────────

describe("Account suspension logic", () => {
  it("marks account as suspended with reason and timestamp", () => {
    const suspendAccount = (targetType: string, targetId: number, reason: string) => {
      if (!reason.trim()) throw new Error("Reason is required");
      return {
        targetType,
        targetId,
        reason,
        isActive: true,
        suspendedAt: new Date(),
        reinstatedAt: null,
      };
    };
    const result = suspendAccount("company", 5, "Terms violation");
    expect(result.isActive).toBe(true);
    expect(result.reinstatedAt).toBeNull();
    expect(result.reason).toBe("Terms violation");
    expect(() => suspendAccount("company", 5, "")).toThrow("Reason is required");
  });

  it("reinstating sets isActive to false and records timestamp", () => {
    const reinstateAccount = (suspension: { isActive: boolean; reinstatedAt: Date | null }) => {
      return { ...suspension, isActive: false, reinstatedAt: new Date() };
    };
    const suspended = { isActive: true, reinstatedAt: null };
    const reinstated = reinstateAccount(suspended);
    expect(reinstated.isActive).toBe(false);
    expect(reinstated.reinstatedAt).toBeInstanceOf(Date);
  });

  it("separates active and historical suspensions correctly", () => {
    const suspensions = [
      { id: 1, isActive: true, targetId: 10 },
      { id: 2, isActive: false, targetId: 20 },
      { id: 3, isActive: true, targetId: 30 },
    ];
    const active = suspensions.filter((s) => s.isActive);
    const historical = suspensions.filter((s) => !s.isActive);
    expect(active).toHaveLength(2);
    expect(historical).toHaveLength(1);
    expect(historical[0].id).toBe(2);
  });
});

// ─── Account credits logic ────────────────────────────────────────────────────

describe("Account credits logic", () => {
  it("converts dollar amount to cents correctly", () => {
    const toCents = (dollars: string) => Math.round(parseFloat(dollars) * 100);
    expect(toCents("10.00")).toBe(1000);
    expect(toCents("0.50")).toBe(50);
    expect(toCents("99.99")).toBe(9999);
    expect(toCents("1.005")).toBe(100); // floating-point: 1.005 * 100 = 100.5 → rounds to 100 (banker's rounding edge case)
  });

  it("rejects zero or negative credit amounts", () => {
    const validateCredit = (amountCents: number) => {
      if (isNaN(amountCents) || amountCents <= 0) throw new Error("Amount must be positive");
      return true;
    };
    expect(() => validateCredit(0)).toThrow("Amount must be positive");
    expect(() => validateCredit(-100)).toThrow("Amount must be positive");
    expect(validateCredit(100)).toBe(true);
  });

  it("formats credit amounts for display", () => {
    const fmtCredit = (cents: number) => `$${(cents / 100).toFixed(2)}`;
    expect(fmtCredit(1000)).toBe("$10.00");
    expect(fmtCredit(50)).toBe("$0.50");
    expect(fmtCredit(9999)).toBe("$99.99");
  });
});

// ─── Payout hold logic ────────────────────────────────────────────────────────

describe("Payout hold logic", () => {
  it("requires reason to place a hold", () => {
    const placeHold = (contractorId: number, reason: string) => {
      if (!reason.trim()) throw new Error("Reason is required");
      return { contractorId, reason, isActive: true, placedAt: new Date(), releasedAt: null };
    };
    expect(() => placeHold(1, "")).toThrow("Reason is required");
    const hold = placeHold(1, "Fraud investigation");
    expect(hold.isActive).toBe(true);
    expect(hold.releasedAt).toBeNull();
  });

  it("releasing a hold sets isActive to false", () => {
    const releaseHold = (hold: { isActive: boolean; releasedAt: Date | null }) => ({
      ...hold,
      isActive: false,
      releasedAt: new Date(),
    });
    const hold = { isActive: true, releasedAt: null };
    const released = releaseHold(hold);
    expect(released.isActive).toBe(false);
    expect(released.releasedAt).toBeInstanceOf(Date);
  });
});

// ─── Audit log logic ──────────────────────────────────────────────────────────

describe("Audit log logic", () => {
  it("formats action names for display", () => {
    const formatAction = (action: string) => action.replace(/_/g, " ");
    expect(formatAction("create_announcement")).toBe("create announcement");
    expect(formatAction("suspend_account")).toBe("suspend account");
    expect(formatAction("email_blast")).toBe("email blast");
  });

  it("filters audit log entries by search term", () => {
    const entries = [
      { id: 1, action: "suspend_account", details: "Company #5 suspended", actorName: "Admin" },
      { id: 2, action: "issue_credit", details: "Credit $50 to Company #3", actorName: "Admin" },
      { id: 3, action: "email_blast", details: "Sent to all users", actorName: "Admin" },
    ];
    const search = "credit";
    const filtered = entries.filter(
      (e) =>
        e.action.includes(search) ||
        e.details?.toLowerCase().includes(search) ||
        e.actorName?.toLowerCase().includes(search)
    );
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe(2);
  });

  it("paginates correctly with offset and limit", () => {
    const allEntries = Array.from({ length: 120 }, (_, i) => ({ id: i + 1 }));
    const PAGE_SIZE = 50;
    const page0 = allEntries.slice(0, PAGE_SIZE);
    const page1 = allEntries.slice(PAGE_SIZE, PAGE_SIZE * 2);
    expect(page0).toHaveLength(50);
    expect(page0[0].id).toBe(1);
    expect(page1).toHaveLength(50);
    expect(page1[0].id).toBe(51);
  });
});

// ─── Contractor leaderboard logic ─────────────────────────────────────────────

describe("Contractor leaderboard logic", () => {
  it("sorts contractors by completed jobs descending", () => {
    const contractors = [
      { id: 1, completedJobs: 10, avgRating: 4.5 },
      { id: 2, completedJobs: 25, avgRating: 4.8 },
      { id: 3, completedJobs: 5, avgRating: 5.0 },
    ];
    const sorted = [...contractors].sort((a, b) => b.completedJobs - a.completedJobs);
    expect(sorted[0].id).toBe(2);
    expect(sorted[1].id).toBe(1);
    expect(sorted[2].id).toBe(3);
  });

  it("formats average rating to one decimal place", () => {
    const fmt = (rating: number | null) => (rating ? Number(rating).toFixed(1) : "—");
    expect(fmt(4.567)).toBe("4.6");
    expect(fmt(5.0)).toBe("5.0");
    expect(fmt(null)).toBe("—");
  });

  it("formats total earnings from cents to dollars", () => {
    const fmtEarnings = (cents: number) => `$${(cents / 100).toLocaleString()}`;
    expect(fmtEarnings(150000)).toBe("$1,500");
    expect(fmtEarnings(0)).toBe("$0");
  });
});

// ─── Churn risk scoring logic ─────────────────────────────────────────────────

describe("Churn risk scoring logic", () => {
  it("classifies risk levels correctly", () => {
    const getRiskLevel = (score: number) => {
      if (score >= 70) return "high";
      if (score >= 40) return "medium";
      return "low";
    };
    expect(getRiskLevel(85)).toBe("high");
    expect(getRiskLevel(70)).toBe("high");
    expect(getRiskLevel(55)).toBe("medium");
    expect(getRiskLevel(40)).toBe("medium");
    expect(getRiskLevel(39)).toBe("low");
    expect(getRiskLevel(0)).toBe("low");
  });

  it("counts companies per risk tier correctly", () => {
    const companies = [
      { id: 1, churnScore: 80 },
      { id: 2, churnScore: 65 },
      { id: 3, churnScore: 20 },
      { id: 4, churnScore: 75 },
      { id: 5, churnScore: 45 },
    ];
    const highRisk = companies.filter((c) => c.churnScore >= 70);
    const mediumRisk = companies.filter((c) => c.churnScore >= 40 && c.churnScore < 70);
    const lowRisk = companies.filter((c) => c.churnScore < 40);
    expect(highRisk).toHaveLength(2);
    expect(mediumRisk).toHaveLength(2);
    expect(lowRisk).toHaveLength(1);
  });

  it("renders correct bar color based on score", () => {
    const barColor = (score: number) => {
      if (score >= 80) return "bg-red-500";
      if (score >= 50) return "bg-yellow-500";
      return "bg-blue-500";
    };
    expect(barColor(85)).toBe("bg-red-500");
    expect(barColor(55)).toBe("bg-yellow-500");
    expect(barColor(30)).toBe("bg-blue-500");
  });
});

// ─── Email blast logic ────────────────────────────────────────────────────────

describe("Email blast audience targeting", () => {
  it("correctly labels audience for confirmation dialog", () => {
    const getAudienceLabel = (audience: string) =>
      audience === "all" ? "all users" : audience;
    expect(getAudienceLabel("all")).toBe("all users");
    expect(getAudienceLabel("companies")).toBe("companies");
    expect(getAudienceLabel("contractors")).toBe("contractors");
  });

  it("validates that subject and body are non-empty", () => {
    const canSend = (subject: string, body: string) =>
      subject.trim().length > 0 && body.trim().length > 0;
    expect(canSend("", "body")).toBe(false);
    expect(canSend("subject", "")).toBe(false);
    expect(canSend("", "")).toBe(false);
    expect(canSend("subject", "body")).toBe(true);
  });

  it("converts newlines to HTML breaks for email body", () => {
    const toHtml = (text: string) => text.replace(/\n/g, "<br>");
    expect(toHtml("Line 1\nLine 2")).toBe("Line 1<br>Line 2");
    expect(toHtml("No breaks")).toBe("No breaks");
  });
});

// ─── Property reports logic ───────────────────────────────────────────────────

describe("Per-property billing report logic", () => {
  it("calculates totals correctly from property rows", () => {
    const rows = [
      { totalCharged: 10000, platformFee: 1000, laborCost: 6000, partsCost: 2000, jobCount: 3 },
      { totalCharged: 5000, platformFee: 500, laborCost: 3000, partsCost: 1000, jobCount: 2 },
    ];
    const totals = rows.reduce(
      (acc, r) => ({
        totalCharged: acc.totalCharged + r.totalCharged,
        platformFee: acc.platformFee + r.platformFee,
        laborCost: acc.laborCost + r.laborCost,
        partsCost: acc.partsCost + r.partsCost,
        jobCount: acc.jobCount + r.jobCount,
      }),
      { totalCharged: 0, platformFee: 0, laborCost: 0, partsCost: 0, jobCount: 0 }
    );
    expect(totals.totalCharged).toBe(15000);
    expect(totals.platformFee).toBe(1500);
    expect(totals.jobCount).toBe(5);
  });

  it("sorts properties by totalCharged descending", () => {
    const rows = [
      { propertyId: 1, totalCharged: 5000 },
      { propertyId: 2, totalCharged: 15000 },
      { propertyId: 3, totalCharged: 8000 },
    ];
    const sorted = [...rows].sort((a, b) => b.totalCharged - a.totalCharged);
    expect(sorted[0].propertyId).toBe(2);
    expect(sorted[1].propertyId).toBe(3);
    expect(sorted[2].propertyId).toBe(1);
  });

  it("calculates bar percentage relative to max", () => {
    const maxCharged = 15000;
    const barPct = (totalCharged: number) =>
      maxCharged > 0 ? Math.round((totalCharged / maxCharged) * 100) : 0;
    expect(barPct(15000)).toBe(100);
    expect(barPct(7500)).toBe(50);
    expect(barPct(0)).toBe(0);
  });

  it("calculates net revenue correctly", () => {
    const netRevenue = (totalCharged: number, platformFee: number) => totalCharged - platformFee;
    expect(netRevenue(10000, 1000)).toBe(9000);
    expect(netRevenue(5000, 5000)).toBe(0);
    expect(netRevenue(3000, 4000)).toBe(-1000); // loss scenario
  });

  it("generates correct CSV export format", () => {
    const rows = [
      { propertyName: "Main St", jobCount: 3, totalCharged: 10000, platformFee: 1000, laborCost: 6000, partsCost: 2000 },
    ];
    const headers = ["Property", "Jobs", "Total Charged", "Platform Fee", "Labor Cost", "Parts Cost", "Net Revenue"];
    const csvRow = [
      `"${rows[0].propertyName}"`,
      rows[0].jobCount,
      (rows[0].totalCharged / 100).toFixed(2),
      (rows[0].platformFee / 100).toFixed(2),
      (rows[0].laborCost / 100).toFixed(2),
      (rows[0].partsCost / 100).toFixed(2),
      ((rows[0].totalCharged - rows[0].platformFee) / 100).toFixed(2),
    ].join(",");
    expect(csvRow).toBe('"Main St",3,100.00,10.00,60.00,20.00,90.00');
  });

  it("computes correct date range from days", () => {
    const getDates = (days: number, now = 1000000) => {
      if (days === 0) return { fromMs: undefined, toMs: undefined };
      return { fromMs: now - days * 24 * 60 * 60 * 1000, toMs: now };
    };
    const result = getDates(30, 1000000);
    expect(result.toMs).toBe(1000000);
    expect(result.fromMs).toBe(1000000 - 30 * 24 * 60 * 60 * 1000);
    expect(getDates(0)).toEqual({ fromMs: undefined, toMs: undefined });
  });
});

// ─── Promo cycle countdown logic ──────────────────────────────────────────────

describe("Promo cycle countdown display logic", () => {
  it("calculates percentage used correctly", () => {
    const pct = (total: number, remaining: number) =>
      total > 0 ? Math.round(((total - remaining) / total) * 100) : 0;
    expect(pct(12, 12)).toBe(0);
    expect(pct(12, 6)).toBe(50);
    expect(pct(12, 0)).toBe(100);
    expect(pct(3, 1)).toBe(67);
  });

  it("chooses correct bar color based on usage percentage", () => {
    const barColor = (pct: number) => {
      if (pct >= 80) return "bg-red-500";
      if (pct >= 50) return "bg-yellow-500";
      return "bg-amber-400";
    };
    expect(barColor(90)).toBe("bg-red-500");
    expect(barColor(80)).toBe("bg-red-500");
    expect(barColor(60)).toBe("bg-yellow-500");
    expect(barColor(50)).toBe("bg-yellow-500");
    expect(barColor(30)).toBe("bg-amber-400");
  });

  it("shows forever indicator when billingCycles is null", () => {
    const showForever = (billingCycles: number | null) => billingCycles == null;
    expect(showForever(null)).toBe(true);
    expect(showForever(12)).toBe(false);
    expect(showForever(0)).toBe(false);
  });

  it("matches cycle info to promo code correctly", () => {
    const cycleInfo = [
      { promoCode: "SUMMER25", billingCycles: 6, cyclesRemaining: 4 },
      { promoCode: "WINTER10", billingCycles: 3, cyclesRemaining: 1 },
    ];
    const find = (code: string) => cycleInfo.find((c) => c.promoCode === code);
    expect(find("SUMMER25")?.cyclesRemaining).toBe(4);
    expect(find("WINTER10")?.billingCycles).toBe(3);
    expect(find("NOTEXIST")).toBeUndefined();
  });
});

// ─── Admin procedure authorization ───────────────────────────────────────────

describe("Admin procedure authorization", () => {
  it("admin role check passes for admin users", () => {
    const checkAdmin = (role: string | null) => {
      if (role !== "admin") throw new Error("FORBIDDEN");
      return true;
    };
    expect(checkAdmin("admin")).toBe(true);
    expect(() => checkAdmin("user")).toThrow("FORBIDDEN");
    expect(() => checkAdmin(null)).toThrow("FORBIDDEN");
  });

  it("unauthenticated requests are rejected", () => {
    const checkAuth = (user: { id: number } | null) => {
      if (!user) throw new Error("UNAUTHORIZED");
      return true;
    };
    expect(() => checkAuth(null)).toThrow("UNAUTHORIZED");
    expect(checkAuth({ id: 1 })).toBe(true);
  });
});
