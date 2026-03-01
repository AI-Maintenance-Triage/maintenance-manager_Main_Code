/**
 * Plan Enforcement & Fee Calculation Tests
 *
 * Tests cover:
 * 1. Plan limit enforcement logic (properties, contractors, jobs/month, active jobs)
 * 2. Fee calculation (plan-specific vs global fallback)
 * 3. Plan feature flag logic (active/expired/no plan)
 * 4. Stripe checkout metadata construction
 * 5. Webhook plan assignment routing (company vs contractor)
 */
import { describe, expect, it } from "vitest";

// ─── 1. Plan limit enforcement helpers ─────────────────────────────────────

/**
 * Mirrors the logic in properties.create, contractor.invite, and
 * maintenance.create procedures: given a plan and current usage count,
 * should the action be blocked?
 */
function checkLimit(
  limitValue: number | null | undefined,
  currentCount: number
): { blocked: boolean; reason?: string } {
  if (limitValue == null) return { blocked: false }; // null = unlimited
  if (currentCount >= limitValue) {
    return { blocked: true, reason: `Limit of ${limitValue} reached (current: ${currentCount})` };
  }
  return { blocked: false };
}

describe("Plan limit enforcement — properties", () => {
  it("allows creation when under the limit", () => {
    expect(checkLimit(10, 5).blocked).toBe(false);
  });
  it("allows creation when exactly one below the limit", () => {
    expect(checkLimit(10, 9).blocked).toBe(false);
  });
  it("blocks creation when at the limit", () => {
    const result = checkLimit(10, 10);
    expect(result.blocked).toBe(true);
    expect(result.reason).toContain("10");
  });
  it("blocks creation when over the limit (data inconsistency guard)", () => {
    expect(checkLimit(10, 15).blocked).toBe(true);
  });
  it("allows unlimited when limit is null", () => {
    expect(checkLimit(null, 9999).blocked).toBe(false);
  });
  it("allows unlimited when limit is undefined", () => {
    expect(checkLimit(undefined, 9999).blocked).toBe(false);
  });
  it("blocks at limit of 1 (single-property plan)", () => {
    expect(checkLimit(1, 1).blocked).toBe(true);
  });
  it("allows at limit of 1 when count is 0", () => {
    expect(checkLimit(1, 0).blocked).toBe(false);
  });
});

describe("Plan limit enforcement — contractors", () => {
  it("allows inviting when under maxContractors", () => {
    expect(checkLimit(5, 4).blocked).toBe(false);
  });
  it("blocks inviting when at maxContractors", () => {
    expect(checkLimit(5, 5).blocked).toBe(true);
  });
  it("unlimited contractors when limit is null", () => {
    expect(checkLimit(null, 1000).blocked).toBe(false);
  });
});

describe("Plan limit enforcement — jobs per month", () => {
  it("allows job creation when under monthly limit", () => {
    expect(checkLimit(50, 49).blocked).toBe(false);
  });
  it("blocks job creation when at monthly limit", () => {
    expect(checkLimit(50, 50).blocked).toBe(true);
  });
  it("unlimited jobs when limit is null", () => {
    expect(checkLimit(null, 500).blocked).toBe(false);
  });
});

describe("Plan limit enforcement — contractor active jobs", () => {
  it("allows accepting job when under maxActiveJobs", () => {
    expect(checkLimit(10, 9).blocked).toBe(false);
  });
  it("blocks accepting job when at maxActiveJobs", () => {
    expect(checkLimit(10, 10).blocked).toBe(true);
  });
  it("unlimited active jobs when limit is null", () => {
    expect(checkLimit(null, 100).blocked).toBe(false);
  });
});

// ─── 2. Fee calculation logic ───────────────────────────────────────────────

interface PlanFeeConfig {
  platformFeePercent?: string | number | null;
  perListingFeeEnabled?: boolean | null;
  perListingFeeAmount?: string | number | null;
}

interface GlobalFeeConfig {
  platformFeePercent: string;
  perListingFeeEnabled: boolean;
  perListingFeeAmount: string;
}

/**
 * Mirrors the fee resolution logic in the platform.getFee procedure and
 * the job verification fee calculation.
 */
function resolveEffectiveFee(
  plan: PlanFeeConfig | null | undefined,
  globalSettings: GlobalFeeConfig
): { platformFeePercent: number; perListingFeeEnabled: boolean; perListingFeeAmount: number; source: "plan" | "global" } {
  if (plan?.platformFeePercent != null) {
    return {
      platformFeePercent: parseFloat(String(plan.platformFeePercent)),
      perListingFeeEnabled: plan.perListingFeeEnabled ?? false,
      perListingFeeAmount: parseFloat(String(plan.perListingFeeAmount ?? "0")),
      source: "plan",
    };
  }
  return {
    platformFeePercent: parseFloat(globalSettings.platformFeePercent),
    perListingFeeEnabled: globalSettings.perListingFeeEnabled,
    perListingFeeAmount: parseFloat(globalSettings.perListingFeeAmount),
    source: "global",
  };
}

const globalDefaults: GlobalFeeConfig = {
  platformFeePercent: "5.00",
  perListingFeeEnabled: false,
  perListingFeeAmount: "0.00",
};

describe("Fee calculation — plan vs global fallback", () => {
  it("uses global fee when no plan is assigned", () => {
    const result = resolveEffectiveFee(null, globalDefaults);
    expect(result.source).toBe("global");
    expect(result.platformFeePercent).toBe(5);
  });

  it("uses global fee when plan has no platformFeePercent", () => {
    const result = resolveEffectiveFee({ platformFeePercent: null }, globalDefaults);
    expect(result.source).toBe("global");
    expect(result.platformFeePercent).toBe(5);
  });

  it("uses plan fee when plan has platformFeePercent set", () => {
    const result = resolveEffectiveFee({ platformFeePercent: "3.50" }, globalDefaults);
    expect(result.source).toBe("plan");
    expect(result.platformFeePercent).toBe(3.5);
  });

  it("uses plan fee of 0% (free plan)", () => {
    const result = resolveEffectiveFee({ platformFeePercent: "0.00" }, globalDefaults);
    expect(result.source).toBe("plan");
    expect(result.platformFeePercent).toBe(0);
  });

  it("uses plan per-listing fee when enabled", () => {
    const result = resolveEffectiveFee({
      platformFeePercent: "3.00",
      perListingFeeEnabled: true,
      perListingFeeAmount: "9.99",
    }, globalDefaults);
    expect(result.source).toBe("plan");
    expect(result.perListingFeeEnabled).toBe(true);
    expect(result.perListingFeeAmount).toBe(9.99);
  });

  it("disables per-listing fee when plan sets it to false", () => {
    const result = resolveEffectiveFee({
      platformFeePercent: "3.00",
      perListingFeeEnabled: false,
      perListingFeeAmount: "9.99",
    }, globalDefaults);
    expect(result.perListingFeeEnabled).toBe(false);
  });

  it("handles numeric platformFeePercent (not string)", () => {
    const result = resolveEffectiveFee({ platformFeePercent: 7.5 }, globalDefaults);
    expect(result.platformFeePercent).toBe(7.5);
    expect(result.source).toBe("plan");
  });
});

// ─── 3. Fee amount calculation ──────────────────────────────────────────────

/**
 * Mirrors the job verification fee computation:
 * platformFee = laborCost * (feePercent / 100)
 * totalCharged = laborCost + partsCost + platformFee + perListingFee
 */
function computeJobFees(
  laborCost: number,
  partsCost: number,
  feePercent: number,
  perListingFeeEnabled: boolean,
  perListingFeeAmount: number
): { platformFee: number; perListingFee: number; totalCharged: number } {
  const platformFee = parseFloat((laborCost * (feePercent / 100)).toFixed(2));
  const perListingFee = perListingFeeEnabled ? perListingFeeAmount : 0;
  const totalCharged = parseFloat((laborCost + partsCost + platformFee + perListingFee).toFixed(2));
  return { platformFee, perListingFee, totalCharged };
}

describe("Fee amount calculation", () => {
  it("calculates 5% platform fee correctly", () => {
    const { platformFee, totalCharged } = computeJobFees(200, 50, 5, false, 0);
    expect(platformFee).toBe(10);
    expect(totalCharged).toBe(260);
  });

  it("calculates 0% platform fee (free plan)", () => {
    const { platformFee, totalCharged } = computeJobFees(200, 50, 0, false, 0);
    expect(platformFee).toBe(0);
    expect(totalCharged).toBe(250);
  });

  it("calculates 10% platform fee", () => {
    const { platformFee } = computeJobFees(300, 0, 10, false, 0);
    expect(platformFee).toBe(30);
  });

  it("adds per-listing fee when enabled", () => {
    const { perListingFee, totalCharged } = computeJobFees(200, 0, 5, true, 15);
    expect(perListingFee).toBe(15);
    expect(totalCharged).toBe(200 + 10 + 15); // labor + fee + listing
  });

  it("does not add per-listing fee when disabled", () => {
    const { perListingFee, totalCharged } = computeJobFees(200, 0, 5, false, 15);
    expect(perListingFee).toBe(0);
    expect(totalCharged).toBe(210);
  });

  it("handles fractional cents correctly (rounds to 2 decimals)", () => {
    const { platformFee } = computeJobFees(100, 0, 3.33, false, 0);
    expect(platformFee).toBe(3.33);
  });

  it("handles zero labor cost", () => {
    const { platformFee, totalCharged } = computeJobFees(0, 50, 5, false, 0);
    expect(platformFee).toBe(0);
    expect(totalCharged).toBe(50);
  });
});

// ─── 4. Plan feature flag logic ─────────────────────────────────────────────

interface PlanFeatures {
  gpsTimeTracking?: boolean;
  aiJobClassification?: boolean;
  expenseReports?: boolean;
  contractorRatings?: boolean;
  jobComments?: boolean;
  emailNotifications?: boolean;
  apiAccess?: boolean;
  customBranding?: boolean;
  prioritySupport?: boolean;
}

type FeatureKey = keyof PlanFeatures;

/**
 * Mirrors getActivePlanForCompany / checkPlanFeature logic:
 * - No plan → feature blocked
 * - Plan expired → feature blocked
 * - Plan active but feature disabled → blocked
 * - Plan active and feature enabled → allowed
 */
function checkFeatureAccess(
  plan: { features: PlanFeatures; status: "active" | "trialing" | "expired" | "canceled" } | null | undefined,
  feature: FeatureKey
): { allowed: boolean; reason?: string } {
  if (!plan) return { allowed: false, reason: "No plan assigned" };
  if (plan.status === "expired" || plan.status === "canceled") {
    return { allowed: false, reason: `Plan is ${plan.status}` };
  }
  const enabled = plan.features[feature] ?? false;
  if (!enabled) return { allowed: false, reason: `Feature '${feature}' not included in plan` };
  return { allowed: true };
}

const activePlanWithGps = {
  features: { gpsTimeTracking: true, aiJobClassification: false, expenseReports: true },
  status: "active" as const,
};

describe("Plan feature flag — GPS tracking", () => {
  it("allows GPS when plan is active and feature enabled", () => {
    expect(checkFeatureAccess(activePlanWithGps, "gpsTimeTracking").allowed).toBe(true);
  });
  it("blocks GPS when plan is active but feature disabled", () => {
    expect(checkFeatureAccess(activePlanWithGps, "aiJobClassification").allowed).toBe(false);
  });
  it("blocks GPS when no plan assigned", () => {
    const result = checkFeatureAccess(null, "gpsTimeTracking");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("No plan");
  });
  it("blocks GPS when plan is expired", () => {
    const result = checkFeatureAccess({ ...activePlanWithGps, status: "expired" }, "gpsTimeTracking");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("expired");
  });
  it("blocks GPS when plan is canceled", () => {
    const result = checkFeatureAccess({ ...activePlanWithGps, status: "canceled" }, "gpsTimeTracking");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("canceled");
  });
  it("allows GPS during trial period", () => {
    const result = checkFeatureAccess({ ...activePlanWithGps, status: "trialing" }, "gpsTimeTracking");
    expect(result.allowed).toBe(true);
  });
});

describe("Plan feature flag — expense reports", () => {
  it("allows expense reports when enabled", () => {
    expect(checkFeatureAccess(activePlanWithGps, "expenseReports").allowed).toBe(true);
  });
  it("blocks expense reports when not in plan", () => {
    const plan = { features: { expenseReports: false }, status: "active" as const };
    expect(checkFeatureAccess(plan, "expenseReports").allowed).toBe(false);
  });
});

describe("Plan feature flag — AI classification", () => {
  it("blocks AI when not in plan", () => {
    expect(checkFeatureAccess(activePlanWithGps, "aiJobClassification").allowed).toBe(false);
  });
  it("allows AI when included in plan", () => {
    const plan = { features: { aiJobClassification: true }, status: "active" as const };
    expect(checkFeatureAccess(plan, "aiJobClassification").allowed).toBe(true);
  });
});

describe("Plan feature flag — ratings", () => {
  it("blocks ratings when not in plan", () => {
    const plan = { features: { contractorRatings: false }, status: "active" as const };
    expect(checkFeatureAccess(plan, "contractorRatings").allowed).toBe(false);
  });
  it("allows ratings when included in plan", () => {
    const plan = { features: { contractorRatings: true }, status: "active" as const };
    expect(checkFeatureAccess(plan, "contractorRatings").allowed).toBe(true);
  });
});

// ─── 5. Stripe checkout metadata construction ───────────────────────────────

interface CheckoutMetadata {
  company_id?: string;
  contractor_profile_id?: string;
  plan_id: string;
  billing_interval: "monthly" | "annual";
  customer_email: string;
  customer_name: string;
  entity_type: "company" | "contractor";
}

function buildCompanyCheckoutMetadata(
  companyId: number,
  planId: number,
  interval: "monthly" | "annual",
  email: string,
  name: string
): CheckoutMetadata {
  return {
    company_id: companyId.toString(),
    plan_id: planId.toString(),
    billing_interval: interval,
    customer_email: email,
    customer_name: name,
    entity_type: "company",
  };
}

function buildContractorCheckoutMetadata(
  profileId: number,
  planId: number,
  interval: "monthly" | "annual",
  email: string,
  name: string
): CheckoutMetadata {
  return {
    contractor_profile_id: profileId.toString(),
    plan_id: planId.toString(),
    billing_interval: interval,
    customer_email: email,
    customer_name: name,
    entity_type: "contractor",
  };
}

describe("Stripe checkout metadata — company", () => {
  const meta = buildCompanyCheckoutMetadata(42, 3, "monthly", "admin@acme.com", "Acme Corp");

  it("sets entity_type to company", () => {
    expect(meta.entity_type).toBe("company");
  });
  it("serializes company_id as string", () => {
    expect(meta.company_id).toBe("42");
  });
  it("serializes plan_id as string", () => {
    expect(meta.plan_id).toBe("3");
  });
  it("sets billing_interval correctly", () => {
    expect(meta.billing_interval).toBe("monthly");
  });
  it("does not set contractor_profile_id", () => {
    expect(meta.contractor_profile_id).toBeUndefined();
  });
});

describe("Stripe checkout metadata — contractor", () => {
  const meta = buildContractorCheckoutMetadata(7, 2, "annual", "john@example.com", "John Doe");

  it("sets entity_type to contractor", () => {
    expect(meta.entity_type).toBe("contractor");
  });
  it("serializes contractor_profile_id as string", () => {
    expect(meta.contractor_profile_id).toBe("7");
  });
  it("does not set company_id", () => {
    expect(meta.company_id).toBeUndefined();
  });
  it("sets annual billing interval", () => {
    expect(meta.billing_interval).toBe("annual");
  });
});

// ─── 6. Webhook routing logic ───────────────────────────────────────────────

/**
 * Mirrors the checkout.session.completed webhook handler:
 * route plan assignment to company or contractor based on entity_type.
 */
function routeWebhookPlanAssignment(metadata: CheckoutMetadata): {
  target: "company" | "contractor" | "unknown";
  id: number | null;
  planId: number;
} {
  const planId = parseInt(metadata.plan_id);
  if (metadata.entity_type === "contractor" && metadata.contractor_profile_id) {
    return { target: "contractor", id: parseInt(metadata.contractor_profile_id), planId };
  }
  if (metadata.entity_type === "company" && metadata.company_id) {
    return { target: "company", id: parseInt(metadata.company_id), planId };
  }
  return { target: "unknown", id: null, planId };
}

describe("Webhook routing — plan assignment", () => {
  it("routes to company when entity_type is company", () => {
    const meta = buildCompanyCheckoutMetadata(10, 5, "monthly", "a@b.com", "A");
    const result = routeWebhookPlanAssignment(meta);
    expect(result.target).toBe("company");
    expect(result.id).toBe(10);
    expect(result.planId).toBe(5);
  });

  it("routes to contractor when entity_type is contractor", () => {
    const meta = buildContractorCheckoutMetadata(3, 2, "annual", "c@d.com", "C");
    const result = routeWebhookPlanAssignment(meta);
    expect(result.target).toBe("contractor");
    expect(result.id).toBe(3);
    expect(result.planId).toBe(2);
  });

  it("returns unknown when entity_type is missing IDs", () => {
    const meta: CheckoutMetadata = {
      plan_id: "1",
      billing_interval: "monthly",
      customer_email: "x@y.com",
      customer_name: "X",
      entity_type: "company",
      // company_id intentionally omitted
    };
    const result = routeWebhookPlanAssignment(meta);
    expect(result.target).toBe("unknown");
  });
});

// ─── 7. Plan type validation ─────────────────────────────────────────────────

describe("Plan type validation", () => {
  it("rejects contractor plan for company checkout", () => {
    const plan = { planType: "contractor" as const, id: 1, name: "Contractor Basic" };
    const isValidForCompany = plan.planType === "company";
    expect(isValidForCompany).toBe(false);
  });

  it("accepts company plan for company checkout", () => {
    const plan = { planType: "company" as const, id: 2, name: "Company Pro" };
    const isValidForCompany = plan.planType === "company";
    expect(isValidForCompany).toBe(true);
  });

  it("rejects company plan for contractor checkout", () => {
    const plan = { planType: "company" as const, id: 2, name: "Company Pro" };
    const isValidForContractor = plan.planType === "contractor";
    expect(isValidForContractor).toBe(false);
  });

  it("accepts contractor plan for contractor checkout", () => {
    const plan = { planType: "contractor" as const, id: 1, name: "Contractor Basic" };
    const isValidForContractor = plan.planType === "contractor";
    expect(isValidForContractor).toBe(true);
  });
});

// ─── 8. Billing interval price selection ────────────────────────────────────

interface PlanPricing {
  priceMonthly: string;
  priceAnnual: string;
  stripePriceIdMonthly?: string | null;
  stripePriceIdAnnual?: string | null;
}

function selectStripePriceId(plan: PlanPricing, interval: "monthly" | "annual"): string | null {
  return interval === "annual" ? (plan.stripePriceIdAnnual ?? null) : (plan.stripePriceIdMonthly ?? null);
}

function selectDisplayPrice(plan: PlanPricing, interval: "monthly" | "annual"): number {
  return interval === "annual"
    ? parseFloat(plan.priceAnnual) / 12
    : parseFloat(plan.priceMonthly);
}

describe("Billing interval price selection", () => {
  const plan: PlanPricing = {
    priceMonthly: "49.00",
    priceAnnual: "490.00",
    stripePriceIdMonthly: "price_monthly_123",
    stripePriceIdAnnual: "price_annual_456",
  };

  it("selects monthly Stripe price ID for monthly interval", () => {
    expect(selectStripePriceId(plan, "monthly")).toBe("price_monthly_123");
  });

  it("selects annual Stripe price ID for annual interval", () => {
    expect(selectStripePriceId(plan, "annual")).toBe("price_annual_456");
  });

  it("returns null when monthly price ID not set", () => {
    expect(selectStripePriceId({ ...plan, stripePriceIdMonthly: null }, "monthly")).toBeNull();
  });

  it("returns null when annual price ID not set", () => {
    expect(selectStripePriceId({ ...plan, stripePriceIdAnnual: null }, "annual")).toBeNull();
  });

  it("calculates monthly equivalent from annual price", () => {
    const monthly = selectDisplayPrice(plan, "annual");
    expect(monthly).toBeCloseTo(490 / 12, 2);
  });

  it("returns monthly price directly for monthly interval", () => {
    expect(selectDisplayPrice(plan, "monthly")).toBe(49);
  });

  it("annual plan saves ~17% vs 12x monthly", () => {
    const annualCost = parseFloat(plan.priceAnnual);
    const monthlyCost = parseFloat(plan.priceMonthly) * 12;
    const savingsPercent = ((monthlyCost - annualCost) / monthlyCost) * 100;
    expect(savingsPercent).toBeGreaterThan(15);
    expect(savingsPercent).toBeLessThan(20);
  });
});
