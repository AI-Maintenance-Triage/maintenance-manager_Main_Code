/**
 * Promo Code System Tests
 * Tests: redemption logic, discount calculations, expired/maxed/duplicate edge cases
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// ─── Pure calculation helpers (no DB) ────────────────────────────────────────

function applyPromoDiscounts(
  baseFeePercent: number,
  baseListingAmount: number,
  discounts: { serviceChargeDiscountPercent: number; listingFeeDiscountPercent: number }
) {
  let feePercent = baseFeePercent;
  let listingAmount = baseListingAmount;
  if (discounts.serviceChargeDiscountPercent > 0) {
    feePercent = feePercent * (1 - discounts.serviceChargeDiscountPercent / 100);
  }
  if (discounts.listingFeeDiscountPercent > 0) {
    listingAmount = listingAmount * (1 - discounts.listingFeeDiscountPercent / 100);
  }
  return { feePercent, listingAmount };
}

function aggregatePromoDiscounts(
  redemptions: Array<{
    isActive: boolean;
    cyclesRemaining: number | null;
    discountPercent: string;
    affectsSubscription: boolean;
    affectsServiceCharge: boolean;
    affectsListingFee: boolean;
  }>
): { subscriptionDiscountPercent: number; serviceChargeDiscountPercent: number; listingFeeDiscountPercent: number } {
  const active = redemptions.filter(
    (r) => r.isActive && (r.cyclesRemaining == null || r.cyclesRemaining > 0)
  );
  let sub = 0, svc = 0, lst = 0;
  for (const r of active) {
    const pct = parseFloat(r.discountPercent ?? "0");
    if (r.affectsSubscription) sub += pct;
    if (r.affectsServiceCharge) svc += pct;
    if (r.affectsListingFee) lst += pct;
  }
  return {
    subscriptionDiscountPercent: Math.min(sub, 100),
    serviceChargeDiscountPercent: Math.min(svc, 100),
    listingFeeDiscountPercent: Math.min(lst, 100),
  };
}

function validatePromoCode(
  promo: {
    isActive: boolean;
    expiresAt: number | null;
    maxRedemptions: number | null;
    redemptionCount: number;
  } | null,
  alreadyRedeemed: boolean
): { valid: boolean; error?: string } {
  if (!promo) return { valid: false, error: "Invalid promo code" };
  if (!promo.isActive) return { valid: false, error: "This promo code is no longer active" };
  if (promo.expiresAt && promo.expiresAt < Date.now()) return { valid: false, error: "This promo code has expired" };
  if (promo.maxRedemptions != null && promo.redemptionCount >= promo.maxRedemptions) {
    return { valid: false, error: "This promo code has reached its maximum number of redemptions" };
  }
  if (alreadyRedeemed) return { valid: false, error: "You have already redeemed this promo code" };
  return { valid: true };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Promo Code Validation", () => {
  it("returns error for null promo (invalid code)", () => {
    const result = validatePromoCode(null, false);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Invalid promo code");
  });

  it("returns error for inactive promo", () => {
    const promo = { isActive: false, expiresAt: null, maxRedemptions: null, redemptionCount: 0 };
    const result = validatePromoCode(promo, false);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("This promo code is no longer active");
  });

  it("returns error for expired promo", () => {
    const promo = {
      isActive: true,
      expiresAt: Date.now() - 1000 * 60 * 60 * 24, // expired yesterday
      maxRedemptions: null,
      redemptionCount: 0,
    };
    const result = validatePromoCode(promo, false);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("This promo code has expired");
  });

  it("returns error when max redemptions reached", () => {
    const promo = { isActive: true, expiresAt: null, maxRedemptions: 10, redemptionCount: 10 };
    const result = validatePromoCode(promo, false);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("This promo code has reached its maximum number of redemptions");
  });

  it("returns error when company already redeemed", () => {
    const promo = { isActive: true, expiresAt: null, maxRedemptions: null, redemptionCount: 5 };
    const result = validatePromoCode(promo, true);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("You have already redeemed this promo code");
  });

  it("returns valid for a good promo code", () => {
    const promo = {
      isActive: true,
      expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 30, // expires in 30 days
      maxRedemptions: 100,
      redemptionCount: 5,
    };
    const result = validatePromoCode(promo, false);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("allows unlimited redemptions when maxRedemptions is null", () => {
    const promo = { isActive: true, expiresAt: null, maxRedemptions: null, redemptionCount: 9999 };
    const result = validatePromoCode(promo, false);
    expect(result.valid).toBe(true);
  });

  it("allows promo with no expiry", () => {
    const promo = { isActive: true, expiresAt: null, maxRedemptions: null, redemptionCount: 0 };
    const result = validatePromoCode(promo, false);
    expect(result.valid).toBe(true);
  });
});

describe("Promo Discount Aggregation", () => {
  it("returns zero discounts when no active redemptions", () => {
    const result = aggregatePromoDiscounts([]);
    expect(result.subscriptionDiscountPercent).toBe(0);
    expect(result.serviceChargeDiscountPercent).toBe(0);
    expect(result.listingFeeDiscountPercent).toBe(0);
  });

  it("ignores inactive redemptions", () => {
    const redemptions = [
      { isActive: false, cyclesRemaining: null, discountPercent: "20", affectsSubscription: true, affectsServiceCharge: true, affectsListingFee: true },
    ];
    const result = aggregatePromoDiscounts(redemptions);
    expect(result.subscriptionDiscountPercent).toBe(0);
    expect(result.serviceChargeDiscountPercent).toBe(0);
  });

  it("ignores redemptions with zero cycles remaining", () => {
    const redemptions = [
      { isActive: true, cyclesRemaining: 0, discountPercent: "15", affectsSubscription: false, affectsServiceCharge: true, affectsListingFee: false },
    ];
    const result = aggregatePromoDiscounts(redemptions);
    expect(result.serviceChargeDiscountPercent).toBe(0);
  });

  it("includes redemptions with null cyclesRemaining (forever)", () => {
    const redemptions = [
      { isActive: true, cyclesRemaining: null, discountPercent: "10", affectsSubscription: false, affectsServiceCharge: true, affectsListingFee: false },
    ];
    const result = aggregatePromoDiscounts(redemptions);
    expect(result.serviceChargeDiscountPercent).toBe(10);
  });

  it("includes redemptions with cyclesRemaining > 0", () => {
    const redemptions = [
      { isActive: true, cyclesRemaining: 3, discountPercent: "25", affectsSubscription: false, affectsServiceCharge: false, affectsListingFee: true },
    ];
    const result = aggregatePromoDiscounts(redemptions);
    expect(result.listingFeeDiscountPercent).toBe(25);
  });

  it("stacks multiple active promos additively", () => {
    const redemptions = [
      { isActive: true, cyclesRemaining: null, discountPercent: "10", affectsSubscription: false, affectsServiceCharge: true, affectsListingFee: false },
      { isActive: true, cyclesRemaining: 2, discountPercent: "15", affectsSubscription: false, affectsServiceCharge: true, affectsListingFee: false },
    ];
    const result = aggregatePromoDiscounts(redemptions);
    expect(result.serviceChargeDiscountPercent).toBe(25);
  });

  it("caps total discount at 100%", () => {
    const redemptions = [
      { isActive: true, cyclesRemaining: null, discountPercent: "70", affectsSubscription: false, affectsServiceCharge: true, affectsListingFee: false },
      { isActive: true, cyclesRemaining: null, discountPercent: "60", affectsSubscription: false, affectsServiceCharge: true, affectsListingFee: false },
    ];
    const result = aggregatePromoDiscounts(redemptions);
    expect(result.serviceChargeDiscountPercent).toBe(100);
  });

  it("applies discounts to correct scopes independently", () => {
    const redemptions = [
      { isActive: true, cyclesRemaining: null, discountPercent: "20", affectsSubscription: true, affectsServiceCharge: false, affectsListingFee: false },
      { isActive: true, cyclesRemaining: null, discountPercent: "30", affectsSubscription: false, affectsServiceCharge: true, affectsListingFee: false },
      { isActive: true, cyclesRemaining: null, discountPercent: "50", affectsSubscription: false, affectsServiceCharge: false, affectsListingFee: true },
    ];
    const result = aggregatePromoDiscounts(redemptions);
    expect(result.subscriptionDiscountPercent).toBe(20);
    expect(result.serviceChargeDiscountPercent).toBe(30);
    expect(result.listingFeeDiscountPercent).toBe(50);
  });
});

describe("Promo Discount Application to Job Fees", () => {
  it("applies no discount when discounts are zero", () => {
    const result = applyPromoDiscounts(10, 5, { serviceChargeDiscountPercent: 0, listingFeeDiscountPercent: 0 });
    expect(result.feePercent).toBe(10);
    expect(result.listingAmount).toBe(5);
  });

  it("reduces service charge by correct percentage", () => {
    // 10% base fee, 50% promo discount → 5% effective fee
    const result = applyPromoDiscounts(10, 5, { serviceChargeDiscountPercent: 50, listingFeeDiscountPercent: 0 });
    expect(result.feePercent).toBe(5);
    expect(result.listingAmount).toBe(5); // unchanged
  });

  it("reduces listing fee by correct percentage", () => {
    // $5 base listing, 40% promo discount → $3 effective listing
    const result = applyPromoDiscounts(10, 5, { serviceChargeDiscountPercent: 0, listingFeeDiscountPercent: 40 });
    expect(result.feePercent).toBe(10); // unchanged
    expect(result.listingAmount).toBe(3);
  });

  it("applies both discounts simultaneously", () => {
    // 8% fee with 25% off → 6%, $4 listing with 50% off → $2
    const result = applyPromoDiscounts(8, 4, { serviceChargeDiscountPercent: 25, listingFeeDiscountPercent: 50 });
    expect(result.feePercent).toBe(6);
    expect(result.listingAmount).toBe(2);
  });

  it("100% discount makes fee zero", () => {
    const result = applyPromoDiscounts(10, 5, { serviceChargeDiscountPercent: 100, listingFeeDiscountPercent: 100 });
    expect(result.feePercent).toBe(0);
    expect(result.listingAmount).toBe(0);
  });

  it("calculates correct platform fee cents after promo", () => {
    // Job cost $200, base fee 10%, promo 50% off service charge
    const { feePercent } = applyPromoDiscounts(10, 2.5, { serviceChargeDiscountPercent: 50, listingFeeDiscountPercent: 0 });
    const jobCostDollars = 200;
    const platformFeeCents = Math.round(jobCostDollars * (feePercent / 100) * 100);
    expect(feePercent).toBe(5); // 10% * (1 - 0.5)
    expect(platformFeeCents).toBe(1000); // $10 = 1000 cents (instead of $20 without promo)
  });

  it("calculates correct listing fee cents after promo", () => {
    // $5 listing fee, 20% promo discount → $4 effective
    const { listingAmount } = applyPromoDiscounts(10, 5, { serviceChargeDiscountPercent: 0, listingFeeDiscountPercent: 20 });
    const perListingFeeCents = Math.round(listingAmount * 100);
    expect(perListingFeeCents).toBe(400); // $4 = 400 cents
  });

  it("handles fractional fee percent correctly", () => {
    // 7% fee with 33.33% discount → ~4.667%
    const { feePercent } = applyPromoDiscounts(7, 0, { serviceChargeDiscountPercent: 33.33, listingFeeDiscountPercent: 0 });
    expect(feePercent).toBeCloseTo(4.667, 2);
  });
});

describe("Promo Code Billing Cycle Decrement Logic", () => {
  it("identifies redemptions that need decrement (active, has cycles, affects job fees)", () => {
    const redemptions = [
      { id: 1, isActive: true, cyclesRemaining: 3, affectsServiceCharge: true, affectsListingFee: false },
      { id: 2, isActive: true, cyclesRemaining: null, affectsServiceCharge: true, affectsListingFee: false }, // forever — no decrement
      { id: 3, isActive: false, cyclesRemaining: 2, affectsServiceCharge: true, affectsListingFee: false }, // inactive — skip
      { id: 4, isActive: true, cyclesRemaining: 0, affectsServiceCharge: true, affectsListingFee: false }, // already exhausted
      { id: 5, isActive: true, cyclesRemaining: 1, affectsSubscription: true, affectsServiceCharge: false, affectsListingFee: false }, // subscription only — skip for job
    ];
    const toDecrement = redemptions.filter(
      (r) =>
        r.isActive &&
        r.cyclesRemaining != null &&
        r.cyclesRemaining > 0 &&
        (r.affectsServiceCharge || r.affectsListingFee)
    );
    expect(toDecrement).toHaveLength(1);
    expect(toDecrement[0].id).toBe(1);
  });

  it("marks redemption as inactive when cycles reach zero", () => {
    const cyclesRemaining = 1;
    const newCycles = cyclesRemaining - 1;
    const isActive = newCycles > 0;
    expect(newCycles).toBe(0);
    expect(isActive).toBe(false);
  });

  it("keeps redemption active when cycles still remain", () => {
    const cyclesRemaining = 3;
    const newCycles = cyclesRemaining - 1;
    const isActive = newCycles > 0;
    expect(newCycles).toBe(2);
    expect(isActive).toBe(true);
  });
});
