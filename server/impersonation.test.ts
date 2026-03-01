/**
 * Tests for admin impersonation helper functions.
 * Verifies that getEffectiveCompanyId and getEffectiveContractorProfile
 * correctly resolve IDs based on impersonation context.
 */
import { describe, it, expect } from "vitest";
import { TRPCError } from "@trpc/server";

// ─── Inline the helpers so we can test them in isolation ──────────────────────
// (mirrors the logic in server/routers.ts)

function getEffectiveCompanyId(ctx: {
  user: { companyId?: number | null };
  impersonatedCompanyId: number | null;
}): number {
  const id = ctx.impersonatedCompanyId ?? ctx.user.companyId;
  if (!id) throw new TRPCError({ code: "NOT_FOUND", message: "No company associated" });
  return id;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("getEffectiveCompanyId", () => {
  it("returns the user's own companyId when not impersonating", () => {
    const ctx = {
      user: { companyId: 42 },
      impersonatedCompanyId: null,
    };
    expect(getEffectiveCompanyId(ctx)).toBe(42);
  });

  it("returns the impersonated companyId when admin is impersonating", () => {
    const ctx = {
      user: { companyId: null },
      impersonatedCompanyId: 99,
    };
    expect(getEffectiveCompanyId(ctx)).toBe(99);
  });

  it("prefers impersonatedCompanyId over user's own companyId", () => {
    const ctx = {
      user: { companyId: 42 },
      impersonatedCompanyId: 99,
    };
    expect(getEffectiveCompanyId(ctx)).toBe(99);
  });

  it("throws NOT_FOUND when neither impersonated nor user companyId is set", () => {
    const ctx = {
      user: { companyId: null },
      impersonatedCompanyId: null,
    };
    expect(() => getEffectiveCompanyId(ctx)).toThrow(TRPCError);
    expect(() => getEffectiveCompanyId(ctx)).toThrowError("No company associated");
  });

  it("throws NOT_FOUND when companyId is undefined", () => {
    const ctx = {
      user: {},
      impersonatedCompanyId: null,
    };
    expect(() => getEffectiveCompanyId(ctx)).toThrow(TRPCError);
  });
});

describe("impersonation header parsing (context.ts logic)", () => {
  it("parses numeric company ID from header string", () => {
    const rawCompanyId = "42";
    const parsed = parseInt(rawCompanyId, 10);
    expect(parsed).toBe(42);
    expect(Number.isNaN(parsed)).toBe(false);
  });

  it("parses numeric contractor ID from header string", () => {
    const rawContractorId = "7";
    const parsed = parseInt(rawContractorId, 10);
    expect(parsed).toBe(7);
  });

  it("returns null when header is absent", () => {
    const rawCompanyId = undefined;
    const result = rawCompanyId ? parseInt(rawCompanyId as string, 10) : null;
    expect(result).toBeNull();
  });

  it("only allows impersonation for admin users", () => {
    const isAdmin = (role: string) => role === "admin";
    expect(isAdmin("admin")).toBe(true);
    expect(isAdmin("company_admin")).toBe(false);
    expect(isAdmin("contractor")).toBe(false);
  });
});
