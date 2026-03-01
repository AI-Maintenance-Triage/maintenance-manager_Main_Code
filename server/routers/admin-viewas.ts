import { z } from "zod";
import { adminProcedure, router } from "../_core/trpc";
import * as db from "../db";

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
      const { id, ...data } = input;
      await db.adminUpdateContractorProfile(id, data);
      return { success: true };
    }),

  deleteContractor: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.deleteContractorProfile(input.id);
      return { success: true };
    }),

  // ─── Subscription Plans CRUD ──────────────────────────────────────────────
  listPlans: adminProcedure.query(async () => {
    return db.listSubscriptionPlans();
  }),

  createPlan: adminProcedure
    .input(z.object({
      name: z.string().min(1),
      description: z.string().optional(),
      priceMonthly: z.number().min(0),
      priceAnnual: z.number().min(0),
      isActive: z.boolean().default(true),
      sortOrder: z.number().default(0),
      // Fee settings
      platformFeePercent: z.number().min(0).max(100).nullable().optional(),
      perListingFeeEnabled: z.boolean().default(false),
      perListingFeeAmount: z.number().min(0).default(0),
      // Stripe Price IDs
      stripePriceIdMonthly: z.string().nullable().optional(),
      stripePriceIdAnnual: z.string().nullable().optional(),
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
      const id = await db.createSubscriptionPlan({
        name: input.name,
        description: input.description ?? null,
        priceMonthly: String(input.priceMonthly),
        priceAnnual: String(input.priceAnnual),
        isActive: input.isActive,
        sortOrder: input.sortOrder,
        features: input.features ?? {},
        platformFeePercent: input.platformFeePercent != null ? String(input.platformFeePercent) : null,
        perListingFeeEnabled: input.perListingFeeEnabled,
        perListingFeeAmount: String(input.perListingFeeAmount),
        stripePriceIdMonthly: input.stripePriceIdMonthly ?? null,
        stripePriceIdAnnual: input.stripePriceIdAnnual ?? null,
      });
      return { id };
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
      // Stripe Price IDs
      stripePriceIdMonthly: z.string().nullable().optional(),
      stripePriceIdAnnual: z.string().nullable().optional(),
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
      const { id, priceMonthly, priceAnnual, platformFeePercent, perListingFeeAmount, stripePriceIdMonthly, stripePriceIdAnnual, ...rest } = input;
      await db.updateSubscriptionPlan(id, {
        ...rest,
        ...(priceMonthly !== undefined ? { priceMonthly: String(priceMonthly) } : {}),
        ...(priceAnnual !== undefined ? { priceAnnual: String(priceAnnual) } : {}),
        ...(platformFeePercent !== undefined ? { platformFeePercent: platformFeePercent != null ? String(platformFeePercent) : null } : {}),
        ...(perListingFeeAmount !== undefined ? { perListingFeeAmount: String(perListingFeeAmount) } : {}),
        ...(stripePriceIdMonthly !== undefined ? { stripePriceIdMonthly: stripePriceIdMonthly ?? null } : {}),
        ...(stripePriceIdAnnual !== undefined ? { stripePriceIdAnnual: stripePriceIdAnnual ?? null } : {}),
      });
      return { success: true };
    }),

  deletePlan: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.deleteSubscriptionPlan(input.id);
      return { success: true };
    }),

  // ─── Assign Plan to Company ───────────────────────────────────────────────
  assignCompanyPlan: adminProcedure
    .input(z.object({
      companyId: z.number(),
      planId: z.number().nullable(),
      planPriceOverride: z.number().nullable().optional(),
      planNotes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const now = Date.now();
      const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;
      const updateData: Record<string, unknown> = {
        planId: input.planId,
        planNotes: input.planNotes ?? null,
      };
      if (input.planPriceOverride != null) {
        updateData.planPriceOverride = String(input.planPriceOverride);
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
    return db.listSubscriptionPlansByType("company");
  }),
  listContractorPlans: adminProcedure.query(async () => {
    return db.listSubscriptionPlansByType("contractor");
  }),

  // ─── Assign Plan to Contractor ────────────────────────────────────────────
  assignContractorPlan: adminProcedure
    .input(z.object({
      contractorProfileId: z.number(),
      planId: z.number().nullable(),
      planPriceOverride: z.number().nullable().optional(),
      planNotes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const now = Date.now();
      const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;
      const priceOverride = input.planPriceOverride != null ? String(input.planPriceOverride) : null;
      const planStatus = input.planId != null ? "trialing" : "trialing";
      const planAssignedAt = input.planId != null ? now : null;
      const planExpiresAt = input.planId != null ? now + FOURTEEN_DAYS_MS : null;
      await db.assignContractorPlan(
        input.contractorProfileId,
        input.planId,
        priceOverride,
        input.planNotes ?? null,
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
});
