import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { adminProcedure, router } from "../_core/trpc";
import * as db from "../db";
import * as email from "../email";
import Stripe from "stripe";
import bcrypt from "bcryptjs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "");
const SALT_ROUNDS = 12;

/**
 * Sync a plan's name/description to its Stripe Product.
 * Safe to call even if stripeProductId is null (no-op).
 */
async function syncStripeProductMeta(
  stripeProductId: string | null | undefined,
  name: string,
  description?: string | null
) {
  if (!stripeProductId) return;
  await stripe.products.update(stripeProductId, {
    name,
    ...(description != null ? { description } : {}),
  });
}

/**
 * Archive the old Stripe price and create a new one at the new amount.
 * Returns the new price ID, or null if no product is linked.
 */
async function rotateSripePrice(
  stripeProductId: string | null | undefined,
  oldPriceId: string | null | undefined,
  newAmountDollars: number,
  interval: "month" | "year"
): Promise<string | null> {
  if (!stripeProductId) return null;
  // Archive old price so it can't be used for new checkouts
  if (oldPriceId) {
    try {
      await stripe.prices.update(oldPriceId, { active: false });
    } catch {
      // ignore if already archived
    }
  }
  const newPrice = await stripe.prices.create({
    product: stripeProductId,
    unit_amount: Math.round(newAmountDollars * 100),
    currency: "usd",
    recurring: { interval },
  });
  return newPrice.id;
}

/**
 * Admin "View As" router — allows platform admin to:
 * 1. Query data as if they were a specific company or contractor
 * 2. Create test companies and contractors for testing
 */
export const adminViewAsRouter = router({
  // ─── Create Test Data ─────────────────────────────────────────────────────

  /** Create a test company directly from admin dashboard */
  createTestCompany: adminProcedure
    .input(z.object({
      name: z.string().min(1),
      address: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const companyId = await db.createCompany({
        name: input.name,
        address: input.address ?? null,
        phone: input.phone ?? null,
        email: input.email ?? null,
      });
      return { id: companyId };
    }),

  /** Create a test contractor profile directly from admin dashboard */
  createTestContractor: adminProcedure
    .input(z.object({
      businessName: z.string().min(1),
      phone: z.string().optional(),
      trades: z.array(z.string()).optional(),
      serviceAreaZips: z.array(z.string()).optional(),
      serviceRadiusMiles: z.number().optional(),
      licenseNumber: z.string().optional(),
      insuranceInfo: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Create a synthetic user record for this test contractor
      const testOpenId = `test-contractor-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      await db.upsertUser({
        openId: testOpenId,
        name: input.businessName,
        email: null,
        loginMethod: "test",
        role: "contractor",
      });
      const testUser = await db.getUserByOpenId(testOpenId);
      if (!testUser) throw new Error("Failed to create test user");

      const profileId = await db.createContractorProfile({
        userId: testUser.id,
        businessName: input.businessName ?? null,
        phone: input.phone ?? null,
        trades: input.trades ?? null,
        serviceAreaZips: input.serviceAreaZips ?? null,
        serviceRadiusMiles: input.serviceRadiusMiles ?? 25,
        licenseNumber: input.licenseNumber ?? null,
        insuranceInfo: input.insuranceInfo ?? null,
      });

      // Link the user to the contractor profile
      await db.updateUserRole(testUser.id, "contractor", undefined, profileId);

      return { id: profileId };
    }),

  // ─── Admin Direct Account Creation (no email verification required) ─────────

  /** Create a real company account with a login directly from the admin dashboard */
  adminCreateCompany: adminProcedure
    .input(z.object({
      companyName: z.string().min(1),
      adminName: z.string().min(1),
      email: z.string().email(),
      password: z.string().min(8),
      phone: z.string().optional(),
      address: z.string().optional(),
      sendWelcomeEmail: z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      const existing = await db.getUserByEmail(input.email);
      if (existing) throw new Error(`A user with email ${input.email} already exists.`);

      const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);
      const userId = await db.createLocalUser({
        name: input.adminName,
        email: input.email,
        passwordHash,
      });

      const companyId = await db.createCompany({
        name: input.companyName,
        phone: input.phone ?? null,
        address: input.address ?? null,
        email: input.email,
      });

      await db.updateUserRole(userId, "company_admin", companyId);

      if (input.sendWelcomeEmail) {
        const origin = (ctx.req as any).headers?.origin ?? "https://maintenance-manager.manus.space";
        await email.sendAdminCreatedAccountEmail({
          to: input.email,
          name: input.adminName,
          role: "company_admin",
          loginUrl: `${origin}/login`,
          temporaryPassword: input.password,
        });
      }

      return { userId, companyId };
    }),

  /** Create a real contractor account with a login directly from the admin dashboard */
  adminCreateContractor: adminProcedure
    .input(z.object({
      name: z.string().min(1),
      email: z.string().email(),
      password: z.string().min(8),
      businessName: z.string().optional(),
      phone: z.string().optional(),
      address: z.string().optional(),
      trades: z.array(z.string()).optional(),
      serviceAreaZips: z.array(z.string()).optional(),
      licenseNumber: z.string().optional(),
      sendWelcomeEmail: z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      const existing = await db.getUserByEmail(input.email);
      if (existing) throw new Error(`A user with email ${input.email} already exists.`);

      const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);
      const userId = await db.createLocalUser({
        name: input.name,
        email: input.email,
        passwordHash,
      });

      const profileId = await db.createContractorProfile({
        userId,
        businessName: input.businessName ?? null,
        phone: input.phone ?? null,
        address: input.address ?? null,
        trades: input.trades ?? null,
        serviceAreaZips: input.serviceAreaZips ?? null,
        serviceRadiusMiles: 25,
        licenseNumber: input.licenseNumber ?? null,
        insuranceInfo: null,
      });

      await db.updateUserRole(userId, "contractor", undefined, profileId);

      if (input.sendWelcomeEmail) {
        const origin = (ctx.req as any).headers?.origin ?? "https://maintenance-manager.manus.space";
        await email.sendAdminCreatedAccountEmail({
          to: input.email,
          name: input.name,
          role: "contractor",
          loginUrl: `${origin}/login`,
          temporaryPassword: input.password,
        });
      }

      return { userId, profileId };
    }),

  /** Create a test maintenance request for a company (admin can test AI classification) */
  createTestJob: adminProcedure
    .input(z.object({
      companyId: z.number(),
      propertyId: z.number(),
      title: z.string().min(1),
      description: z.string().min(1),
      tenantName: z.string().optional(),
      tenantPhone: z.string().optional(),
      tenantEmail: z.string().optional(),
      unitNumber: z.string().optional(),
      isEmergency: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const { classifyMaintenanceRequest } = await import("../ai-classify");

      const id = await db.createMaintenanceRequest({
        companyId: input.companyId,
        propertyId: input.propertyId,
        title: input.title,
        description: input.description,
        tenantName: input.tenantName ?? null,
        tenantPhone: input.tenantPhone ?? null,
        tenantEmail: input.tenantEmail ?? null,
        unitNumber: input.unitNumber ?? null,
        isEmergency: input.isEmergency ?? false,
      });

      // AI classification
      try {
        const tiers = await db.getSkillTiers(input.companyId);
        if (tiers.length > 0) {
          const classification = await classifyMaintenanceRequest(input.title, input.description, tiers);
          const matchedTier = tiers.find(t => t.name.toLowerCase() === classification.skillTierName.toLowerCase());
          await db.updateMaintenanceRequest(id, {
            aiPriority: classification.priority,
            aiSkillTier: classification.skillTierName,
            aiSkillTierId: matchedTier?.id ?? null,
            aiReasoning: classification.reasoning,
            aiClassifiedAt: new Date(),
            skillTierId: matchedTier?.id ?? null,
            hourlyRate: matchedTier?.hourlyRate ?? null,
            isEmergency: classification.priority === "emergency",
          });
        }
      } catch (err) {
        console.error("[AI Classification] Failed:", err);
      }

      return { id };
    }),

  /** Link a contractor to a company */
  linkContractorToCompany: adminProcedure
    .input(z.object({
      contractorProfileId: z.number(),
      companyId: z.number(),
    }))
    .mutation(async ({ input }) => {
      const id = await db.createContractorCompanyRelation({
        contractorProfileId: input.contractorProfileId,
        companyId: input.companyId,
        invitedBy: "company",
        status: "approved" as any,
      });
      return { id };
    }),

  // ─── Company Impersonation Queries ────────────────────────────────────────

  companyDashboard: adminProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      return db.getCompanyDashboardStats(input.companyId);
    }),

  companyDetails: adminProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      return db.getCompanyById(input.companyId);
    }),

  companyProperties: adminProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      return db.listProperties(input.companyId);
    }),

  companyJobs: adminProcedure
    .input(z.object({ companyId: z.number(), status: z.union([z.string(), z.array(z.string())]).optional() }))
    .query(async ({ input }) => {
      return db.listMaintenanceRequests(input.companyId, input.status);
    }),

  companyContractors: adminProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      return db.listContractorsByCompany(input.companyId);
    }),

  companyScorecards: adminProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      return db.getContractorScorecardsByCompany(input.companyId);
    }),

  companySettings: adminProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      return db.getCompanySettings(input.companyId);
    }),

  companySkillTiers: adminProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      return db.getSkillTiers(input.companyId);
    }),

  companyIntegrations: adminProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      return db.getIntegrationConnectors(input.companyId);
    }),

  /** Create a property for a company (admin impersonation) */
  createProperty: adminProcedure
    .input(z.object({
      companyId: z.number(),
      name: z.string().min(1),
      address: z.string().min(1),
      city: z.string().optional(),
      state: z.string().optional(),
      zipCode: z.string().optional(),
      units: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const { companyId, ...rest } = input;
      const id = await db.createProperty({ companyId, ...rest });
      return { id };
    }),

  // ─── Contractor Impersonation Queries ─────────────────────────────────────

  allContractors: adminProcedure.query(async () => {
    return db.listAllContractors();
  }),

  contractorJobs: adminProcedure
    .input(z.object({ contractorProfileId: z.number() }))
    .query(async ({ input }) => {
      return db.getContractorAssignedJobs(input.contractorProfileId);
    }),

  contractorAvailableJobs: adminProcedure
    .input(z.object({ contractorProfileId: z.number() }))
    .query(async ({ input }) => {
      return db.getJobsForContractor(input.contractorProfileId);
    }),

  contractorProfile: adminProcedure
    .input(z.object({ contractorProfileId: z.number() }))
    .query(async ({ input }) => {
      return db.getContractorProfileById(input.contractorProfileId);
    }),

  // ─── Admin: Edit/Delete Companies ────────────────────────────────────────
  updateCompany: adminProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().optional(),
      address: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      await db.updateCompany(id, data);
      return { success: true };
    }),

  deleteCompany: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.deleteCompany(input.id);
      return { success: true };
    }),

  // ─── Admin: Edit/Delete Contractors ──────────────────────────────────────
  updateContractor: adminProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().optional(),
      email: z.string().optional(),
      address: z.string().optional(),
      businessName: z.string().optional(),
      phone: z.string().optional(),
      trades: z.array(z.string()).optional(),
      serviceAreaZips: z.array(z.string()).optional(),
      serviceRadiusMiles: z.number().optional(),
      licenseNumber: z.string().optional(),
      insuranceInfo: z.string().optional(),
      isAvailable: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, name, email, ...profileData } = input;
      await db.adminUpdateContractorProfile(id, profileData as any);
      if (name !== undefined || email !== undefined) {
        const userId = await db.getUserIdByContractorProfileId(id);
        if (userId) {
          await db.updateUserName(userId, name ?? "");
        }
      }
      return { success: true };
    }),

  deleteContractor: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.deleteContractorProfile(input.id);
      return { success: true };
    }),

  // Reset onboarding checklist for a contractor (for testing / support)
  resetContractorOnboarding: adminProcedure
    .input(z.object({ contractorProfileId: z.number() }))
    .mutation(async ({ input }) => {
      await db.updateContractorProfile(input.contractorProfileId, {
        onboardingDismissedSteps: [] as any,
        onboardingCompletedAt: null as any,
      } as any);
      return { success: true };
    }),

  // ─── Subscription Plans CRUD ──────────────────────────────────────────────
  listPlans: adminProcedure.query(async () => {
    const [plans, subscriberCounts] = await Promise.all([
      db.listSubscriptionPlans(),
      db.countSubscribersPerPlan(),
    ]);
    return plans.map(plan => ({
      ...plan,
      subscriberCount: subscriberCounts[plan.id]?.total ?? 0,
      subscriberBreakdown: subscriberCounts[plan.id] ?? { companies: 0, contractors: 0, total: 0 },
    }));
  }),

  createPlan: adminProcedure
    .input(z.object({
      name: z.string().min(1),
      description: z.string().optional(),
      planType: z.enum(["company", "contractor"]).default("company"),
      priceMonthly: z.number().min(0),
      priceAnnual: z.number().min(0),
      isActive: z.boolean().default(true),
      sortOrder: z.number().default(0),
      // Fee settings
      platformFeePercent: z.number().min(0).max(100).nullable().optional(),
      perListingFeeEnabled: z.boolean().default(false),
      perListingFeeAmount: z.number().min(0).default(0),
      earlyNotificationMinutes: z.number().min(0).default(0),
      features: z.object({
        maxProperties: z.number().nullable().optional(),
        maxContractors: z.number().nullable().optional(),
        maxJobsPerMonth: z.number().nullable().optional(),
        gpsTimeTracking: z.boolean().optional(),
        aiJobClassification: z.boolean().optional(),
        expenseReports: z.boolean().optional(),
        contractorRatings: z.boolean().optional(),
        jobComments: z.boolean().optional(),
        emailNotifications: z.boolean().optional(),
        billingHistory: z.boolean().optional(),
        apiAccess: z.boolean().optional(),
        customBranding: z.boolean().optional(),
        prioritySupport: z.boolean().optional(),
      }).optional(),
    }))
    .mutation(async ({ input }) => {
      // Auto-create Stripe product + prices when priceMonthly > 0
      let stripeProductId: string | null = null;
      let stripePriceIdMonthly: string | null = null;
      let stripePriceIdAnnual: string | null = null;

      if (input.priceMonthly > 0) {
        const product = await stripe.products.create({
          name: input.name,
          ...(input.description ? { description: input.description } : {}),
          metadata: { planType: input.planType, source: "maintenance-manager" },
        });
        stripeProductId = product.id;

        const monthlyPrice = await stripe.prices.create({
          product: stripeProductId,
          unit_amount: Math.round(input.priceMonthly * 100),
          currency: "usd",
          recurring: { interval: "month" },
        });
        stripePriceIdMonthly = monthlyPrice.id;

        if (input.priceAnnual > 0) {
          const annualPrice = await stripe.prices.create({
            product: stripeProductId,
            unit_amount: Math.round(input.priceAnnual * 100),
            currency: "usd",
            recurring: { interval: "year" },
          });
          stripePriceIdAnnual = annualPrice.id;
        }
      }

      const id = await db.createSubscriptionPlan({
        name: input.name,
        description: input.description ?? null,
        planType: input.planType,
        priceMonthly: String(input.priceMonthly),
        priceAnnual: String(input.priceAnnual),
        isActive: input.isActive,
        sortOrder: input.sortOrder,
        features: input.features ?? {},
        platformFeePercent: input.platformFeePercent != null ? String(input.platformFeePercent) : null,
        perListingFeeEnabled: input.perListingFeeEnabled,
        perListingFeeAmount: String(input.perListingFeeAmount),
        earlyNotificationMinutes: input.earlyNotificationMinutes,
        stripeProductId,
        stripePriceIdMonthly,
        stripePriceIdAnnual,
      });
      return { id, stripeProductId, stripePriceIdMonthly, stripePriceIdAnnual };
    }),

  updatePlan: adminProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).optional(),
      description: z.string().optional(),
      priceMonthly: z.number().min(0).optional(),
      priceAnnual: z.number().min(0).optional(),
      isActive: z.boolean().optional(),
      sortOrder: z.number().optional(),
      // Fee settings
      platformFeePercent: z.number().min(0).max(100).nullable().optional(),
      perListingFeeEnabled: z.boolean().optional(),
      perListingFeeAmount: z.number().min(0).optional(),
      earlyNotificationMinutes: z.number().min(0).optional(),
      features: z.object({
        maxProperties: z.number().nullable().optional(),
        maxContractors: z.number().nullable().optional(),
        maxJobsPerMonth: z.number().nullable().optional(),
        gpsTimeTracking: z.boolean().optional(),
        aiJobClassification: z.boolean().optional(),
        expenseReports: z.boolean().optional(),
        contractorRatings: z.boolean().optional(),
        jobComments: z.boolean().optional(),
        emailNotifications: z.boolean().optional(),
        billingHistory: z.boolean().optional(),
        apiAccess: z.boolean().optional(),
        customBranding: z.boolean().optional(),
        prioritySupport: z.boolean().optional(),
      }).optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, priceMonthly, priceAnnual, platformFeePercent, perListingFeeAmount, ...rest } = input;

      // Fetch current plan to compare prices and get stripeProductId
      const plans = await db.listSubscriptionPlans();
      const current = plans.find(p => p.id === id);

      const dbUpdate: Record<string, unknown> = { ...rest };

      // ── Name / description → sync to Stripe product ──────────────────────
      if ((rest.name || rest.description !== undefined) && current?.stripeProductId) {
        await syncStripeProductMeta(
          current.stripeProductId,
          rest.name ?? current.name,
          rest.description !== undefined ? rest.description : current.description
        );
      }

      // ── isActive toggle → archive/unarchive Stripe product ───────────────
      if (rest.isActive !== undefined && current?.stripeProductId) {
        try {
          await stripe.products.update(current.stripeProductId, { active: rest.isActive });
        } catch {
          // ignore — product may not exist in Stripe yet
        }
      }

      // ── Monthly price changed → archive old price, create new one ─────────
      if (priceMonthly !== undefined) {
        dbUpdate.priceMonthly = String(priceMonthly);
        const currentMonthly = parseFloat(current?.priceMonthly ?? "0");
        if (current?.stripeProductId && priceMonthly !== currentMonthly) {
          const newPriceId = await rotateSripePrice(
            current.stripeProductId,
            current.stripePriceIdMonthly,
            priceMonthly,
            "month"
          );
          if (newPriceId) dbUpdate.stripePriceIdMonthly = newPriceId;
        }
      }

      // ── Annual price changed → archive old price, create new one ──────────
      if (priceAnnual !== undefined) {
        dbUpdate.priceAnnual = String(priceAnnual);
        const currentAnnual = parseFloat(current?.priceAnnual ?? "0");
        if (current?.stripeProductId && priceAnnual !== currentAnnual) {
          const newPriceId = await rotateSripePrice(
            current.stripeProductId,
            current.stripePriceIdAnnual,
            priceAnnual,
            "year"
          );
          if (newPriceId) dbUpdate.stripePriceIdAnnual = newPriceId;
        }
      }

      if (platformFeePercent !== undefined) {
        dbUpdate.platformFeePercent = platformFeePercent != null ? String(platformFeePercent) : null;
      }
      if (perListingFeeAmount !== undefined) {
        dbUpdate.perListingFeeAmount = String(perListingFeeAmount);
      }

      await db.updateSubscriptionPlan(id, dbUpdate as any);
      return { success: true };
    }),

  deletePlan: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      // Block deletion if plan has active subscribers
      const subscriberCounts = await db.countSubscribersPerPlan();
      const count = subscriberCounts[input.id]?.total ?? 0;
      if (count > 0) {
        const breakdown = subscriberCounts[input.id];
        const parts: string[] = [];
        if (breakdown.companies > 0) parts.push(`${breakdown.companies} company${breakdown.companies !== 1 ? " accounts" : " account"}`);
        if (breakdown.contractors > 0) parts.push(`${breakdown.contractors} contractor${breakdown.contractors !== 1 ? "s" : ""}`);
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot delete this plan — it has ${parts.join(" and ")} subscribed. Reassign them to another plan first.`,
        });
      }
      await db.deleteSubscriptionPlan(input.id);
      return { success: true };
    }),

  // ─── Assign Plan to Company ───────────────────────────────────────────────
  assignCompanyPlan: adminProcedure
    .input(z.object({
      companyId: z.number(),
      planId: z.number().nullable(),
      planPriceOverride: z.number().nullable().optional(),
      planNotes: z.string().nullable().optional(),
      // aliases used by shared dialog components
      priceOverride: z.number().nullable().optional(),
      notes: z.string().nullable().optional(),
    }))
    .mutation(async ({ input }) => {
      const now = Date.now();
      const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;
      const resolvedPrice = input.planPriceOverride ?? input.priceOverride ?? null;
      const resolvedNotes = input.planNotes ?? input.notes ?? null;
      const updateData: Record<string, unknown> = {
        planId: input.planId,
        planNotes: resolvedNotes,
      };
      if (resolvedPrice != null) {
        updateData.planPriceOverride = String(resolvedPrice);
      } else {
        updateData.planPriceOverride = null;
      }
      if (input.planId != null) {
        // Manual admin assignment → start a 14-day trial (no Stripe subscription yet)
        updateData.planStatus = "trialing";
        updateData.planAssignedAt = now;
        updateData.planExpiresAt = now + FOURTEEN_DAYS_MS;
      } else {
        // Removing plan
        updateData.planStatus = "trialing";
        updateData.planAssignedAt = null;
        updateData.planExpiresAt = null;
      }
      await db.updateCompany(input.companyId, updateData as any);
      return { success: true };
    }),

  // Get company with plan info
  companyWithPlan: adminProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      return db.getCompanyWithPlan(input.companyId);
    }),

  // List companies with their plans
  companiesWithPlans: adminProcedure.query(async () => {
    return db.listCompaniesWithPlans();
  }),

  // ─── Filtered plan lists by type ─────────────────────────────────────────
  listCompanyPlans: adminProcedure.query(async () => {
    const [plans, subscriberCounts] = await Promise.all([
      db.listSubscriptionPlansByType("company"),
      db.countSubscribersPerPlan(),
    ]);
    return plans.map(plan => ({
      ...plan,
      subscriberCount: subscriberCounts[plan.id]?.total ?? 0,
      subscriberBreakdown: subscriberCounts[plan.id] ?? { companies: 0, contractors: 0, total: 0 },
    }));
  }),
  listContractorPlans: adminProcedure.query(async () => {
    const [plans, subscriberCounts] = await Promise.all([
      db.listSubscriptionPlansByType("contractor"),
      db.countSubscribersPerPlan(),
    ]);
    return plans.map(plan => ({
      ...plan,
      subscriberCount: subscriberCounts[plan.id]?.total ?? 0,
      subscriberBreakdown: subscriberCounts[plan.id] ?? { companies: 0, contractors: 0, total: 0 },
    }));
  }),

  // ─── Assign Plan to Contractor ────────────────────────────────────────────
  assignContractorPlan: adminProcedure
    .input(z.object({
      contractorProfileId: z.number().optional(),
      contractorId: z.number().optional(), // alias used by shared dialog
      planId: z.number().nullable(),
      planPriceOverride: z.number().nullable().optional(),
      planNotes: z.string().nullable().optional(),
      // aliases used by shared dialog components
      priceOverride: z.number().nullable().optional(),
      notes: z.string().nullable().optional(),
    }))
    .mutation(async ({ input }) => {
      const resolvedContractorId = input.contractorProfileId ?? input.contractorId;
      if (!resolvedContractorId) throw new TRPCError({ code: "BAD_REQUEST", message: "contractorProfileId or contractorId required" });
      const now = Date.now();
      const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;
      const resolvedPrice2 = input.planPriceOverride ?? input.priceOverride ?? null;
      const resolvedNotes2 = input.planNotes ?? input.notes ?? null;
      const priceOverride = resolvedPrice2 != null ? String(resolvedPrice2) : null;
      const planStatus = input.planId != null ? "trialing" : "trialing";
      const planAssignedAt = input.planId != null ? now : null;
      const planExpiresAt = input.planId != null ? now + FOURTEEN_DAYS_MS : null;
      await db.assignContractorPlan(
        resolvedContractorId,
        input.planId,
        priceOverride,
        resolvedNotes2,
        planStatus,
        planAssignedAt,
        planExpiresAt
      );
      return { success: true };
    }),

  // Get contractor with plan info
  contractorWithPlan: adminProcedure
    .input(z.object({ contractorProfileId: z.number() }))
    .query(async ({ input }) => {
      const profile = await db.getContractorProfileById(input.contractorProfileId);
      if (!profile) return null;
      const plan = await db.getEffectivePlanForContractor(input.contractorProfileId);
      return { profile, plan };
    }),

  // ─── Trial Expiry Check ───────────────────────────────────────────────────
  /** Run trial expiry check: send 3-day warnings and expire overdue trials */
  runTrialExpiryCheck: adminProcedure
    .mutation(async ({ ctx }) => {
      const origin = (ctx.req.headers.origin as string) || "";
      const results = { warned: 0, expired: 0, errors: [] as string[] };

      // 3-day warning for companies
      const companiesWarning = await db.getCompaniesExpiringInDays(3);
      for (const c of companiesWarning) {
        try {
          const planRow = c.planId ? await db.getSubscriptionPlanById(c.planId) : null;
          const planName = planRow?.name ?? "your plan";
          const daysLeft = c.planExpiresAt ? Math.max(1, Math.ceil((c.planExpiresAt - Date.now()) / (24 * 60 * 60 * 1000))) : 3;
          await email.sendTrialExpiryWarningEmail({
            to: c.userEmail,
            name: c.userName ?? c.companyName ?? "there",
            planName,
            daysRemaining: daysLeft,
            billingUrl: `${origin}/company/billing`,
          } as any);
          results.warned++;
        } catch (e: any) { results.errors.push(`company ${c.companyId}: ${e.message}`); }
      }

      // 3-day warning for contractors
      const contractorsWarning = await db.getContractorsExpiringInDays(3);
      for (const c of contractorsWarning) {
        try {
          const planRow = c.planId ? await db.getSubscriptionPlanById(c.planId) : null;
          const planName = planRow?.name ?? "your plan";
          const daysLeft = c.planExpiresAt ? Math.max(1, Math.ceil((c.planExpiresAt - Date.now()) / (24 * 60 * 60 * 1000))) : 3;
          await email.sendTrialExpiryWarningEmail({
            to: c.userEmail,
            name: c.userName ?? c.contractorName ?? "there",
            planName,
            daysRemaining: daysLeft,
            billingUrl: `${origin}/contractor/billing`,
          } as any);
          results.warned++;
        } catch (e: any) { results.errors.push(`contractor ${c.contractorProfileId}: ${e.message}`); }
      }

      // Expire overdue company trials
      const expiredCompanies = await db.getExpiredTrialCompanies();
      for (const c of expiredCompanies) {
        try {
          const planRow = c.planId ? await db.getSubscriptionPlanById(c.planId) : null;
          const planName = planRow?.name ?? "your plan";
          await db.markCompanyPlanExpired(c.companyId);
          await email.sendTrialExpiredEmail({
            to: c.userEmail,
            name: c.userName ?? c.companyName ?? "there",
            planName,
            billingUrl: `${origin}/company/billing`,
          } as any);
          results.expired++;
        } catch (e: any) { results.errors.push(`company expired ${c.companyId}: ${e.message}`); }
      }

      // Expire overdue contractor trials
      const expiredContractors = await db.getExpiredTrialContractors();
      for (const c of expiredContractors) {
        try {
          const planRow = c.planId ? await db.getSubscriptionPlanById(c.planId) : null;
          const planName = planRow?.name ?? "your plan";
          await db.markContractorPlanExpired(c.contractorProfileId);
          await email.sendTrialExpiredEmail({
            to: c.userEmail,
            name: c.userName ?? c.contractorName ?? "there",
            planName,
            billingUrl: `${origin}/contractor/billing`,
          } as any);
          results.expired++;
        } catch (e: any) { results.errors.push(`contractor expired ${c.contractorProfileId}: ${e.message}`); }
      }

      return results;
    }),

  // ─── Plan Distribution Analytics ────────────────────────────────────────────
  getPlanDistribution: adminProcedure
    .query(async () => {
      return db.getPlanDistributionStats();
    }),

  // ─── Subscriber Migration Tool ────────────────────────────────────────────
  /** Move all active subscribers from one plan to another (companies or contractors). */
  migrateSubscribers: adminProcedure
    .input(z.object({
      fromPlanId: z.number(),
      toPlanId: z.number(),
      planType: z.enum(["company", "contractor"]),
    }))
    .mutation(async ({ input }) => {
      const { fromPlanId, toPlanId, planType } = input;
      const toPlan = await db.getSubscriptionPlanById(toPlanId);
      if (!toPlan) throw new Error("Target plan not found");

      let movedCount = 0;
      const errors: string[] = [];

      if (planType === "company") {
        const subs = await db.getCompaniesByPlanId(fromPlanId);
        for (const company of subs) {
          try {
            // Update Stripe subscription to new price if both plans have Stripe prices
            if (company.stripeSubscriptionId && toPlan.stripePriceIdMonthly) {
              const stripeSub = await stripe.subscriptions.retrieve(company.stripeSubscriptionId);
              const item = stripeSub.items.data[0];
              if (item) {
                await stripe.subscriptions.update(company.stripeSubscriptionId, {
                  items: [{ id: item.id, price: toPlan.stripePriceIdMonthly }],
                  proration_behavior: "none",
                });
              }
            }
            await db.updateCompany(company.id, { planId: toPlanId });
            movedCount++;
          } catch (e: any) {
            errors.push(`company ${company.id}: ${e.message}`);
          }
        }
      } else {
        const subs = await db.getContractorsByPlanId(fromPlanId);
        for (const contractor of subs) {
          try {
            if (contractor.stripeSubscriptionId && toPlan.stripePriceIdMonthly) {
              const stripeSub = await stripe.subscriptions.retrieve(contractor.stripeSubscriptionId);
              const item = stripeSub.items.data[0];
              if (item) {
                await stripe.subscriptions.update(contractor.stripeSubscriptionId, {
                  items: [{ id: item.id, price: toPlan.stripePriceIdMonthly }],
                  proration_behavior: "none",
                });
              }
            }
            await db.assignContractorPlan(contractor.id, toPlanId, null, null, contractor.planStatus ?? "active");
            movedCount++;
          } catch (e: any) {
            errors.push(`contractor ${contractor.id}: ${e.message}`);
          }
        }
      }

      return { movedCount, errors };
    }),

  /**
   * Manually extend the trial for a specific company or contractor.
   * Adds `days` days to the current planExpiresAt (or from now if already expired).
   */
  extendTrial: adminProcedure
    .input(z.object({
      entityType: z.enum(["company", "contractor"]),
      entityId: z.number(),
      days: z.number().min(1).max(365),
    }))
    .mutation(async ({ input }) => {
      const { entityType, entityId, days } = input;
      const extensionMs = days * 24 * 60 * 60 * 1000;

      if (entityType === "company") {
        const company = await db.getCompanyById(entityId);
        if (!company) throw new TRPCError({ code: "NOT_FOUND", message: "Company not found" });
        const baseMs = (company.planExpiresAt && company.planExpiresAt > Date.now())
          ? company.planExpiresAt
          : Date.now();
        const newExpiresAt = baseMs + extensionMs;
        await db.updateCompany(entityId, {
          planExpiresAt: newExpiresAt,
          planStatus: "trialing",
          planGraceEndsAt: null,
        } as any);
        return { success: true, newExpiresAt };
      } else {
        const profile = await db.getContractorProfileById(entityId);
        if (!profile) throw new TRPCError({ code: "NOT_FOUND", message: "Contractor not found" });
        const baseMs = (profile.planExpiresAt && profile.planExpiresAt > Date.now())
          ? profile.planExpiresAt
          : Date.now();
        const newExpiresAt = baseMs + extensionMs;
        await db.updateContractorProfile(entityId, {
          planExpiresAt: newExpiresAt,
          planStatus: "trialing",
          planGraceEndsAt: null,
        } as any);
        return { success: true, newExpiresAt };
      }
    }),

  /**
   * Grant a free plan (no expiry) to a specific company or contractor.
   * Sets planStatus to "active" with no planExpiresAt.
   */
  grantFreePlan: adminProcedure
    .input(z.object({
      entityType: z.enum(["company", "contractor"]),
      entityId: z.number(),
      planId: z.number().optional(), // optional: assign a specific plan, else keep current
    }))
    .mutation(async ({ input }) => {
      const { entityType, entityId, planId } = input;

      if (entityType === "company") {
        const company = await db.getCompanyById(entityId);
        if (!company) throw new TRPCError({ code: "NOT_FOUND", message: "Company not found" });
        await db.updateCompany(entityId, {
          planStatus: "active",
          planExpiresAt: null,
          planGraceEndsAt: null,
          ...(planId ? { planId } : {}),
        } as any);
        return { success: true };
      } else {
        const profile = await db.getContractorProfileById(entityId);
        if (!profile) throw new TRPCError({ code: "NOT_FOUND", message: "Contractor not found" });
        await db.updateContractorProfile(entityId, {
          planStatus: "active",
          planExpiresAt: null,
          planGraceEndsAt: null,
          ...(planId ? { planId } : {}),
        } as any);
        return { success: true };
      }
    }),

  // ─── Company Fee Override (used by shared ManageCompanyDialog) ────────────────────────
  getCompanyFeeOverride: adminProcedure
    .input(z.object({ companyId: z.number().optional() }))
    .query(async ({ input }) => {
      if (!input.companyId) return null;
      const company = await db.getCompanyById(input.companyId);
      if (!company) return null;
      const plan = company.planId ? await db.getSubscriptionPlanById(company.planId) : null;
      return {
        company: {
          feeOverridePercent: (company as any).feeOverridePercent ?? null,
          feeOverridePerListingEnabled: (company as any).feeOverridePerListingEnabled ?? false,
          feeOverridePerListingAmount: (company as any).feeOverridePerListingAmount ?? null,
        },
        plan: plan ? {
          feePercent: plan.platformFeePercent ?? null,
          perListingFeeEnabled: plan.perListingFeeEnabled ?? false,
          perListingFeeAmount: plan.perListingFeeAmount ?? null,
        } : null,
      };
    }),

  setCompanyFeeOverride: adminProcedure
    .input(z.object({
      companyId: z.number(),
      feePercent: z.number().nullable(),
      perListingEnabled: z.boolean(),
      perListingAmount: z.number().nullable(),
    }))
    .mutation(async ({ input }) => {
      await db.updateCompany(input.companyId, {
        feeOverridePercent: input.feePercent != null ? String(input.feePercent) : null,
        feeOverridePerListingEnabled: input.perListingEnabled,
        feeOverridePerListingAmount: input.perListingAmount != null ? String(input.perListingAmount) : "0.00",
      } as any);
      return { success: true };
    }),
});