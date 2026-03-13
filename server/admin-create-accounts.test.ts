import { describe, expect, it, vi, beforeEach } from "vitest";
import type { TrpcContext } from "./_core/context";

// ─── Mock db helpers ──────────────────────────────────────────────────────────
vi.mock("./db", () => ({
  getUserByEmail: vi.fn(),
  createLocalUser: vi.fn().mockResolvedValue(42),
  createCompany: vi.fn().mockResolvedValue(99),
  updateUserRole: vi.fn().mockResolvedValue(undefined),
  createContractorProfile: vi.fn().mockResolvedValue(77),
}));

// ─── Mock email helpers ───────────────────────────────────────────────────────
vi.mock("./email", () => ({
  sendAdminCreatedAccountEmail: vi.fn().mockResolvedValue(undefined),
}));

import * as db from "./db";
import * as email from "./email";
import { appRouter } from "./routers";

// ─── Admin context factory ────────────────────────────────────────────────────
function createAdminContext(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "admin-open-id",
      email: "admin@example.com",
      name: "Admin User",
      loginMethod: "local",
      role: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: {
      protocol: "https",
      headers: { origin: "https://maintenance-manager.manus.space" },
    } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────
describe("adminViewAs.adminCreateCompany", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (db.getUserByEmail as ReturnType<typeof vi.fn>).mockResolvedValue(null);
  });

  it("creates a company account and returns userId + companyId", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const result = await caller.adminViewAs.adminCreateCompany({
      companyName: "Test Corp",
      adminName: "Jane Smith",
      email: "jane@testcorp.com",
      password: "securePass1",
      sendWelcomeEmail: false,
    });

    expect(result.userId).toBe(42);
    expect(result.companyId).toBe(99);
    expect(db.createLocalUser).toHaveBeenCalledOnce();
    expect(db.createCompany).toHaveBeenCalledWith(expect.objectContaining({ name: "Test Corp", email: "jane@testcorp.com" }));
    expect(db.updateUserRole).toHaveBeenCalledWith(42, "company_admin", 99);
  });

  it("sends a welcome email when sendWelcomeEmail is true", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    await caller.adminViewAs.adminCreateCompany({
      companyName: "Email Corp",
      adminName: "Bob",
      email: "bob@emailcorp.com",
      password: "securePass2",
      sendWelcomeEmail: true,
    });

    expect(email.sendAdminCreatedAccountEmail).toHaveBeenCalledOnce();
    expect(email.sendAdminCreatedAccountEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "bob@emailcorp.com", role: "company_admin" })
    );
  });

  it("throws if the email already exists", async () => {
    (db.getUserByEmail as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 5, email: "taken@example.com" });
    const caller = appRouter.createCaller(createAdminContext());

    await expect(
      caller.adminViewAs.adminCreateCompany({
        companyName: "Dupe Corp",
        adminName: "Alice",
        email: "taken@example.com",
        password: "securePass3",
        sendWelcomeEmail: false,
      })
    ).rejects.toThrow("already exists");
  });
});

describe("adminViewAs.adminCreateContractor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (db.getUserByEmail as ReturnType<typeof vi.fn>).mockResolvedValue(null);
  });

  it("creates a contractor account and returns userId + profileId", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const result = await caller.adminViewAs.adminCreateContractor({
      name: "Mike Wrench",
      email: "mike@wrench.com",
      password: "securePass4",
      trades: ["Plumbing", "HVAC"],
      sendWelcomeEmail: false,
    });

    expect(result.userId).toBe(42);
    expect(result.profileId).toBe(77);
    expect(db.createLocalUser).toHaveBeenCalledOnce();
    expect(db.createContractorProfile).toHaveBeenCalledWith(
      expect.objectContaining({ trades: ["Plumbing", "HVAC"] })
    );
    expect(db.updateUserRole).toHaveBeenCalledWith(42, "contractor", undefined, 77);
  });

  it("sends a welcome email when sendWelcomeEmail is true", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    await caller.adminViewAs.adminCreateContractor({
      name: "Sara Fix",
      email: "sara@fix.com",
      password: "securePass5",
      sendWelcomeEmail: true,
    });

    expect(email.sendAdminCreatedAccountEmail).toHaveBeenCalledOnce();
    expect(email.sendAdminCreatedAccountEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "sara@fix.com", role: "contractor" })
    );
  });

  it("throws if the email already exists", async () => {
    (db.getUserByEmail as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 10, email: "taken@example.com" });
    const caller = appRouter.createCaller(createAdminContext());

    await expect(
      caller.adminViewAs.adminCreateContractor({
        name: "Dupe Contractor",
        email: "taken@example.com",
        password: "securePass6",
        sendWelcomeEmail: false,
      })
    ).rejects.toThrow("already exists");
  });
});
