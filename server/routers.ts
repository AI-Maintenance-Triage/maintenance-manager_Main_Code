import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, adminProcedure, router } from "./_core/trpc";
import * as db from "./db";
import type { ContractorProfile } from "../drizzle/schema";
import { classifyMaintenanceRequest } from "./ai-classify";
import { notifyOwner } from "./_core/notification";
import * as email from "./email";
import { ENV } from "./_core/env";
import { adminViewAsRouter } from "./routers/admin-viewas";
import { teamRouter } from "./routers/team";
import { SUPPORTED_PROVIDERS, getAdapter, encodeCredentials, decodeCredentials, runPmsSync, notifyPmsJobComplete, notifyPmsJobReopen } from "./pms/index";
import {
  stripe,
  getPlatformSettings,
  createContractorConnectAccount,
  createContractorOnboardingLink,
  getOrCreateStripeCustomer,
  createSetupIntent,
  createBankAccountSetupIntent,
  listAllPaymentMethods,
  setDefaultPaymentMethod,
  detachPaymentMethod,
  chargeJobAndPayContractor,
} from "./stripe";

/// ─── Middleware: require company_admin role ─────────────────────────────────
const companyAdminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "company_admin" && ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Company admin access required" });
  }
  return next({ ctx });
});
const contractorProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "contractor" && ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Contractor access required" });
  }
  return next({ ctx });
});
// ─── Impersonation Helpers ──────────────────────────────────────────────────
// Returns the effective companyId: uses impersonated ID when admin is impersonating,
// otherwise falls back to the user's own companyId.
function getEffectiveCompanyId(ctx: { user: { companyId?: number | null }; impersonatedCompanyId: number | null }): number {
  const id = ctx.impersonatedCompanyId ?? ctx.user.companyId;
  if (!id) throw new TRPCError({ code: "NOT_FOUND", message: "No company associated" });
  return id;
}
// Returns the effective contractor profile: uses impersonated profile when admin is
// impersonating, otherwise looks up by ctx.user.id.
async function getEffectiveContractorProfile(
  ctx: { user: { id: number }; impersonatedContractorProfileId: number | null }
): Promise<ContractorProfile> {
  if (ctx.impersonatedContractorProfileId) {
    const profile = await db.getContractorProfileById(ctx.impersonatedContractorProfileId);
    if (!profile) throw new TRPCError({ code: "NOT_FOUND", message: "Contractor profile not found" });
    return profile;
  }
  const profile = await db.getContractorProfile(ctx.user.id);
  if (!profile) throw new TRPCError({ code: "NOT_FOUND", message: "Contractor profile not found" });
  return profile;
}

// ─── Company Router ─────────────────────────────────────────────────────────
const companyRouter = router({
  create: protectedProcedure
    .input(z.object({ name: z.string().min(1), address: z.string().optional(), phone: z.string().optional(), email: z.string().optional(), city: z.string().optional(), state: z.string().optional(), zipCode: z.string().optional(), website: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const companyId = await db.createCompany({ name: input.name, address: input.address ?? null, phone: input.phone ?? null, email: input.email ?? null });
      await db.updateUserRole(ctx.user.id, "company_admin", companyId);
      return { id: companyId };
    }),

  get: companyAdminProcedure.query(async ({ ctx }) => {
    if (!getEffectiveCompanyId(ctx)) throw new TRPCError({ code: "NOT_FOUND", message: "No company associated" });
    return db.getCompanyById(getEffectiveCompanyId(ctx));
  }),

  update: companyAdminProcedure
    .input(z.object({ name: z.string().optional(), address: z.string().optional(), phone: z.string().optional(), email: z.string().optional(), logoUrl: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      if (!getEffectiveCompanyId(ctx)) throw new TRPCError({ code: "NOT_FOUND" });
      await db.updateCompany(getEffectiveCompanyId(ctx), input);
      return { success: true };
    }),

  listAll: adminProcedure.query(async () => {
    return db.listCompanies();
  }),

  dashboardStats: companyAdminProcedure.query(async ({ ctx }) => {
    if (!getEffectiveCompanyId(ctx)) throw new TRPCError({ code: "NOT_FOUND" });
    return db.getCompanyDashboardStats(getEffectiveCompanyId(ctx));
  }),

  // Public list of active company plans (for upgrade UI)
  listAvailablePlans: companyAdminProcedure.query(async () => {
    return db.listSubscriptionPlansByType("company");
  }),

  // Returns the company's effective plan (plan-level or company-override)
  getMyPlan: companyAdminProcedure.query(async ({ ctx }) => {
    if (!getEffectiveCompanyId(ctx)) return null;
    const companyId = getEffectiveCompanyId(ctx);
    const company = await db.getCompanyById(companyId);
    const plan = await db.getEffectivePlanForCompany(companyId);
    const [propCount, contractorCount, jobsThisMonth] = await Promise.all([
      db.countPropertiesForCompany(companyId),
      db.countApprovedContractorsForCompany(companyId),
      db.countJobsThisMonthForCompany(companyId),
    ]);
    // Compute trial countdown
    const planStatus = company?.planStatus ?? null;
    const planExpiresAt = company?.planExpiresAt ?? null;
    const now = Date.now();
    const daysRemaining = planExpiresAt && planStatus === "trialing"
      ? Math.max(0, Math.ceil((planExpiresAt - now) / (1000 * 60 * 60 * 24)))
      : null;
    // Fetch next billing date from Stripe subscription if available
    let nextBillingDate: number | null = null;
    if (company?.stripeSubscriptionId && (planStatus === "active" || planStatus === "trialing" || planStatus === "canceled")) {
      try {
        const sub = await stripe.subscriptions.retrieve(company.stripeSubscriptionId);
        nextBillingDate = (sub as any).current_period_end ?? null;
      } catch {
        // Non-fatal — just don't show the date
      }
    }
    return {
      plan,
      planStatus,
      planExpiresAt,
      daysRemaining,
      nextBillingDate,
      planPriceOverride: company?.planPriceOverride ?? null,
      planNotes: company?.planNotes ?? null,
      feeOverridePercent: company?.feeOverridePercent ?? null,
      feeOverridePerListingEnabled: company?.feeOverridePerListingEnabled ?? null,
      feeOverridePerListingAmount: company?.feeOverridePerListingAmount ?? null,
      usage: { properties: propCount, contractors: contractorCount, jobsThisMonth },
    };
  }),
});

// ─── Settings Router ────────────────────────────────────────────────────────
const settingsRouter = router({
  get: companyAdminProcedure.query(async ({ ctx }) => {
    if (!getEffectiveCompanyId(ctx)) throw new TRPCError({ code: "NOT_FOUND" });
    return db.getCompanySettings(getEffectiveCompanyId(ctx));
  }),

  update: companyAdminProcedure
    .input(z.object({
      geofenceRadiusFeet: z.number().min(100).max(5000).optional(),
      autoClockOutMinutes: z.number().min(1).max(60).optional(),
      maxSessionDurationHours: z.number().min(1).max(24).optional(),
      timesheetReviewEnabled: z.boolean().optional(),
      billableTimePolicy: z.enum(["on_site_only", "full_trip", "hybrid_with_cap"]).optional(),
      hybridCapMinutes: z.number().min(5).max(120).optional(),
      partsMarkupPercent: z.string().optional(),
      autoApproveContractors: z.boolean().optional(),
      escalationTimeoutMinutes: z.number().min(5).max(1440).optional(),
      platformFeePercent: z.string().optional(),
      // Notification preferences
      notifyOnClockIn: z.boolean().optional(),
      notifyOnClockOut: z.boolean().optional(),
      notifyOnJobSubmitted: z.boolean().optional(),
      notifyOnNewContractor: z.boolean().optional(),
      // Job Board Visibility Default
      defaultJobBoardVisibility: z.enum(["public", "private"]).optional(),
      // Billing: exclude out-of-geofence sessions from labor cost
      excludeOutOfGeofenceSessions: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!getEffectiveCompanyId(ctx)) throw new TRPCError({ code: "NOT_FOUND" });
      await db.updateCompanySettings(getEffectiveCompanyId(ctx), input);
      return { success: true };
    }),
});

// ─── Skill Tiers Router ────────────────────────────────────────────────────
const skillTiersRouter = router({
  list: companyAdminProcedure.query(async ({ ctx }) => {
    if (!getEffectiveCompanyId(ctx)) throw new TRPCError({ code: "NOT_FOUND" });
    return db.getSkillTiers(getEffectiveCompanyId(ctx));
  }),

  create: companyAdminProcedure
    .input(z.object({ name: z.string().min(1), description: z.string().optional(), hourlyRate: z.string(), emergencyMultiplier: z.string().optional(), sortOrder: z.number().optional() }))
    .mutation(async ({ ctx, input }) => {
      if (!getEffectiveCompanyId(ctx)) throw new TRPCError({ code: "NOT_FOUND" });
      const id = await db.createSkillTier({ companyId: getEffectiveCompanyId(ctx), ...input });
      return { id };
    }),

  update: companyAdminProcedure
    .input(z.object({ id: z.number(), name: z.string().optional(), description: z.string().optional(), hourlyRate: z.string().optional(), emergencyMultiplier: z.string().optional(), sortOrder: z.number().optional() }))
    .mutation(async ({ ctx, input }) => {
      if (!getEffectiveCompanyId(ctx)) throw new TRPCError({ code: "NOT_FOUND" });
      const { id, ...data } = input;
      await db.updateSkillTier(id, getEffectiveCompanyId(ctx), data);
      return { success: true };
    }),

  delete: companyAdminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (!getEffectiveCompanyId(ctx)) throw new TRPCError({ code: "NOT_FOUND" });
      await db.deleteSkillTier(input.id, getEffectiveCompanyId(ctx));
      return { success: true };
    }),
});

// ─── Properties Router ─────────────────────────────────────────────────────
const propertiesRouter = router({
  list: companyAdminProcedure.query(async ({ ctx }) => {
    if (!getEffectiveCompanyId(ctx)) throw new TRPCError({ code: "NOT_FOUND" });
    return db.listProperties(getEffectiveCompanyId(ctx));
  }),

  get: companyAdminProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      if (!getEffectiveCompanyId(ctx)) throw new TRPCError({ code: "NOT_FOUND" });
      return db.getPropertyById(input.id, getEffectiveCompanyId(ctx));
    }),

  create: companyAdminProcedure
    .input(z.object({ name: z.string().optional(), address: z.string().min(1), city: z.string().optional(), state: z.string().optional(), zipCode: z.string().optional(), latitude: z.string().optional(), longitude: z.string().optional(), units: z.number().optional(), propertyType: z.enum(["single_family", "multi_family", "commercial", "other"]).optional() }))
    .mutation(async ({ ctx, input }) => {
      if (!getEffectiveCompanyId(ctx)) throw new TRPCError({ code: "NOT_FOUND" });
      const companyId = getEffectiveCompanyId(ctx);
      // ─── Plan limit check ───────────────────────────────────────────────────
      const plan = await db.getEffectivePlanForCompany(companyId);
      if (plan) {
        const maxProps = (plan.features as any)?.maxProperties;
        if (maxProps != null) {
          const currentCount = await db.countPropertiesForCompany(companyId);
          if (currentCount >= maxProps) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: `Your ${plan.name} plan allows a maximum of ${maxProps} ${maxProps === 1 ? "property" : "properties"}. Please upgrade to add more.`,
            });
          }
        }
      }
      const name = input.name?.trim() || input.address.trim();
      const id = await db.createProperty({ companyId, ...input, name });
      // Auto-geocode if no coords provided
      if (!input.latitude || !input.longitude) {
        const fullAddress = [input.address, input.city, input.state, input.zipCode].filter(Boolean).join(", ");
        const coords = await db.geocodeAddress(fullAddress);
        if (coords) await db.updatePropertyCoords(id, coords.lat, coords.lng);
      }
      return { id };
    }),

  update: companyAdminProcedure
    .input(z.object({ id: z.number(), name: z.string().optional(), address: z.string().optional(), city: z.string().optional(), state: z.string().optional(), zipCode: z.string().optional(), latitude: z.string().optional(), longitude: z.string().optional(), units: z.number().optional(), propertyType: z.enum(["single_family", "multi_family", "commercial", "other"]).optional() }))
    .mutation(async ({ ctx, input }) => {
      if (!getEffectiveCompanyId(ctx)) throw new TRPCError({ code: "NOT_FOUND" });
      const { id, ...data } = input;
      await db.updateProperty(id, getEffectiveCompanyId(ctx), data);
      // Re-geocode if address fields changed and no explicit coords provided
      if ((input.address || input.city || input.state || input.zipCode) && !input.latitude && !input.longitude) {
        const prop = await db.getPropertyById(id, getEffectiveCompanyId(ctx));
        if (prop) {
          const fullAddress = [prop.address, prop.city, prop.state, prop.zipCode].filter(Boolean).join(", ");
          const coords = await db.geocodeAddress(fullAddress);
          if (coords) await db.updatePropertyCoords(id, coords.lat, coords.lng);
        }
      }
      return { success: true };
    }),

  delete: companyAdminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (!getEffectiveCompanyId(ctx)) throw new TRPCError({ code: "NOT_FOUND" });
      await db.deleteProperty(input.id, getEffectiveCompanyId(ctx));
      return { success: true };
    }),

  getUnits: companyAdminProcedure
    .input(z.object({ propertyId: z.number() }))
    .query(async ({ ctx, input }) => {
      if (!getEffectiveCompanyId(ctx)) throw new TRPCError({ code: "NOT_FOUND" });
      return db.getUnitsByProperty(input.propertyId, getEffectiveCompanyId(ctx));
    }),

  addUnit: companyAdminProcedure
    .input(z.object({
      propertyId: z.number(),
      unitNumber: z.string().min(1),
      bedrooms: z.number().optional(),
      bathrooms: z.number().optional(),
      sqft: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!getEffectiveCompanyId(ctx)) throw new TRPCError({ code: "NOT_FOUND" });
      const companyId = getEffectiveCompanyId(ctx);
      const id = await db.createPropertyUnit({
        propertyId: input.propertyId,
        companyId,
        unitNumber: input.unitNumber,
        bedrooms: input.bedrooms ?? null,
        bathrooms: input.bathrooms != null ? String(input.bathrooms) : null,
        sqft: input.sqft ?? null,
      });
      return { id };
    }),

  updateUnit: companyAdminProcedure
    .input(z.object({
      id: z.number(),
      unitNumber: z.string().min(1).optional(),
      bedrooms: z.number().nullable().optional(),
      bathrooms: z.number().nullable().optional(),
      sqft: z.number().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!getEffectiveCompanyId(ctx)) throw new TRPCError({ code: "NOT_FOUND" });
      const { id, bathrooms, ...rest } = input;
      await db.updatePropertyUnit(id, getEffectiveCompanyId(ctx), {
        ...rest,
        bathrooms: bathrooms != null ? String(bathrooms) : null,
      });
      return { success: true };
    }),

  deleteUnit: companyAdminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (!getEffectiveCompanyId(ctx)) throw new TRPCError({ code: "NOT_FOUND" });
      await db.deletePropertyUnit(input.id, getEffectiveCompanyId(ctx));
      return { success: true };
    }),
});

// ─── Contractor Router ──────────────────────────────────────────────────────
const contractorRouter = router({
  setupProfile: protectedProcedure
    .input(z.object({
      firstName: z.string().optional(),
      lastName: z.string().optional(),
      businessName: z.string().optional(),
      phone: z.string().optional(),
      trades: z.array(z.string()).optional(),
      serviceAreaZips: z.array(z.string()).optional(),
      serviceRadiusMiles: z.number().optional(),
      licenseNumber: z.string().optional(),
      insuranceInfo: z.string().optional(),
      inviteToken: z.string().optional(), // if present, auto-connect to the inviting company
    }))
    .mutation(async ({ ctx, input }) => {
      const { firstName, lastName, inviteToken, ...profileData } = input;
      // Update user's display name if first/last name provided
      if (firstName || lastName) {
        const fullName = [firstName, lastName].filter(Boolean).join(" ");
        await db.updateUserName(ctx.user.id, fullName);
      }
      const existing = await getEffectiveContractorProfile(ctx);
      let profileId: number;
      if (existing) {
        await db.updateContractorProfile(existing.id, profileData);
        profileId = existing.id;
      } else {
        profileId = await db.createContractorProfile({ userId: ctx.user.id, ...profileData });
        await db.updateUserRole(ctx.user.id, "contractor", undefined, profileId);
        // Auto-assign the Free contractor plan on first registration
        try {
          const freePlan = await db.getFreeContractorPlan();
          if (freePlan) await db.assignContractorPlan(profileId, freePlan.id, null, null, "active");
        } catch (e) {
          console.warn("[contractor.setup] Could not auto-assign free plan:", e);
        }
      }
      // Auto-geocode contractor base ZIP
      const zip = profileData.serviceAreaZips?.[0];
      if (zip) {
        const coords = await db.geocodeAddress(`${zip}, USA`);
        if (coords) await db.updateContractorCoords(profileId, coords.lat, coords.lng);
      }

      // If an invite token was provided, validate it and auto-connect contractor to the company
      if (inviteToken) {
        const invite = await db.getContractorInviteByToken(inviteToken);
        if (invite && invite.status === "pending" && invite.expiresAt > Date.now()) {
          // Create the contractor-company relationship (approved immediately since company invited them)
          const { contractorCompanies: cc } = await import("../drizzle/schema");
          const drizzleDb = await db.getDb();
          if (drizzleDb) {
            await drizzleDb.insert(cc).values({
              contractorProfileId: profileId,
              companyId: invite.companyId,
              status: "approved",
              invitedBy: "company",
              isTrusted: true, // Invite-accepted contractors are automatically trusted
            }).onDuplicateKeyUpdate({ set: { status: "approved", isTrusted: true } });
          }
          // Mark invite as accepted
          await db.updateContractorInviteStatus(invite.id, "accepted", Date.now());
        }
      }

      return { id: profileId };
    }),

  getProfile: protectedProcedure.query(async ({ ctx }) => {
    return getEffectiveContractorProfile(ctx);
  }),

  // List all active contractor plans (for upgrade UI)
  listAvailablePlans: contractorProcedure.query(async () => {
    return db.listSubscriptionPlansByType("contractor");
  }),

  getMyPlan: contractorProcedure.query(async ({ ctx }) => {
    const profile = await getEffectiveContractorProfile(ctx).catch(() => null);
    if (!profile) return null;
    const plan = await db.getEffectivePlanForContractor(profile.id);
    const activeJobs = await db.countActiveJobsForContractor(profile.id);
    const approvedCompanies = await db.countApprovedCompaniesForContractor(profile.id);
    // Compute trial countdown
    const planStatus = profile.planStatus ?? null;
    const planExpiresAt = profile.planExpiresAt ?? null;
    const now = Date.now();
    const daysRemaining = planExpiresAt && planStatus === "trialing"
      ? Math.max(0, Math.ceil((planExpiresAt - now) / (1000 * 60 * 60 * 24)))
      : null;
    return {
      plan,
      planStatus,
      planExpiresAt,
      daysRemaining,
      usage: {
        activeJobs,
        approvedCompanies,
      },
    };
  }),

  updateProfile: contractorProcedure
    .input(z.object({
      businessName: z.string().optional(),
      phone: z.string().optional(),
      trades: z.array(z.string()).optional(),
      serviceAreaZips: z.array(z.string()).optional(),
      serviceRadiusMiles: z.number().optional(),
      licenseNumber: z.string().optional(),
      insuranceInfo: z.string().optional(),
      isAvailable: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      console.log("[updateProfile] called for user", ctx.user.id, "input:", JSON.stringify(input));
      const profile = await getEffectiveContractorProfile(ctx);
      if (!profile) throw new TRPCError({ code: "NOT_FOUND", message: "No contractor profile" });
      console.log("[updateProfile] found profile id", profile.id, "current lat/lng:", profile.latitude, profile.longitude);
      await db.updateContractorProfile(profile.id, input);
      // Re-geocode base location whenever the service ZIP changes so that
      // the Haversine distance filter on the job board uses fresh coordinates.
      const zip = input.serviceAreaZips?.[0];
      console.log("[updateProfile] serviceAreaZips:", input.serviceAreaZips, "first zip:", zip, "serviceRadiusMiles:", input.serviceRadiusMiles);
      if (zip) {
        console.log("[updateProfile] geocoding ZIP:", zip);
        const coords = await db.geocodeAddress(`${zip}, USA`);
        console.log("[updateProfile] geocode result:", coords);
        if (coords) {
          await db.updateContractorCoords(profile.id, coords.lat, coords.lng);
          console.log("[updateProfile] saved coords for profile", profile.id, ":", coords);
        }
      } else {
        console.log("[updateProfile] no ZIP provided, skipping geocode");
      }
      return { success: true };
    }),

  // ─── Onboarding Checklist ────────────────────────────────────────────────
  // Dismiss a specific onboarding step (without completing it)
  dismissOnboardingStep: contractorProcedure
    .input(z.object({ stepId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const profile = await getEffectiveContractorProfile(ctx);
      if (!profile) throw new TRPCError({ code: "NOT_FOUND", message: "No contractor profile" });
      const current = (profile.onboardingDismissedSteps as string[] | null) ?? [];
      if (!current.includes(input.stepId)) {
        const updated = [...current, input.stepId];
        await db.updateContractorProfile(profile.id, { onboardingDismissedSteps: updated } as any);
      }
      return { success: true };
    }),

  // Mark onboarding as fully completed (called when all steps are done)
  completeOnboarding: contractorProcedure
    .mutation(async ({ ctx }) => {
      const profile = await getEffectiveContractorProfile(ctx);
      if (!profile) throw new TRPCError({ code: "NOT_FOUND", message: "No contractor profile" });
      if (profile.onboardingCompletedAt) return { success: true, alreadyCompleted: true };
      const now = Date.now();
      await db.updateContractorProfile(profile.id, { onboardingCompletedAt: now } as any);
      // Send congratulations notification and email
      const user = await db.getUserById(ctx.user.id);
      if (user?.email) {
        import("./email").then(emailService => {
          emailService.sendOnboardingCompleteEmail({
            to: user.email!,
            name: user.name ?? "there",
          }).catch(err => console.error("[Email] Onboarding complete email failed:", err));
        }).catch(() => {});
      }
      return { success: true, alreadyCompleted: false };
    }),

  // Re-geocode the contractor's base ZIP on demand (fixes missing coords)
  refreshGeocode: contractorProcedure.mutation(async ({ ctx }) => {
    const profile = await getEffectiveContractorProfile(ctx);
    if (!profile) throw new TRPCError({ code: "NOT_FOUND", message: "No contractor profile" });
    const zip = (profile.serviceAreaZips as string[] | null)?.[0];
    if (!zip) return { success: false, message: "No service ZIP set — update your profile first" };
    const coords = await db.geocodeAddress(`${zip}, USA`);
    if (!coords) return { success: false, message: `Geocoding failed for ZIP ${zip}` };
    await db.updateContractorCoords(profile.id, coords.lat, coords.lng);
    return { success: true, lat: coords.lat, lng: coords.lng };
  }),

  // Company-side: list contractors for this company
  listByCompany: companyAdminProcedure.query(async ({ ctx }) => {
    if (!getEffectiveCompanyId(ctx)) throw new TRPCError({ code: "NOT_FOUND" });
    return db.listContractorsByCompany(getEffectiveCompanyId(ctx));
  }),

  // Company-side: get performance scorecards for all contractors
  scorecards: companyAdminProcedure.query(async ({ ctx }) => {
    const companyId = getEffectiveCompanyId(ctx);
    return db.getContractorScorecardsByCompany(companyId);
  }),

  // Contractor-side: list companies they're connected to
  myCompanies: contractorProcedure.query(async ({ ctx }) => {
    const profile = await getEffectiveContractorProfile(ctx);
    if (!profile) return [];
    return db.listCompaniesByContractor(profile.id);
  }),

  // Request to join a company (contractor-initiated)
  requestJoin: contractorProcedure
    .input(z.object({ companyId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const profile = await getEffectiveContractorProfile(ctx);
      if (!profile) throw new TRPCError({ code: "NOT_FOUND", message: "Set up your profile first" });
      const id = await db.createContractorCompanyRelation({
        contractorProfileId: profile.id,
        companyId: input.companyId,
        invitedBy: "contractor",
      });
      return { id };
    }),

  // Company-side: invite a contractor
  invite: companyAdminProcedure
    .input(z.object({ contractorProfileId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (!getEffectiveCompanyId(ctx)) throw new TRPCError({ code: "NOT_FOUND" });
      const companyId = getEffectiveCompanyId(ctx);
      // ─── Plan limit check ───────────────────────────────────────────────────
      const plan = await db.getEffectivePlanForCompany(companyId);
      if (plan) {
        const maxContractors = (plan.features as any)?.maxContractors;
        if (maxContractors != null) {
          const currentCount = await db.countApprovedContractorsForCompany(companyId);
          if (currentCount >= maxContractors) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: `Your ${plan.name} plan allows a maximum of ${maxContractors} approved ${maxContractors === 1 ? "contractor" : "contractors"}. Please upgrade to add more.`,
            });
          }
        }
      }
      const settings = await db.getCompanySettings(companyId);
      const status = settings?.autoApproveContractors ? "approved" : "pending";
      const id = await db.createContractorCompanyRelation({
        contractorProfileId: input.contractorProfileId,
        companyId,
        invitedBy: "company",
        status: status as any,
        isTrusted: true, // Company-invited contractors are automatically trusted
      });
      return { id };
    }),

  // Company-side: approve/reject contractor
  updateRelationship: companyAdminProcedure
    .input(z.object({ relationshipId: z.number(), status: z.enum(["approved", "rejected", "suspended"]) }))
    .mutation(async ({ input }) => {
      await db.updateContractorCompanyStatus(input.relationshipId, input.status);
      return { success: true };
    }),
  // Company-side: mark/unmark a contractor as trusted
  setTrusted: companyAdminProcedure
    .input(z.object({ relationshipId: z.number(), isTrusted: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const companyId = getEffectiveCompanyId(ctx);
      await db.setContractorTrusted(input.relationshipId, companyId, input.isTrusted);
      // Send in-app notification + email to contractor when trust is granted
      if (input.isTrusted) {
        try {
          const rel = await db.getContractorUserIdByRelationship(input.relationshipId);
          const company = await db.getCompanyById(companyId);
          if (rel?.userId) {
            await db.createNotification({
              userId: rel.userId,
              type: 'system',
              title: 'You\'ve been marked as Trusted',
              body: `${company?.name ?? 'A company'} has marked you as a trusted contractor. You now have access to their private job board.`,
              linkRoute: '/contractor/jobs',
              metadata: { companyId },
            });
            // Also send email notification
            const contractorUser = await db.getUserById(rel.userId);
            if (contractorUser?.email) {
              const appUrl = ctx.req.headers.origin as string ?? '';
              await email.sendTrustedContractorEmail({
                to: contractorUser.email,
                contractorName: contractorUser.name ?? 'Contractor',
                companyName: company?.name ?? 'A company',
                appUrl,
              });
            }
          }
        } catch { /* non-critical */ }
      }
      return { success: true };
    }),

  // Contractor: available jobs
  availableJobs: contractorProcedure.query(async ({ ctx }) => {
    const profile = await getEffectiveContractorProfile(ctx);
    if (!profile) return [];
    return db.getJobsForContractor(profile.id);
  }),

  // Contractor: my assigned jobs
  myJobs: contractorProcedure.query(async ({ ctx }) => {
    const profile = await getEffectiveContractorProfile(ctx);
    if (!profile) return [];
    return db.getContractorAssignedJobs(profile.id);
  }),

  // Contractor: accept a job
  acceptJob: contractorProcedure
    .input(z.object({ jobId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const profile = await getEffectiveContractorProfile(ctx);
      if (!profile) throw new TRPCError({ code: "NOT_FOUND" });
      // Enforce contractor plan active job limit
      const contractorPlan = await db.getEffectivePlanForContractor(profile.id);
      if (contractorPlan?.features) {
        const maxActiveJobs = (contractorPlan.features as any).maxActiveJobs;
        if (maxActiveJobs != null) {
          const currentActive = await db.countActiveJobsForContractor(profile.id);
          if (currentActive >= maxActiveJobs) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: `Your current plan (${contractorPlan.name}) allows a maximum of ${maxActiveJobs} active job${maxActiveJobs === 1 ? '' : 's'} at a time. Complete or close existing jobs to accept new ones.`,
            });
          }
        }
      }
      const job = await db.getMaintenanceRequestById(input.jobId);
      if (!job || job.status !== "open") throw new TRPCError({ code: "BAD_REQUEST", message: "Job is not available" });
      await db.updateMaintenanceRequest(input.jobId, {
        assignedContractorId: profile.id,
        assignedAt: new Date(),
        status: "assigned",
      });

      // Email: notify contractor of new assignment
      try {
        const job = await db.getMaintenanceRequestById(input.jobId);
        const contractorUser = await db.getUserEmailByContractorProfileId(profile.id);
        const property = job?.propertyId ? await db.getPropertyByIdOnly(job.propertyId) : null;
        const company = job?.companyId ? await db.getCompanyById(job.companyId) : null;
        if (contractorUser?.email && job && contractorUser.id) {
          const emailEnabled = await db.isEmailEnabled(contractorUser.id, 'jobAssigned');
          if (emailEnabled) {
            email.sendJobAssignedEmail({
              to: contractorUser.email,
              contractorName: contractorUser.name ?? "Contractor",
              jobTitle: job.title,
              jobId: job.id,
              propertyName: property?.name ?? "Property",
              companyName: company?.name ?? "Company",
              appUrl: ENV.appUrl,
            }).catch(() => {});
          }
        }
      } catch { /* non-critical */ }

      return { success: true };
    }),

  // Contractor: get all my jobs (assigned, in_progress, pending_verification, etc.)
  allMyJobs: contractorProcedure.query(async ({ ctx }) => {
    const profile = await getEffectiveContractorProfile(ctx);
    if (!profile) return [];
    return db.getContractorJobs(profile.id);
  }),

  // Contractor: mark a job as complete with notes and photos
  markComplete: contractorProcedure
    .input(z.object({
      jobId: z.number(),
      completionNotes: z.string().min(1, "Please describe the work completed"),
      completionPhotoUrls: z.array(z.string()).default([]),
    }))
    .mutation(async ({ ctx, input }) => {
      const profile = await getEffectiveContractorProfile(ctx);
      if (!profile) throw new TRPCError({ code: "NOT_FOUND" });
      // Auto-close any still-active time sessions before calculating labor cost.
      // This handles the case where a contractor forgot to clock out before marking the job done.
      const sessions = await db.getTimeSessionsByJob(input.jobId);
      const autoCloseNow = Date.now();
      for (const s of sessions) {
        if ((s as any).status === "active" && (s as any).clockInTime) {
          const mins = Math.max(1, Math.round((autoCloseNow - (s as any).clockInTime) / 60000));
          await db.updateTimeSession((s as any).id, {
            clockOutTime: autoCloseNow,
            clockOutMethod: "auto_job_complete" as any,
            status: "completed",
            totalMinutes: mins,
            billableMinutes: mins,
          });
        }
      }
      // Re-fetch sessions after auto-close
      const updatedSessions = await db.getTimeSessionsByJob(input.jobId);
      // Get job to find hourlyRate and company settings (for excludeOutOfGeofenceSessions)
      const jobData = await db.getMaintenanceRequestById(input.jobId);
      const companySettings = jobData?.companyId ? await db.getCompanySettings(jobData.companyId) : null;
      const excludeOutOfGeofence = companySettings?.excludeOutOfGeofenceSessions ?? false;
      // Filter sessions: if excludeOutOfGeofenceSessions, only count clockInVerified sessions
      const completedSessions = updatedSessions.filter((s: any) => {
        if (s.status !== "completed" && s.status !== "flagged") return false;
        if (!s.totalMinutes) return false;
        if (excludeOutOfGeofence && !s.clockInVerified) return false;
        return true;
      });
      const totalLaborMinutes = completedSessions.reduce((sum: number, s: any) => sum + (s.totalMinutes ?? 0), 0);
      // Resolve hourlyRate: use job's stored rate, or fall back to the company's skill tier rate
      let hourlyRate = parseFloat(jobData?.hourlyRate ?? "0");
      if (hourlyRate === 0 && jobData?.skillTierId && jobData?.companyId) {
        try {
          const tiers = await db.getSkillTiers(jobData.companyId);
          const tier = tiers.find((t: any) => t.id === jobData.skillTierId);
          if (tier?.hourlyRate) {
            hourlyRate = parseFloat(tier.hourlyRate);
            if (jobData.isEmergency && tier.emergencyMultiplier) {
              hourlyRate = hourlyRate * parseFloat(tier.emergencyMultiplier);
            }
          }
        } catch { /* non-critical */ }
      }
      const totalLaborCost = hourlyRate > 0 && totalLaborMinutes > 0
        ? ((totalLaborMinutes / 60) * hourlyRate).toFixed(2)
        : null;
      await db.markJobComplete(
        input.jobId,
        profile.id,
        input.completionNotes,
        input.completionPhotoUrls,
        totalLaborMinutes > 0 ? totalLaborMinutes : null,
        totalLaborCost,
        hourlyRate > 0 ? hourlyRate.toFixed(2) : null
      );

      // Email: notify company admins that job is ready for verification
      try {
        const jobData = await db.getMaintenanceRequestById(input.jobId);
        if (jobData?.companyId) {
          const admins = await db.getCompanyAdminEmails(jobData.companyId);
          const property = jobData.propertyId ? await db.getPropertyByIdOnly(jobData.propertyId) : null;
          const contractorUser = await db.getUserEmailByContractorProfileId(profile.id);
          for (const admin of admins) {
            if (admin.email && admin.id) {
              const emailEnabled = await db.isEmailEnabled(admin.id, 'jobSubmitted');
              if (emailEnabled) {
                email.sendJobSubmittedEmail({
                  to: admin.email,
                  companyAdminName: admin.name ?? "Admin",
                  jobTitle: jobData.title,
                  contractorName: contractorUser?.name ?? "Contractor",
                  propertyName: property?.name ?? "Property",
                  appUrl: ENV.appUrl,
                }).catch(() => {});
              }
            }
          }
        }
      } catch { /* non-critical */ }

      // Auto-add contractor to company roster on job completion (if not already linked)
      try {
        const jobData = await db.getMaintenanceRequestById(input.jobId);
        if (jobData?.companyId) {
          await db.ensureContractorCompanyRelation(profile.id, jobData.companyId);
        }
      } catch { /* non-critical */ }

      return { success: true };
    }),

  // Contractor: resubmit a disputed job with a response note
  resubmitDispute: contractorProcedure
    .input(z.object({
      jobId: z.number(),
      responseNote: z.string().min(10, "Please provide at least 10 characters explaining the resubmission"),
    }))
    .mutation(async ({ ctx, input }) => {
      const profile = await getEffectiveContractorProfile(ctx);
      if (!profile) throw new TRPCError({ code: "NOT_FOUND" });
      await db.resubmitDisputedJob(input.jobId, profile.id, input.responseNote);

      // Email: notify company admins of resubmission
      try {
        const job = await db.getMaintenanceRequestById(input.jobId);
        if (job?.companyId) {
          const admins = await db.getCompanyAdminEmails(job.companyId);
          const contractorUser = await db.getUserEmailByContractorProfileId(profile.id);
          for (const admin of admins) {
            if (admin.email && admin.id) {
              const emailEnabled = await db.isEmailEnabled(admin.id, 'jobDisputed');
              if (emailEnabled) {
                email.sendDisputeResubmittedEmail({
                  to: admin.email,
                  companyAdminName: admin.name ?? "Admin",
                  contractorName: contractorUser?.name ?? "Contractor",
                  jobTitle: job.title,
                  responseNote: input.responseNote,
                  appUrl: ENV.appUrl,
                }).catch(() => {});
              }
            }
          }
        }
      } catch { /* non-critical */ }

      return { success: true };
    }),

  // Contractor: earnings summary and transaction history
  getEarnings: contractorProcedure
    .query(async ({ ctx }) => {
      const profile = await getEffectiveContractorProfile(ctx);
      if (!profile) throw new TRPCError({ code: "NOT_FOUND" });
      const txns = await db.getTransactionsByContractor(profile.id);

      const totalEarned = txns
        .filter((t: any) => ["captured", "paid_out"].includes(t.status))
        .reduce((sum: number, t: any) => sum + parseFloat(t.contractorPayout ?? "0"), 0);
      const pendingPayout = txns
        .filter((t: any) => ["pending", "escrow"].includes(t.status))
        .reduce((sum: number, t: any) => sum + parseFloat(t.contractorPayout ?? "0"), 0);

      // Monthly breakdown (last 12 months)
      const monthlyMap: Record<string, number> = {};
      for (const t of txns) {
        if (!["captured", "paid_out"].includes(t.status)) continue;
        const d = new Date(t.createdAt);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        monthlyMap[key] = (monthlyMap[key] ?? 0) + parseFloat(t.contractorPayout ?? "0");
      }
      const monthly = Object.entries(monthlyMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(-12)
        .map(([month, amount]) => ({ month, amount: parseFloat(amount.toFixed(2)) }));

      return {
        totalEarned: parseFloat(totalEarned.toFixed(2)),
        pendingPayout: parseFloat(pendingPayout.toFixed(2)),
        totalJobs: txns.length,
        transactions: txns,
        monthly,
      };
    }),

  getPayoutHistory: contractorProcedure
    .input(z.object({
      limit: z.number().min(1).max(100).optional().default(50),
      startingAfter: z.string().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const profile = await getEffectiveContractorProfile(ctx);
      if (!profile) throw new TRPCError({ code: "NOT_FOUND" });
      if (!profile.stripeAccountId || !profile.stripeOnboardingComplete) {
        return { payouts: [], hasMore: false, connected: false };
      }
      // Fetch transfers sent to this contractor's Connect account
      const params: Record<string, unknown> = {
        destination: profile.stripeAccountId,
        limit: input?.limit ?? 50,
      };
      if (input?.startingAfter) params.starting_after = input.startingAfter;
      const transfers = await stripe.transfers.list(params as any);
      // Enrich each transfer with job info from our DB via metadata
      const payouts = await Promise.all(
        transfers.data.map(async (t) => {
          const jobId = t.metadata?.jobId ? parseInt(t.metadata.jobId) : null;
          let jobTitle: string | null = null;
          let propertyName: string | null = null;
          if (jobId) {
            const job = await db.getMaintenanceRequestById(jobId);
            jobTitle = job?.title ?? null;
            // propertyName requires a join — fetch separately if needed
            if (job?.propertyId) {
              const prop = await db.getPropertyByIdOnly(job.propertyId);
              propertyName = prop?.name ?? null;
            }
          }
          return {
            id: t.id,
            amount: t.amount / 100, // cents → dollars
            currency: t.currency,
            createdAt: t.created * 1000, // unix → ms
            status: t.reversed ? "reversed" : "paid",
            jobId,
            jobTitle,
            propertyName,
            description: t.description ?? null,
          };
        })
      );
      return { payouts, hasMore: transfers.has_more, connected: true };
    }),
});
// ─── Maintenance Requests Router ─────────────────────────────────────────────
const jobsRouter = router({
  list: companyAdminProcedure
    .input(z.object({ status: z.union([z.string(), z.array(z.string())]).optional() }).optional())
    .query(async ({ ctx, input }) => {
      if (!getEffectiveCompanyId(ctx)) throw new TRPCError({ code: "NOT_FOUND" });
      return db.listMaintenanceRequests(getEffectiveCompanyId(ctx), input?.status);
    }),

  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const job = await db.getMaintenanceRequestById(input.id);
      if (!job) throw new TRPCError({ code: "NOT_FOUND" });
      return job;
    }),

  create: companyAdminProcedure
    .input(z.object({
      propertyId: z.number(),
      title: z.string().min(1),
      description: z.string().min(1),
      tenantName: z.string().optional(),
      tenantPhone: z.string().optional(),
      tenantEmail: z.string().optional(),
      unitNumber: z.string().optional(),
      isEmergency: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!getEffectiveCompanyId(ctx)) throw new TRPCError({ code: "NOT_FOUND" });
      const companyId = getEffectiveCompanyId(ctx);
      // ─── Plan limit check ───────────────────────────────────────────────────
      const plan = await db.getEffectivePlanForCompany(companyId);
      if (plan) {
        const maxJobsPerMonth = (plan.features as any)?.maxJobsPerMonth;
        if (maxJobsPerMonth != null) {
          const currentCount = await db.countJobsThisMonthForCompany(companyId);
          if (currentCount >= maxJobsPerMonth) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: `Your ${plan.name} plan allows a maximum of ${maxJobsPerMonth} jobs per month. You have reached your limit for this month. Please upgrade to create more jobs.`,
            });
          }
        }
      }

      // Create the request
      const id = await db.createMaintenanceRequest({
        companyId,
        ...input,
      });

      // AI classification (plan-gated)
      try {
        const aiEnabled = await db.companyHasPlanFeature(companyId, "aiJobClassification");
        const tiers = await db.getSkillTiers(getEffectiveCompanyId(ctx));
        if (aiEnabled && tiers.length > 0) {
          const classification = await classifyMaintenanceRequest(input.title, input.description, tiers);
          const matchedTier = tiers.find(t => t.name.toLowerCase() === classification.skillTierName.toLowerCase());
          // Compute the effective hourly rate:
          // - Emergency priority → baseTierRate × emergencyMultiplier
          // - All other priorities → baseTierRate
          let aiHourlyRate: string | null = matchedTier?.hourlyRate ?? null;
          if (classification.priority === "emergency" && matchedTier?.emergencyMultiplier) {
            const base = parseFloat(matchedTier.hourlyRate);
            const mult = parseFloat(matchedTier.emergencyMultiplier);
            if (!isNaN(base) && !isNaN(mult)) {
              aiHourlyRate = (base * mult).toFixed(2);
            }
          }
          await db.updateMaintenanceRequest(id, {
            aiPriority: classification.priority,
            aiSkillTier: classification.skillTierName,
            aiSkillTierId: matchedTier?.id ?? null,
            aiReasoning: classification.reasoning,
            aiClassifiedAt: new Date(),
            skillTierId: matchedTier?.id ?? null,
            hourlyRate: aiHourlyRate,
            isEmergency: classification.priority === "emergency",
          });
        }
      } catch (err) {
        console.error("[AI Classification] Failed:", err);
        // Job still created, just without AI classification
      }

      return { id };
    }),

  update: companyAdminProcedure
    .input(z.object({
      id: z.number(),
      status: z.enum(["open", "assigned", "in_progress", "pending_verification", "completed", "verified", "disputed", "paid", "payment_pending_ach", "canceled"]).optional(),
      skillTierId: z.number().optional(),
      hourlyRate: z.string().optional(),
      isEmergency: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      await db.updateMaintenanceRequest(id, data);
      return { success: true };
    }),

  // Company: override the AI-assigned priority level and update billing rate accordingly
  overridePriority: companyAdminProcedure
    .input(z.object({
      jobId: z.number(),
      priority: z.enum(["low", "medium", "high", "emergency"]),
      reason: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const companyId = getEffectiveCompanyId(ctx);
      // Verify this job belongs to this company
      const job = await db.getMaintenanceRequestById(input.jobId);
      if (!job || job.companyId !== companyId) throw new TRPCError({ code: "NOT_FOUND" });
      // Keep the currently assigned skill tier — priority override should ONLY change
      // whether the emergency multiplier is applied, never swap the tier itself.
      const tiers = await db.getSkillTiers(companyId);
      // Resolve the current effective tier (override takes precedence over AI assignment)
      const currentTierId = (job as any).overrideSkillTierId ?? (job as any).aiSkillTierId ?? job.skillTierId;
      const currentTier = tiers.find(t => t.id === currentTierId) ?? tiers[0];
      // Compute the new hourly rate:
      // - Emergency → baseTierRate × emergencyMultiplier (always from base, never compound)
      // - Any other priority → baseTierRate (plain base rate)
      let newHourlyRate: string | null = currentTier?.hourlyRate ?? null;
      if (input.priority === "emergency" && currentTier?.emergencyMultiplier) {
        const base = parseFloat(currentTier.hourlyRate);
        const mult = parseFloat(currentTier.emergencyMultiplier);
        if (!isNaN(base) && !isNaN(mult)) {
          newHourlyRate = (base * mult).toFixed(2);
        }
      }
      await db.updateMaintenanceRequest(input.jobId, {
        overridePriority: input.priority,
        overrideHourlyRate: newHourlyRate,
        overrideReason: input.reason ?? null,
        overriddenAt: new Date(),
        overriddenByUserId: ctx.user.id,
        // Update live hourlyRate and isEmergency — do NOT change skillTierId
        hourlyRate: newHourlyRate,
        isEmergency: input.priority === "emergency",
      });
      // Log the change to audit history
      await db.addJobChangeHistory({
        jobId: input.jobId,
        companyId,
        userId: ctx.user.id,
        changeType: "priority_override",
        fromValue: (job as any).overridePriority ?? job.aiPriority ?? "unknown",
        toValue: input.priority,
        note: input.reason ?? null,
      });
      return { success: true, newHourlyRate, matchedTierName: currentTier?.name ?? null };
    }),

  // Company: override the skill tier (and thus hourly rate) on a job
  overrideSkillTier: companyAdminProcedure
    .input(z.object({
      jobId: z.number(),
      skillTierId: z.number(),
      reason: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const companyId = getEffectiveCompanyId(ctx);
      const job = await db.getMaintenanceRequestById(input.jobId);
      if (!job || job.companyId !== companyId) throw new TRPCError({ code: "NOT_FOUND" });
      // Look up the selected tier to get its hourly rate
      const tiers = await db.getSkillTiers(companyId);
      const tier = tiers.find(t => t.id === input.skillTierId);
      if (!tier) throw new TRPCError({ code: "NOT_FOUND", message: "Skill tier not found" });
      // Determine effective priority (override or AI) to apply emergency multiplier if needed
      const effectivePriority = (job as any).overridePriority ?? job.aiPriority;
      let newHourlyRate: string = tier.hourlyRate;
      if (effectivePriority === "emergency" && tier.emergencyMultiplier) {
        const base = parseFloat(tier.hourlyRate);
        const mult = parseFloat(tier.emergencyMultiplier);
        if (!isNaN(base) && !isNaN(mult)) {
          newHourlyRate = (base * mult).toFixed(2);
        }
      }
      await db.updateMaintenanceRequest(input.jobId, {
        overrideSkillTierId: input.skillTierId,
        overrideHourlyRate: newHourlyRate,
        overrideReason: input.reason ?? null,
        overriddenAt: new Date(),
        overriddenByUserId: ctx.user.id,
        // Update live hourlyRate and skillTierId so billing uses the new rate immediately
        hourlyRate: newHourlyRate,
        skillTierId: input.skillTierId,
      });
      // Log the change to audit history
      const previousTierId = (job as any).overrideSkillTierId ?? job.skillTierId;
      const previousTier = tiers.find(t => t.id === previousTierId);
      await db.addJobChangeHistory({
        jobId: input.jobId,
        companyId,
        userId: ctx.user.id,
        changeType: "skill_tier_override",
        fromValue: previousTier?.name ?? "unknown",
        toValue: tier.name,
        note: input.reason ?? null,
      });
      return { success: true, newHourlyRate, tierName: tier.name };
    }),

  // Company: edit an open job (title, description, property, tenant info, notes)
  updateJob: companyAdminProcedure
    .input(z.object({
      jobId: z.number(),
      title: z.string().min(1).max(255).optional(),
      description: z.string().optional(),
      propertyId: z.number().optional(),
      tenantName: z.string().max(255).nullable().optional(),
      tenantPhone: z.string().max(32).nullable().optional(),
      tenantEmail: z.string().max(320).nullable().optional(),
      notes: z.string().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const companyId = getEffectiveCompanyId(ctx);
      const job = await db.getMaintenanceRequestById(input.jobId);
      if (!job || job.companyId !== companyId) throw new TRPCError({ code: "NOT_FOUND" });
      if (job.status !== "open") throw new TRPCError({ code: "FORBIDDEN", message: "Only open jobs can be edited" });
      const { jobId, ...updateData } = input;
      await db.updateMaintenanceRequest(jobId, updateData as any);
      return { success: true };
    }),

  // Company: delete an open job (hard delete)
  deleteJob: companyAdminProcedure
    .input(z.object({ jobId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const companyId = getEffectiveCompanyId(ctx);
      const job = await db.getMaintenanceRequestById(input.jobId);
      if (!job || job.companyId !== companyId) throw new TRPCError({ code: "NOT_FOUND" });
      if (job.status !== "open") throw new TRPCError({ code: "FORBIDDEN", message: "Only open jobs can be deleted" });
      await db.deleteMaintenanceRequest(input.jobId);
      return { success: true };
    }),

  // Company: bulk delete jobs (any status) — used for admin cleanup
  bulkDelete: companyAdminProcedure
    .input(z.object({ jobIds: z.array(z.number()).min(1).max(500) }))
    .mutation(async ({ ctx, input }) => {
      const companyId = getEffectiveCompanyId(ctx);
      let deleted = 0;
      for (const jobId of input.jobIds) {
        const job = await db.getMaintenanceRequestById(jobId);
        if (!job || job.companyId !== companyId) continue;
        await db.deleteMaintenanceRequest(jobId);
        deleted++;
      }
      return { deleted };
    }),

  // Company: bypass workflow and mark a job as completed directly
  markAsCompleted: companyAdminProcedure
    .input(z.object({
      jobId: z.number(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const companyId = getEffectiveCompanyId(ctx);
      const job = await db.getMaintenanceRequestById(input.jobId);
      if (!job || job.companyId !== companyId) throw new TRPCError({ code: "NOT_FOUND" });
      // Allow bypassing from any non-terminal status
      const terminalStatuses = ["verified", "paid", "payment_pending_ach", "completed"];
      if (terminalStatuses.includes(job.status)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Job is already completed or paid." });
      }
      await db.updateMaintenanceRequest(input.jobId, {
        status: "completed",
        completionNotes: input.notes ?? "Marked as completed by company.",
        completedAt: new Date(),
      });
      // If a contractor was assigned, notify them the job was closed
      if (job.assignedContractorId) {
        try {
          const contractorUser = await db.getUserEmailByContractorProfileId(job.assignedContractorId);
          if (contractorUser?.id) {
            await db.createNotification({
              userId: contractorUser.id,
              type: 'system',
              title: 'Job Closed by Company',
              body: `The job "${job.title}" has been marked as completed by the company and is now closed.`,
              linkRoute: '/contractor/my-jobs',
              metadata: { jobId: input.jobId },
            });
          }
        } catch { /* non-critical */ }
      }
      // Sync completion back to Buildium if this job came from a PMS integration
      if (job.externalId && job.source && job.source !== 'manual') {
        notifyPmsJobComplete(companyId, job.source, job.externalId)
          .then(r => {
            if (r.ok) console.log(`[PMS] markComplete OK for job ${input.jobId} (${job.source}/${job.externalId})`);
            else console.warn(`[PMS] markComplete failed for job ${input.jobId} (${job.source}/${job.externalId}):`, r.error);
          })
          .catch(e => console.warn(`[PMS] markComplete error for job ${input.jobId}:`, e));
      }
      return { success: true };
    }),

  // Company: get change history for a job (priority/skill tier overrides)
  changeHistory: companyAdminProcedure
    .input(z.object({ jobId: z.number() }))
    .query(async ({ ctx, input }) => {
      const companyId = getEffectiveCompanyId(ctx);
      const job = await db.getMaintenanceRequestById(input.jobId);
      if (!job || job.companyId !== companyId) throw new TRPCError({ code: "NOT_FOUND" });
      return db.getJobChangeHistory(input.jobId, companyId);
    }),

  // Company: re-open an assigned/in_progress job (removes contractor assignment)
  reopen: companyAdminProcedure
    .input(z.object({ jobId: z.number(), note: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const companyId = getEffectiveCompanyId(ctx);
      const { contractorProfileId, contractorUserId } = await db.reopenJob(input.jobId, companyId);
      // Notify the contractor that the job was re-opened
      if (contractorUserId) {
        try {
          const job = await db.getMaintenanceRequestById(input.jobId);
          const company = await db.getCompanyById(companyId);
          await db.createNotification({
            userId: contractorUserId,
            type: 'system',
            title: 'Job Re-opened',
            body: `${company?.name ?? 'A company'} has re-opened the job "${job?.title ?? 'Unknown'}" and returned it to the job board.`,
            linkRoute: '/contractor/jobs',
            metadata: { jobId: input.jobId },
          });
          // Also send email
          const contractorUser = await db.getUserById(contractorUserId);
          if (contractorUser?.email) {
            const appUrl = ctx.req.headers.origin as string ?? '';
            await email.sendJobReopenedEmail({
              to: contractorUser.email,
              contractorName: contractorUser.name ?? 'Contractor',
              jobTitle: job?.title ?? 'Unknown',
              companyName: company?.name ?? 'A company',
              appUrl,
            });
          }
        } catch { /* non-critical */ }
      }
      // Sync reopen back to PMS if this job came from a PMS integration
      const reopenedJob = await db.getMaintenanceRequestById(input.jobId);
      if (reopenedJob?.externalId && reopenedJob?.source && reopenedJob.source !== 'manual') {
        try {
          const reopenResult = await notifyPmsJobReopen(companyId, reopenedJob.source, reopenedJob.externalId);
          console.log(`[PMS Reopen] job=${input.jobId} provider=${reopenedJob.source} externalId=${reopenedJob.externalId} ok=${reopenResult.ok}${reopenResult.error ? ' error=' + reopenResult.error : ''}`);
        } catch (e) {
          console.error('[PMS Reopen] Failed to notify PMS:', e);
        }
      }
      return { success: true };
    }),

  // Company: get jobs awaiting verification
  pendingVerification: companyAdminProcedure.query(async ({ ctx }) => {
    if (!getEffectiveCompanyId(ctx)) throw new TRPCError({ code: "NOT_FOUND" });
    const rows = await db.getJobsPendingVerification(getEffectiveCompanyId(ctx));
    // Enrich each job with live time session data so the verification dialog
    // always shows accurate labor minutes even if the job record is stale.
    const enriched = await Promise.all(rows.map(async (row: any) => {
      const sessions = await db.getTimeSessionsByJob(row.job.id);
      // Include both completed and flagged sessions in the labor calculation
      const completedSessions = sessions.filter((s: any) => (s.status === "completed" || s.status === "flagged") && s.totalMinutes);
      const liveMinutes = completedSessions.reduce((sum: number, s: any) => sum + (s.totalMinutes ?? 0), 0);
      const storedMinutes = row.job.totalLaborMinutes ?? 0;
      const totalLaborMinutes = liveMinutes > storedMinutes ? liveMinutes : storedMinutes;
      // Resolve hourlyRate: use job's stored rate, or fall back to the company's skill tier rate
      let hourlyRate = parseFloat(row.job.hourlyRate ?? "0");
      if (hourlyRate === 0 && row.job.skillTierId) {
        try {
          const tiers = await db.getSkillTiers(row.job.companyId);
          const tier = tiers.find((t: any) => t.id === row.job.skillTierId);
          if (tier?.hourlyRate) {
            hourlyRate = parseFloat(tier.hourlyRate);
            if (row.job.isEmergency && tier.emergencyMultiplier) {
              hourlyRate = hourlyRate * parseFloat(tier.emergencyMultiplier);
            }
          }
        } catch { /* non-critical */ }
      }
      const totalLaborCost = hourlyRate > 0 && totalLaborMinutes > 0
        ? ((totalLaborMinutes / 60) * hourlyRate).toFixed(2)
        : row.job.totalLaborCost ?? null;
      // Enrich parts receipts total so payment dialog shows accurate parts cost
      const receipts = await db.getPartsReceiptsByJob(row.job.id);
      const livePartsCost = receipts.reduce((sum: number, r: any) => sum + parseFloat(r.amount ?? "0"), 0);
      const totalPartsCost = livePartsCost > 0
        ? livePartsCost.toFixed(2)
        : row.job.totalPartsCost ?? null;
      // Enrich with contractor name for the rating dialog
      let contractorName: string | undefined;
      if (row.job.assignedContractorId) {
        try {
          const contractorUserId = await db.getUserIdByContractorProfileId(row.job.assignedContractorId);
          if (contractorUserId) {
            const contractorUser = await db.getUserById(contractorUserId);
            contractorName = contractorUser?.name ?? undefined;
          }
        } catch { /* non-critical */ }
      }
      return {
        ...row,
        job: {
          ...row.job,
          totalLaborMinutes: totalLaborMinutes > 0 ? totalLaborMinutes : row.job.totalLaborMinutes,
          totalLaborCost,
          totalPartsCost,
          // Return the resolved hourlyRate so the payment dialog shows the correct rate
          hourlyRate: hourlyRate > 0 ? hourlyRate.toFixed(2) : row.job.hourlyRate,
          sessionCount: completedSessions.length,
          receipts,
          contractorName,
        },
      };
    }));
    return enriched;
  }),

  // Company: approve or dispute a completed job
  verifyJob: companyAdminProcedure
    .input(z.object({
      jobId: z.number(),
      action: z.enum(["approve", "dispute"]),
      notes: z.string().min(0).default(""),
      /** Optional: specific payment method ID to charge. Falls back to company default if omitted. */
      paymentMethodId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const companyId = getEffectiveCompanyId(ctx);

      // Verify the job first
      await db.verifyJob(input.jobId, companyId, ctx.user.id, input.action, input.notes);

      // Sync completion back to PMS (best-effort, non-blocking)
      if (input.action === "approve") {
        try {
          const jobForPms = await db.getMaintenanceRequestById(input.jobId);
          if (jobForPms?.externalId && jobForPms.source && jobForPms.source !== "manual") {
            notifyPmsJobComplete(companyId, jobForPms.source, jobForPms.externalId)
              .then(r => { if (!r.ok) console.warn(`[PMS] markComplete failed for job ${input.jobId}:`, r.error); })
              .catch(e => console.warn(`[PMS] markComplete error for job ${input.jobId}:`, e));
          }
        } catch { /* non-critical */ }
      }

      // Only trigger payment on approval
      if (input.action === "approve") {
        try {
          const job = await db.getMaintenanceRequestById(input.jobId);
          if (!job) throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });

          const company = await db.getCompanyById(companyId);
          if (!company?.stripeCustomerId) {
            // No payment method — mark verified but skip payment
            console.warn(`[Payment] Company ${companyId} has no Stripe customer. Skipping payment for job ${input.jobId}.`);
            return { success: true, paymentSkipped: true, reason: "no_payment_method" };
          }

          // Get contractor profile
          const contractorProfile = job.assignedContractorId
            ? await db.getContractorProfileById(job.assignedContractorId)
            : null;
          if (!contractorProfile?.stripeAccountId) {
            console.warn(`[Payment] Contractor ${job.assignedContractorId} has no Stripe account. Skipping payment for job ${input.jobId}.`);
            return { success: true, paymentSkipped: true, reason: "contractor_no_stripe" };
          }
          // Live-check Stripe account status (don't rely solely on cached stripeOnboardingComplete flag)
          let contractorStripeReady = contractorProfile.stripeOnboardingComplete;
          if (!contractorStripeReady) {
            try {
              const acct = await stripe.accounts.retrieve(contractorProfile.stripeAccountId);
              contractorStripeReady = acct.charges_enabled === true && acct.payouts_enabled === true;
              if (contractorStripeReady) {
                // Update cached flag so future checks are fast
                await db.updateContractorProfile(contractorProfile.id, { stripeOnboardingComplete: true });
              }
            } catch (e) {
              console.warn(`[Payment] Could not verify Stripe account for contractor ${contractorProfile.id}:`, e);
            }
          }
          if (!contractorStripeReady) {
            console.warn(`[Payment] Contractor ${job.assignedContractorId} Stripe account not ready. Skipping payment for job ${input.jobId}.`);
            return { success: true, paymentSkipped: true, reason: "contractor_no_stripe" };
          }

          // Get platform fee settings — plan takes priority over global settings
          const companyPlan = await db.getEffectivePlanForCompany(companyId);
          const globalSettings = await getPlatformSettings();
          let feePercent = companyPlan?.platformFeePercent != null
            ? parseFloat(String(companyPlan.platformFeePercent))
            : parseFloat(globalSettings.platformFeePercent ?? "5");
          const perListingEnabled = companyPlan != null
            ? companyPlan.perListingFeeEnabled
            : globalSettings.perListingFeeEnabled;
          let perListingAmount = companyPlan != null
            ? parseFloat(String(companyPlan.perListingFeeAmount ?? "0"))
            : parseFloat(globalSettings.perListingFeeAmount ?? "0");

          // Apply active promo discounts (service charge + listing fee)
          const promoDiscounts = await db.getActivePromoDiscountsForCompany(companyId);
          if (promoDiscounts.serviceChargeDiscountPercent > 0) {
            feePercent = feePercent * (1 - promoDiscounts.serviceChargeDiscountPercent / 100);
          }
          if (promoDiscounts.listingFeeDiscountPercent > 0) {
            perListingAmount = perListingAmount * (1 - promoDiscounts.listingFeeDiscountPercent / 100);
          }
          // Calculate costs in cents — recalculate from time sessions if job costs are null
          let laborCost = parseFloat(job.totalLaborCost ?? "0");
          let partsCost = parseFloat(job.totalPartsCost ?? "0");
          if (laborCost === 0 && job.totalLaborCost == null) {
            // Fallback: recalculate from time sessions
            try {
              const jobSessions = await db.getTimeSessionsByJob(input.jobId);
              const autoCloseNowPay = Date.now();
              for (const s of jobSessions) {
                if ((s as any).status === "active" && (s as any).clockInTime) {
                  const mins = Math.max(1, Math.round((autoCloseNowPay - (s as any).clockInTime) / 60000));
                  await db.updateTimeSession((s as any).id, {
                    clockOutTime: autoCloseNowPay,
                    clockOutMethod: "auto_job_complete" as any,
                    status: "completed",
                    totalMinutes: mins,
                    billableMinutes: mins,
                  });
                }
              }
              const refreshedSessions = await db.getTimeSessionsByJob(input.jobId);
              // Respect excludeOutOfGeofenceSessions company setting
              const companySettingsPay = await db.getCompanySettings(companyId);
              const excludeOOGPay = companySettingsPay?.excludeOutOfGeofenceSessions ?? false;
              const completedPay = refreshedSessions.filter((s: any) => {
                if (s.status !== "completed" && s.status !== "flagged") return false;
                if (!s.totalMinutes) return false;
                if (excludeOOGPay && !s.clockInVerified) return false;
                return true;
              });
              const totalMins = completedPay.reduce((sum: number, s: any) => sum + (s.totalMinutes ?? 0), 0);
              // Resolve rate: use stored hourlyRate, or fall back to skill tier
              let rate = parseFloat(job.hourlyRate ?? "0");
              if (rate === 0 && job.skillTierId) {
                try {
                  const tiers = await db.getSkillTiers(companyId);
                  const tier = tiers.find((t: any) => t.id === job.skillTierId);
                  if (tier?.hourlyRate) {
                    rate = parseFloat(tier.hourlyRate);
                    if (job.isEmergency && tier.emergencyMultiplier) {
                      rate = rate * parseFloat(tier.emergencyMultiplier);
                    }
                  }
                } catch { /* non-critical */ }
              }
              if (totalMins > 0 && rate > 0) {
                laborCost = parseFloat(((totalMins / 60) * rate).toFixed(2));
                // Persist recalculated cost back to the job
                await db.updateMaintenanceRequest(input.jobId, {
                  totalLaborMinutes: totalMins,
                  totalLaborCost: laborCost.toFixed(2),
                  hourlyRate: rate.toFixed(2),
                });
              }
            } catch (e) {
              console.warn(`[Payment] Could not recalculate labor cost for job ${input.jobId}:`, e);
            }
          }
          const jobCostDollars = laborCost + partsCost;
          const jobCostCents = Math.round(jobCostDollars * 100);
          const platformFeeCents = Math.round(jobCostDollars * (feePercent / 100) * 100);
          const perListingFeeCents = perListingEnabled ? Math.round(perListingAmount * 100) : 0;

          if (jobCostCents <= 0) {
            console.warn(`[Payment] Job ${input.jobId} has zero cost. Skipping payment.`);
            return { success: true, paymentSkipped: true, reason: "zero_cost" };
          }

          const result = await chargeJobAndPayContractor({
            stripeCustomerId: company.stripeCustomerId,
            contractorStripeAccountId: contractorProfile.stripeAccountId,
            jobCostCents,
            platformFeeCents,
            perListingFeeCents,
            jobId: input.jobId,
            companyId,
            contractorProfileId: contractorProfile.id,
            description: `Maintenance job #${input.jobId}: ${job.title}`,
            paymentMethodId: input.paymentMethodId,
          });

          // Decrement promo code billing cycles after successful charge
          await db.decrementPromoJobCycles(companyId);
          // Detect whether the payment was made with ACH (bank account) — ACH takes 1-3 business days to settle
          let isAchPayment = false;
          try {
            const pi = await stripe.paymentIntents.retrieve(result.paymentIntentId);
            const pmId = pi.payment_method as string | undefined;
            if (pmId) {
              const pm = await stripe.paymentMethods.retrieve(pmId);
              isAchPayment = pm.type === "us_bank_account";
            }
          } catch { /* non-critical — default to card flow */ }

          const jobStatus = isAchPayment ? "payment_pending_ach" : "paid";
          const txStatus = isAchPayment ? "escrow" : "captured";

          // Record transaction
          await db.createTransaction({
            maintenanceRequestId: input.jobId,
            companyId,
            contractorProfileId: contractorProfile.id,
            laborCost: laborCost.toFixed(2),
            partsCost: partsCost.toFixed(2),
            platformFee: (result.platformFeeCents / 100).toFixed(2),
            totalCharged: (result.totalChargeCents / 100).toFixed(2),
            contractorPayout: (result.jobCostCents / 100).toFixed(2),
            stripePaymentIntentId: result.paymentIntentId,
            stripeTransferId: result.transferId,
            status: txStatus,
            paidAt: isAchPayment ? undefined : new Date(),
          });
          // Update job with payment info
          await db.updateMaintenanceRequest(input.jobId, {
            stripePaymentIntentId: result.paymentIntentId,
            status: jobStatus,
            paidAt: isAchPayment ? undefined : new Date(),
            platformFee: (result.platformFeeCents / 100).toFixed(2),
            totalCost: (result.totalChargeCents / 100).toFixed(2),
          });

          // Email: notify contractor of payment
          try {
            const contractorUser = contractorProfile?.id
              ? await db.getUserEmailByContractorProfileId(contractorProfile.id)
              : null;
            if (contractorUser?.email && contractorUser.id) {
              const emailEnabled = await db.isEmailEnabled(contractorUser.id, 'jobPaid');
              if (emailEnabled) {
                email.sendJobPaidEmail({
                  to: contractorUser.email,
                  contractorName: contractorUser.name ?? "Contractor",
                  jobTitle: job.title,
                  payoutAmount: `$${(result.jobCostCents / 100).toFixed(2)}`,
                  appUrl: ENV.appUrl,
                }).catch(() => {});
              }
            }
          } catch { /* non-critical */ }

          return {
            success: true,
            paymentSkipped: false,
            totalCharged: result.totalChargeCents / 100,
            contractorPayout: result.jobCostCents / 100,
          };
        } catch (err) {
          console.error(`[Payment] Error processing payment for job ${input.jobId}:`, err);
          // Don't fail the verification — job is verified, payment can be retried
          const message = err instanceof Error ? err.message : "Payment processing failed";
          return { success: true, paymentSkipped: true, reason: message };
        }
      }

      // Email: notify contractor if job was disputed
      if (input.action === "dispute") {
        try {
          const job = await db.getMaintenanceRequestById(input.jobId);
          if (job?.assignedContractorId) {
            const contractorUser = await db.getUserEmailByContractorProfileId(job.assignedContractorId);
            if (contractorUser?.email && contractorUser.id) {
              const emailEnabled = await db.isEmailEnabled(contractorUser.id, 'jobDisputed');
              if (emailEnabled) {
                email.sendJobDisputedEmail({
                  to: contractorUser.email,
                  contractorName: contractorUser.name ?? "Contractor",
                  jobTitle: job.title,
                  disputeReason: input.notes,
                  appUrl: ENV.appUrl,
                }).catch(() => {});
              }
            }
          }
        } catch { /* non-critical */ }
      }

      return { success: true };
    }),

  // Retry payment for a verified job that had payment skipped (e.g., contractor Stripe not ready)
  retryPayment: companyAdminProcedure
    .input(z.object({
      jobId: z.number(),
      paymentMethodId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const companyId = getEffectiveCompanyId(ctx);
      const job = await db.getMaintenanceRequestById(input.jobId);
      if (!job || job.companyId !== companyId) throw new TRPCError({ code: "NOT_FOUND" });
      if (!['verified', 'paid_out'].includes(job.status ?? '')) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Job must be in verified status to retry payment" });
      }
      // Check if transaction already exists
      const existingTxn = await db.getTransactionByJob(input.jobId);
      if (existingTxn) throw new TRPCError({ code: "CONFLICT", message: "Payment already processed for this job" });

      const company = await db.getCompanyById(companyId);
      if (!company?.stripeCustomerId) throw new TRPCError({ code: "BAD_REQUEST", message: "No payment method on file" });

      const contractorProfile = job.assignedContractorId
        ? await db.getContractorProfileById(job.assignedContractorId)
        : null;
      if (!contractorProfile?.stripeAccountId) throw new TRPCError({ code: "BAD_REQUEST", message: "Contractor has no Stripe account" });

      // Live-check Stripe account
      let contractorStripeReady = contractorProfile.stripeOnboardingComplete;
      if (!contractorStripeReady) {
        try {
          const acct = await stripe.accounts.retrieve(contractorProfile.stripeAccountId);
          contractorStripeReady = acct.charges_enabled === true && acct.payouts_enabled === true;
          if (contractorStripeReady) await db.updateContractorProfile(contractorProfile.id, { stripeOnboardingComplete: true });
        } catch { /* ignore */ }
      }
      if (!contractorStripeReady) throw new TRPCError({ code: "BAD_REQUEST", message: "Contractor Stripe account is not ready to receive payments" });

      // Recalculate costs if null
      let laborCost = parseFloat(job.totalLaborCost ?? "0");
      let partsCost = parseFloat(job.totalPartsCost ?? "0");
      if (laborCost === 0 && job.totalLaborCost == null) {
        const jobSessions = await db.getTimeSessionsByJob(input.jobId);
        const autoNow = Date.now();
        for (const s of jobSessions) {
          if ((s as any).status === "active" && (s as any).clockInTime) {
            const mins = Math.max(1, Math.round((autoNow - (s as any).clockInTime) / 60000));
            await db.updateTimeSession((s as any).id, { clockOutTime: autoNow, clockOutMethod: "auto_job_complete" as any, status: "completed", totalMinutes: mins, billableMinutes: mins });
          }
        }
        const refreshed = await db.getTimeSessionsByJob(input.jobId);
        const completed = refreshed.filter((s: any) => s.status === "completed" && s.totalMinutes);
        const totalMins = completed.reduce((sum: number, s: any) => sum + (s.totalMinutes ?? 0), 0);
        const rate = parseFloat(job.hourlyRate ?? "0");
        if (totalMins > 0 && rate > 0) {
          laborCost = parseFloat(((totalMins / 60) * rate).toFixed(2));
          await db.updateMaintenanceRequest(input.jobId, { totalLaborMinutes: totalMins, totalLaborCost: laborCost.toFixed(2), hourlyRate: rate.toFixed(2) });
        }
      }

      const jobCostDollars = laborCost + partsCost;
      const jobCostCents = Math.round(jobCostDollars * 100);
      if (jobCostCents <= 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Job has zero cost — cannot process payment" });

      const companyPlan = await db.getEffectivePlanForCompany(companyId);
      const globalSettings = await getPlatformSettings();
      const feePercent = companyPlan?.platformFeePercent != null
        ? parseFloat(String(companyPlan.platformFeePercent))
        : parseFloat(globalSettings.platformFeePercent ?? "5");
      const perListingEnabled = companyPlan != null ? companyPlan.perListingFeeEnabled : globalSettings.perListingFeeEnabled;
      const perListingAmount = companyPlan != null ? parseFloat(String(companyPlan.perListingFeeAmount ?? "0")) : parseFloat(globalSettings.perListingFeeAmount ?? "0");
      const platformFeeCents = Math.round(jobCostDollars * (feePercent / 100) * 100);
      const perListingFeeCents = perListingEnabled ? Math.round(perListingAmount * 100) : 0;

      const result = await chargeJobAndPayContractor({
        stripeCustomerId: company.stripeCustomerId,
        contractorStripeAccountId: contractorProfile.stripeAccountId,
        jobCostCents,
        platformFeeCents,
        perListingFeeCents,
        jobId: input.jobId,
        companyId,
        contractorProfileId: contractorProfile.id,
        description: `Maintenance job #${input.jobId}: ${job.title}`,
        paymentMethodId: input.paymentMethodId,
      });

      let isAchPayment = false;
      try {
        const pi = await stripe.paymentIntents.retrieve(result.paymentIntentId);
        const pmId = pi.payment_method as string | undefined;
        if (pmId) { const pm = await stripe.paymentMethods.retrieve(pmId); isAchPayment = pm.type === "us_bank_account"; }
      } catch { /* non-critical */ }

      const jobStatus = isAchPayment ? "payment_pending_ach" : "paid";
      const txStatus = isAchPayment ? "escrow" : "captured";
      await db.createTransaction({
        maintenanceRequestId: input.jobId,
        companyId,
        contractorProfileId: contractorProfile.id,
        laborCost: laborCost.toFixed(2),
        partsCost: partsCost.toFixed(2),
        platformFee: (result.platformFeeCents / 100).toFixed(2),
        totalCharged: (result.totalChargeCents / 100).toFixed(2),
        contractorPayout: (result.jobCostCents / 100).toFixed(2),
        stripePaymentIntentId: result.paymentIntentId,
        stripeTransferId: result.transferId,
        status: txStatus,
        paidAt: isAchPayment ? undefined : new Date(),
      });
      await db.updateMaintenanceRequest(input.jobId, {
        stripePaymentIntentId: result.paymentIntentId,
        status: jobStatus,
        paidAt: isAchPayment ? undefined : new Date(),
        platformFee: (result.platformFeeCents / 100).toFixed(2),
        totalCost: (result.totalChargeCents / 100).toFixed(2),
      });
      return { success: true, status: jobStatus };
    }),

  // Get time sessions for a job
  timeSessions: protectedProcedure
    .input(z.object({ jobId: z.number() }))
    .query(async ({ input }) => {
      return db.getTimeSessionsByJob(input.jobId);
    }),

  // Get parts receipts for a job
  receipts: protectedProcedure
    .input(z.object({ jobId: z.number() }))
    .query(async ({ input }) => {
      return db.getPartsReceiptsByJob(input.jobId);
    }),
});

// ─── Time Tracking Router ───────────────────────────────────────────────────
const timeTrackingRouter = router({
  clockIn: contractorProcedure
    .input(z.object({
      jobId: z.number(),
      latitude: z.string(),
      longitude: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const profile = await getEffectiveContractorProfile(ctx);
      if (!profile) throw new TRPCError({ code: "NOT_FOUND" });
      // ─── Plan feature check: gpsTimeTracking ──────────────────────────────
      const hasGps = await db.contractorHasPlanFeature(profile.id, "gpsTimeTracking");
      if (!hasGps) throw new TRPCError({ code: "FORBIDDEN", message: "GPS time tracking is not included in your current plan. Please upgrade to use this feature." });
      const job = await db.getMaintenanceRequestById(input.jobId);
      if (!job) throw new TRPCError({ code: "NOT_FOUND" });
      if (job.assignedContractorId !== profile.id) throw new TRPCError({ code: "FORBIDDEN" });

      // ─── Geofence enforcement & clockInVerified flag ──────────────────────
      // For on_site_only: block clock-in if outside radius.
      // For all policies: compute clockInVerified = true if within geofence.
      const clockInSettings = await db.getCompanySettings(job.companyId);
      const billablePolicy = clockInSettings?.billableTimePolicy ?? "on_site_only";
      let clockInVerified = false;
      if (job.propertyId) {
        const property = await db.getPropertyByIdOnly(job.propertyId);
        if (property?.latitude && property?.longitude) {
          const radiusFeet = clockInSettings?.geofenceRadiusFeet ?? 500;
          const radiusMeters = radiusFeet * 0.3048;
          const R = 6371000;
          const lat1 = parseFloat(String(property.latitude));
          const lng1 = parseFloat(String(property.longitude));
          const lat2 = parseFloat(input.latitude);
          const lng2 = parseFloat(input.longitude);
          const dLat = ((lat2 - lat1) * Math.PI) / 180;
          const dLng = ((lng2 - lng1) * Math.PI) / 180;
          const a = Math.sin(dLat / 2) ** 2 +
            Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
          const distanceMeters = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          if (distanceMeters <= radiusMeters) {
            clockInVerified = true;
          } else if (billablePolicy === "on_site_only") {
            throw new TRPCError({
              code: "PRECONDITION_FAILED",
              message: `GEOFENCE_REQUIRED:${radiusFeet}`,
            });
          }
        }
      }

      // Check for existing active session
      const existing = await db.getActiveTimeSession(input.jobId, profile.id);
      if (existing) throw new TRPCError({ code: "BAD_REQUEST", message: "Already clocked in" });

      const id = await db.createTimeSession({
        maintenanceRequestId: input.jobId,
        contractorProfileId: profile.id,
        companyId: job.companyId,
        clockInTime: Date.now(),
        clockInLat: input.latitude,
        clockInLng: input.longitude,
        clockInVerified,
      });

      // Update job status and persist resolved hourlyRate so LiveTracking can show it
      const clockInUpdates: Record<string, any> = {};
      if (job.status === "assigned") clockInUpdates.status = "in_progress";
      // If the job has no hourlyRate yet, resolve it from the skill tier now
      if (!job.hourlyRate && job.skillTierId) {
        try {
          const tiers = await db.getSkillTiers(job.companyId);
          const tier = tiers.find((t: any) => t.id === job.skillTierId);
          if (tier?.hourlyRate) {
            let resolvedRate = parseFloat(tier.hourlyRate);
            if (job.isEmergency && tier.emergencyMultiplier) {
              resolvedRate = resolvedRate * parseFloat(tier.emergencyMultiplier);
            }
            clockInUpdates.hourlyRate = resolvedRate.toFixed(2);
          }
        } catch { /* non-critical */ }
      }
      if (Object.keys(clockInUpdates).length > 0) {
        await db.updateMaintenanceRequest(input.jobId, clockInUpdates);
      }

      // Notify company owner that contractor clocked in (if preference enabled)
      try {
        const companySettings = await db.getCompanySettings(job.companyId);
        if (companySettings?.notifyOnClockIn !== false) {
          const contractorDisplayName = profile.businessName ?? ctx.user.name ?? "A contractor";
          await notifyOwner({
            title: `\uD83D\uDCCD Contractor Clocked In \u2014 ${job.title}`,
            content: `${contractorDisplayName} has clocked in on "${job.title}". Live GPS tracking is now active.`,
          });
        }
      } catch { /* non-critical — don't fail the clock-in */ }

      return { sessionId: id };
    }),

  clockOut: contractorProcedure
    .input(z.object({
      sessionId: z.number(),
      latitude: z.string(),
      longitude: z.string(),
      method: z.enum(["manual", "auto_geofence", "auto_timeout"]).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const clockOutTime = Date.now();
      // Calculate totalMinutes from clockInTime before updating
      const existingSession = await db.getTimeSessionById(input.sessionId);
      const totalMinutes = existingSession?.clockInTime
        ? Math.max(1, Math.round((clockOutTime - existingSession.clockInTime) / 60000))
        : null;
      await db.updateTimeSession(input.sessionId, {
        clockOutTime,
        clockOutLat: input.latitude,
        clockOutLng: input.longitude,
        clockOutMethod: input.method ?? "manual",
        status: "completed",
        ...(totalMinutes !== null && { totalMinutes, billableMinutes: totalMinutes }),
      });

      // Recalculate and persist totalLaborCost on the job after clock-out
      try {
        if (existingSession?.maintenanceRequestId) {
          const job = await db.getMaintenanceRequestById(existingSession.maintenanceRequestId);
          if (job) {
            const allSessions = await db.getTimeSessionsByJob(existingSession.maintenanceRequestId);
            const completedSessions = allSessions.filter((s: any) => s.status === "completed" && s.totalMinutes != null);
            const totalLaborMinutes = completedSessions.reduce((sum: number, s: any) => sum + (s.totalMinutes ?? 0), 0);
            const hourlyRate = parseFloat((job as any).hourlyRate ?? "0");
            const totalLaborCost = hourlyRate > 0 && totalLaborMinutes > 0
              ? ((hourlyRate * totalLaborMinutes) / 60).toFixed(2)
              : null;
            if (totalLaborCost !== null) {
              await db.updateMaintenanceRequest(existingSession.maintenanceRequestId, { totalLaborCost } as any);
            }
          }
        }
      } catch (err) {
        console.error("[clockOut] Failed to recalculate totalLaborCost:", err);
      }

      // Notify company owner that contractor clocked out (if preference enabled)
      try {
        const profile = await getEffectiveContractorProfile(ctx);
        const session = await db.getTimeSessionById(input.sessionId);
        const companySettings = session ? await db.getCompanySettings(session.companyId) : null;
        if (companySettings?.notifyOnClockOut !== false) {
          const contractorDisplayName = profile.businessName ?? ctx.user.name ?? "A contractor";
          const methodLabel =
            input.method === "auto_geofence" ? " (auto \u2014 returned to origin)" :
            input.method === "auto_timeout" ? " (auto \u2014 session timeout)" : "";
          await notifyOwner({
            title: `\u23F1\uFE0F Contractor Clocked Out${methodLabel}`,
            content: `${contractorDisplayName} has clocked out${methodLabel}. GPS tracking has stopped.`,
          });
        }
      } catch { /* non-critical */ }

      return { success: true };
    }),

  addPing: contractorProcedure
    .input(z.object({
      sessionId: z.number(),
      latitude: z.string(),
      longitude: z.string(),
      locationType: z.enum(["property", "store", "origin", "transit", "unknown"]).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // ─── Plan feature check: gpsTimeTracking ──────────────────────────────
      const profile = await getEffectiveContractorProfile(ctx);
      const hasGps = await db.contractorHasPlanFeature(profile.id, "gpsTimeTracking");
      if (!hasGps) throw new TRPCError({ code: "FORBIDDEN", message: "GPS tracking is not included in your current plan." });
      await db.addLocationPing({
        timeSessionId: input.sessionId,
        latitude: input.latitude,
        longitude: input.longitude,
        timestamp: Date.now(),
        locationType: input.locationType,
      });
      return { success: true };
    }),

  getLocationPings: protectedProcedure
    .input(z.object({ sessionId: z.number() }))
    .query(async ({ input }) => {
      return db.getLocationPings(input.sessionId);
    }),

  // Contractor: get active session for a job (to restore state on page reload)
  getActiveSessionForJob: contractorProcedure
    .input(z.object({ jobId: z.number() }))
    .query(async ({ ctx, input }) => {
      const profile = await getEffectiveContractorProfile(ctx);
      if (!profile) return null;
      return db.getActiveTimeSession(input.jobId, profile.id);
    }),

  // Get auto clock-out settings (public for contractor use)
  getAutoClockOutSettings: protectedProcedure
    .query(async () => {
      const settings = await getPlatformSettings();
      return {
        autoClockOutMinutes: settings.autoClockOutMinutes ?? 15,
        autoClockOutRadiusMeters: settings.autoClockOutRadiusMeters ?? 200,
      };
    }),

  // Company: get all active sessions (live tracking view)
  getActiveSessionsForCompany: companyAdminProcedure
    .query(async ({ ctx }) => {
      const companyId = getEffectiveCompanyId(ctx);
      const sessions = await db.getActiveSessionsByCompany(companyId);
      // Attach latest ping for each session
      const enriched = await Promise.all(sessions.map(async (s) => {
        const latestPing = await db.getLatestPingForSession(s.sessionId);
        return {
          ...s,
          latestLat: latestPing?.latitude ?? s.clockInLat,
          latestLng: latestPing?.longitude ?? s.clockInLng,
          latestPingTime: latestPing?.timestamp ?? s.clockInTime,
          latestLocationType: latestPing?.locationType ?? "unknown",
        };
      }));
      return enriched;
    }),

  getCompletedSessionsForCompany: companyAdminProcedure
    .input(z.object({ limit: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      const companyId = getEffectiveCompanyId(ctx);
      return db.getCompletedSessionsByCompany(companyId, input.limit ?? 50);
    }),

  // Company: flag a time session for review (sets status to 'flagged')
  flagSession: companyAdminProcedure
    .input(z.object({
      sessionId: z.number(),
      /** Optional note explaining why the session is flagged */
      note: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const companyId = getEffectiveCompanyId(ctx);
      // Verify the session belongs to this company
      const session = await db.getTimeSessionById(input.sessionId);
      if (!session || session.companyId !== companyId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });
      }
      await db.updateTimeSession(input.sessionId, { status: "flagged" });
      // Notify the contractor via owner notification (non-critical)
      try {
        await notifyOwner({
          title: `\u26A0\uFE0F Time Session Flagged for Review`,
          content: `Session #${input.sessionId} has been flagged for review by your company.${input.note ? ` Note: ${input.note}` : ""}`,
        });
      } catch { /* non-critical */ }
      return { success: true };
    }),

  // Company: unflag a time session (restore to completed)
  unflagSession: companyAdminProcedure
    .input(z.object({ sessionId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const companyId = getEffectiveCompanyId(ctx);
      const session = await db.getTimeSessionById(input.sessionId);
      if (!session || session.companyId !== companyId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });
      }
      await db.updateTimeSession(input.sessionId, { status: "completed" });
      return { success: true };
    }),
});

// ─── Parts & Receipts Router ────────────────────────────────────────────────
const receiptsRouter = router({
  create: contractorProcedure
    .input(z.object({
      jobId: z.number(),
      storeName: z.string().optional(),
      description: z.string().optional(),
      amount: z.string(),
      receiptImageUrl: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const profile = await getEffectiveContractorProfile(ctx);
      if (!profile) throw new TRPCError({ code: "NOT_FOUND" });
      const job = await db.getMaintenanceRequestById(input.jobId);
      if (!job) throw new TRPCError({ code: "NOT_FOUND" });
      const id = await db.createPartsReceipt({
        maintenanceRequestId: input.jobId,
        contractorProfileId: profile.id,
        companyId: job.companyId,
        storeName: input.storeName ?? null,
        description: input.description ?? null,
        amount: input.amount,
        receiptImageUrl: input.receiptImageUrl ?? null,
      });
      // Recalculate and persist totalPartsCost on the job
      try {
        const allReceipts = await db.getPartsReceiptsByJob(input.jobId);
        const newTotal = allReceipts.reduce((sum: number, r: any) => sum + parseFloat(r.amount ?? "0"), 0);
        await db.updateMaintenanceRequest(input.jobId, { totalPartsCost: newTotal.toFixed(2) } as any);
      } catch (err) {
        console.error("[receipts.create] Failed to update totalPartsCost:", err);
      }
      return { id };
    }),
  approve: companyAdminProcedure
    .input(z.object({ receiptId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await db.approvePartsReceipt(input.receiptId, ctx.user.id);
      return { success: true };
    }),
});

// ─── Integration Connectors Router ──────────────────────────────────────────
const integrationsRouter = router({
  list: companyAdminProcedure.query(async ({ ctx }) => {
    if (!getEffectiveCompanyId(ctx)) throw new TRPCError({ code: "NOT_FOUND" });
    return db.getIntegrationConnectors(getEffectiveCompanyId(ctx));
  }),

  upsert: companyAdminProcedure
    .input(z.object({
      provider: z.enum(["buildium", "appfolio", "rentmanager", "yardi", "doorloop", "realpage", "propertyware"]),
      apiKey: z.string().optional(),
      apiSecret: z.string().optional(),
      baseUrl: z.string().optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!getEffectiveCompanyId(ctx)) throw new TRPCError({ code: "NOT_FOUND" });
      const id = await db.upsertIntegrationConnector({
        companyId: getEffectiveCompanyId(ctx),
        provider: input.provider,
        apiKey: input.apiKey ?? null,
        apiSecret: input.apiSecret ?? null,
        baseUrl: input.baseUrl ?? null,
        isActive: input.isActive ?? false,
      });
      return { id };
    }),
});

// ─── Transactions Router ────────────────────────────────────────────────────
const transactionsRouter = router({
  getByJob: companyAdminProcedure
    .input(z.object({ jobId: z.number() }))
    .query(async ({ input }) => {
      return db.getTransactionByJob(input.jobId);
    }),
  listByCompany: companyAdminProcedure.query(async ({ ctx }) => {
    if (!getEffectiveCompanyId(ctx)) throw new TRPCError({ code: "NOT_FOUND" });
    return db.getTransactionsByCompany(getEffectiveCompanyId(ctx));
  }),

  listByContractor: contractorProcedure.query(async ({ ctx }) => {
    const profile = await getEffectiveContractorProfile(ctx);
    if (!profile) return [];
    return db.getTransactionsByContractor(profile.id);
  }),
  expenseReport: companyAdminProcedure.query(async ({ ctx }) => {
    const companyId = getEffectiveCompanyId(ctx);
    if (!companyId) throw new TRPCError({ code: "NOT_FOUND" });
    // ─── Plan feature check: expenseReports ──────────────────────────────────
    const hasReports = await db.companyHasPlanFeature(companyId, "expenseReports");
    if (!hasReports) throw new TRPCError({ code: "FORBIDDEN", message: "Expense reports are not included in your current plan. Please upgrade to access this feature." });
    return db.getCompanyExpenseReport(companyId);
  }),
});

// ─── Ratings Router ──────────────────────────────────────────────────────────
const ratingsRouter = router({
  // Company: submit a rating for a contractor after a paid job
  submit: companyAdminProcedure
    .input(z.object({
      maintenanceRequestId: z.number(),
      stars: z.number().int().min(1).max(5),
      review: z.string().max(1000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const companyId = getEffectiveCompanyId(ctx);
      // ─── Plan feature check: contractorRatings ───────────────────────────────
      const hasRatings = await db.companyHasPlanFeature(companyId, "contractorRatings");
      if (!hasRatings) throw new TRPCError({ code: "FORBIDDEN", message: "Contractor ratings are not included in your current plan. Please upgrade to use this feature." });
      // Verify the job belongs to this company and is paid
      const job = await db.getMaintenanceRequestById(input.maintenanceRequestId);
      if (!job || job.companyId !== companyId) throw new TRPCError({ code: "NOT_FOUND" });
      if (!['verified', 'paid'].includes(job.status)) throw new TRPCError({ code: "BAD_REQUEST", message: "Job must be verified or paid to rate" });
      if (!job.assignedContractorId) throw new TRPCError({ code: "BAD_REQUEST", message: "No contractor assigned" });
      // Check if already rated
      const existing = await db.getRatingForJob(input.maintenanceRequestId, companyId);
      if (existing) throw new TRPCError({ code: "CONFLICT", message: "Already rated" });
      await db.createRating({
        maintenanceRequestId: input.maintenanceRequestId,
        contractorProfileId: job.assignedContractorId,
        companyId,
        ratedByUserId: ctx.user.id,
        stars: input.stars,
        review: input.review ?? null,
      });
      // Recalculate contractor average rating
      await db.recalcContractorRating(job.assignedContractorId);
      return { success: true };
    }),

  // Get existing rating for a job (company view)
  forJob: companyAdminProcedure
    .input(z.object({ maintenanceRequestId: z.number() }))
    .query(async ({ ctx, input }) => {
      const companyId = getEffectiveCompanyId(ctx);
      return db.getRatingForJob(input.maintenanceRequestId, companyId);
    }),

  // Contractor: view all ratings received
  myRatings: contractorProcedure.query(async ({ ctx }) => {
    const profile = await getEffectiveContractorProfile(ctx);
    return db.getRatingsByContractor(profile.id);
  }),
});

// ─── Comments Router ───────────────────────────────────────────────────────────
const commentsRouter = router({
  list: protectedProcedure
    .input(z.object({ maintenanceRequestId: z.number() }))
    .query(async ({ input }) => {
      return db.getJobComments(input.maintenanceRequestId);
    }),

  add: protectedProcedure
    .input(z.object({
      maintenanceRequestId: z.number(),
      message: z.string().min(1).max(2000),
    }))
    .mutation(async ({ ctx, input }) => {
      const role = ctx.user.role as string;
      // ─── Plan feature check: jobComments (company-side) ──────────────────────
      if (role === 'company_admin' || (role === 'admin' && ctx.impersonatedCompanyId)) {
        const effectiveCompanyId = ctx.impersonatedCompanyId ?? ctx.user.companyId;
        const hasComments = effectiveCompanyId ? await db.companyHasPlanFeature(effectiveCompanyId, "jobComments") : true;
        if (!hasComments) throw new TRPCError({ code: "FORBIDDEN", message: "Job comments are not included in your current plan. Please upgrade to use this feature." });
      }
      const authorRole = (role === 'company_admin' || role === 'admin' || role === 'contractor')
        ? role as 'company_admin' | 'contractor' | 'admin'
        : 'company_admin' as const;
      await db.addJobComment({
        maintenanceRequestId: input.maintenanceRequestId,
        authorUserId: ctx.user.id,
        authorRole,
        authorName: ctx.user.name ?? 'Unknown',
        message: input.message,
      });

      // Notify the other party about the new comment
      const job = await db.getMaintenanceRequestById(input.maintenanceRequestId);
      if (job) {
        const senderName = ctx.user.name ?? 'Someone';
        const linkRoute = `/company/jobs?jobId=${input.maintenanceRequestId}&openComments=1`;
        const contractorLinkRoute = `/contractor/my-jobs?jobId=${input.maintenanceRequestId}&openComments=1`;
        const preview = input.message.length > 80 ? input.message.slice(0, 80) + '...' : input.message;

        if (role === 'contractor') {
          // Notify company admins (in-app + email)
          const companyUserIds = await db.getCompanyAdminUserIds(job.companyId);
          const companyAdminEmails = await db.getCompanyAdminEmails(job.companyId);
          for (const uid of companyUserIds) {
            await db.createNotification({
              userId: uid,
              type: 'comment',
              title: `New note on Job #${input.maintenanceRequestId}`,
              body: `${senderName}: ${preview}`,
              linkRoute,
              metadata: { jobId: input.maintenanceRequestId },
            });
          }
          // Email each admin
          for (const admin of companyAdminEmails) {
            if (admin.email) {
              email.sendNewCommentEmail({
                to: admin.email,
                recipientName: admin.name ?? 'Admin',
                authorName: senderName,
                jobTitle: job.title,
                commentPreview: preview,
                jobId: input.maintenanceRequestId,
                appUrl: ENV.appUrl,
                role: 'company',
              }).catch(() => {});
            }
          }
        } else {
          // Notify the assigned contractor (in-app + email)
          if (job.assignedContractorId) {
            const contractorUserId = await db.getUserIdByContractorProfileId(job.assignedContractorId);
            if (contractorUserId && contractorUserId !== ctx.user.id) {
              await db.createNotification({
                userId: contractorUserId,
                type: 'comment',
                title: `New note on Job #${input.maintenanceRequestId}`,
                body: `${senderName}: ${preview}`,
                linkRoute: contractorLinkRoute,
                metadata: { jobId: input.maintenanceRequestId },
              });
            }
            const contractorUser = await db.getUserEmailByContractorProfileId(job.assignedContractorId);
            if (contractorUser?.email) {
              email.sendNewCommentEmail({
                to: contractorUser.email,
                recipientName: contractorUser.name ?? 'Contractor',
                authorName: senderName,
                jobTitle: job.title,
                commentPreview: preview,
                jobId: input.maintenanceRequestId,
                appUrl: ENV.appUrl,
                role: 'contractor',
              }).catch(() => {});
            }
          }
        }
      }

      return { success: true };
    }),
});

// ─── Notifications Router ────────────────────────────────────────────────────
const notificationsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return db.getNotificationsForUser(ctx.user.id);
  }),

  unreadCount: protectedProcedure.query(async ({ ctx }) => {
    return db.getUnreadCount(ctx.user.id);
  }),

  markRead: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await db.markNotificationRead(input.id, ctx.user.id);
      return { success: true };
    }),

  markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
    await db.markAllNotificationsRead(ctx.user.id);
    return { success: true };
  }),
});

// ─── Job Board Router ─────────────────────────────────────────────────────
const jobBoardRouter = router({
  // Debug: returns raw contractor coords + all board jobs with their distances
  debug: contractorProcedure.query(async ({ ctx }) => {
    const profile = await getEffectiveContractorProfile(ctx);
    if (!profile) throw new TRPCError({ code: "NOT_FOUND", message: "No contractor profile" });
    return db.debugJobBoardForContractor(profile.id);
  }),

  // Contractor: list jobs in their service area
  list: contractorProcedure.query(async ({ ctx }) => {
    const profile = await getEffectiveContractorProfile(ctx);
    if (!profile) throw new TRPCError({ code: "NOT_FOUND", message: "No contractor profile" });
    return db.listJobBoardForContractor(profile.id);
  }),

  // Contractor: accept a job from the board
  accept: contractorProcedure
    .input(z.object({ jobId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const profile = await getEffectiveContractorProfile(ctx);
      if (!profile) throw new TRPCError({ code: "NOT_FOUND", message: "No contractor profile" });
      await db.acceptJobFromBoard(input.jobId, profile.id);
      return { success: true };
    }),

  // Company: post a job to the board
  post: companyAdminProcedure
    .input(z.object({ jobId: z.number(), origin: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const companyId = getEffectiveCompanyId(ctx);
      await db.postJobToBoard(input.jobId, companyId);

      // Fan-out notifications to all contractors in service area (fire-and-forget)
      void (async () => {
        try {
          const job = await db.getMaintenanceRequestById(input.jobId);
          if (!job) return;
          const property = await db.getPropertyByIdOnly(job.propertyId);
          if (!property) return;
          const company = await db.getCompanyById(companyId);

          const propLat = property.latitude ? parseFloat(String(property.latitude)) : null;
          const propLng = property.longitude ? parseFloat(String(property.longitude)) : null;
          if (propLat === null || propLng === null) return;

          const cityState = [property.city, property.state].filter(Boolean).join(", ") || "Unknown location";
          const trade = job.aiSkillTier ?? null;
          const urgency = job.aiPriority ?? "medium";
          const jobBoardUrl = `${input.origin ?? "https://app.maintenancemanager.com"}/contractor/job-board`;

          const contractors = await db.getContractorsInServiceArea(propLat, propLng, trade);
          console.log(`[JobBoard] Notifying ${contractors.length} contractors for job #${job.id}`);

          // Helper: send in-app + email notification to a single contractor
          const notifyContractor = async (contractor: typeof contractors[number]) => {
            await db.createNotification({
              userId: contractor.userId,
              type: "new_job",
              title: `New Job: ${job.title}`,
              body: `${urgency === "emergency" ? "🚨 EMERGENCY — " : ""}A new job has been posted in your area: ${job.title} at ${cityState}. First come, first served!`,
              linkRoute: "/contractor/job-board",
              metadata: { jobId: job.id, urgency, cityState },
            });
            if (contractor.email) {
              await email.sendNewJobPostedEmail({
                to: contractor.email,
                contractorName: contractor.name ?? "Contractor",
                jobTitle: job.title,
                trade,
                urgency,
                cityState,
                companyName: company?.name ?? "A property management company",
                jobBoardUrl,
              });
            }
          };

          // Split contractors by plan tier
          const proContractors = contractors.filter((c) => c.earlyNotificationMinutes > 0);
          const freeContractors = contractors.filter((c) => c.earlyNotificationMinutes === 0);

          // Notify Pro contractors immediately
          for (const contractor of proContractors) {
            await notifyContractor(contractor);
          }

          // Notify free-tier contractors after the maximum early-access delay
          const delayMs = proContractors.length > 0
            ? Math.max(...proContractors.map((c) => c.earlyNotificationMinutes)) * 60 * 1000
            : 0;

          if (delayMs > 0) {
            console.log(`[JobBoard] Free-tier contractors will be notified in ${delayMs / 60000} min`);
            setTimeout(async () => {
              for (const contractor of freeContractors) {
                try { await notifyContractor(contractor); } catch (e) { /* ignore */ }
              }
            }, delayMs);
          } else {
            for (const contractor of freeContractors) {
              await notifyContractor(contractor);
            }
          }
        } catch (err) {
          console.error("[JobBoard] Notification fan-out error:", err);
        }
      })();

      return { success: true };
    }),

  // Company: remove a job from the board
  remove: companyAdminProcedure
    .input(z.object({ jobId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (!getEffectiveCompanyId(ctx)) throw new TRPCError({ code: "NOT_FOUND" });
      await db.removeJobFromBoard(input.jobId, getEffectiveCompanyId(ctx));
      return { success: true };
    }),
  // Company: toggle a job's visibility between public and private
  setVisibility: companyAdminProcedure
    .input(z.object({ jobId: z.number(), visibility: z.enum(["public", "private"]) }))
    .mutation(async ({ ctx, input }) => {
      const companyId = getEffectiveCompanyId(ctx);
      const drizzleDb = await db.getDb();
      if (!drizzleDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { maintenanceRequests: mr } = await import("../drizzle/schema");
      const { eq, and } = await import("drizzle-orm");
      await drizzleDb
        .update(mr)
        .set({ jobBoardVisibility: input.visibility })
        .where(and(eq(mr.id, input.jobId), eq(mr.companyId, companyId)));
      return { success: true };
    }),
  // Contractor: list private board jobs (from all trusted companies)
  listPrivate: contractorProcedure.query(async ({ ctx }) => {
    const profile = await getEffectiveContractorProfile(ctx);
    if (!profile) throw new TRPCError({ code: "NOT_FOUND", message: "No contractor profile" });
    return db.listPrivateJobBoardForContractor(profile.id);
  }),
  // Contractor: accept a private board job (same logic as public)
  acceptPrivate: contractorProcedure
    .input(z.object({ jobId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const profile = await getEffectiveContractorProfile(ctx);
      if (!profile) throw new TRPCError({ code: "NOT_FOUND", message: "No contractor profile" });
      await db.acceptJobFromBoard(input.jobId, profile.id);
      return { success: true };
    }),
});

// ─── Stripe Router ─────────────────────────────────────────────────────────
const stripeRouter = router({
  // Contractor: create/get Connect account and return onboarding link
  contractorOnboardingLink: contractorProcedure
    .input(z.object({ origin: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const profile = await getEffectiveContractorProfile(ctx);
      const user = await db.getUserById(ctx.user.id);
      if (!user) throw new TRPCError({ code: "NOT_FOUND" });

      let stripeAccountId = profile.stripeAccountId;
      if (!stripeAccountId) {
        const account = await createContractorConnectAccount(user.email ?? "");
        stripeAccountId = account.id;
        await db.updateContractorProfile(profile.id, { stripeAccountId });
      }

      const url = await createContractorOnboardingLink(stripeAccountId, input.origin);
      return { url };
    }),

  // Contractor: check onboarding status from Stripe
  contractorOnboardingStatus: contractorProcedure
    .query(async ({ ctx }) => {
      const profile = await getEffectiveContractorProfile(ctx);
      if (!profile.stripeAccountId) {
        return { onboardingComplete: false, chargesEnabled: false, payoutsEnabled: false };
      }
      const account = await stripe.accounts.retrieve(profile.stripeAccountId);
      const complete = account.charges_enabled === true && account.payouts_enabled === true;
      if (complete && !profile.stripeOnboardingComplete) {
        await db.updateContractorProfile(profile.id, { stripeOnboardingComplete: true });
      }
      return {
        onboardingComplete: complete,
        chargesEnabled: account.charges_enabled ?? false,
        payoutsEnabled: account.payouts_enabled ?? false,
        stripeAccountId: profile.stripeAccountId,
      };
    }),

  // Company: create a SetupIntent to save a card
  createSetupIntent: companyAdminProcedure
    .input(z.object({ origin: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const companyId = getEffectiveCompanyId(ctx);
      const company = await db.getCompanyById(companyId);
      if (!company) throw new TRPCError({ code: "NOT_FOUND" });
      const user = await db.getUserById(ctx.user.id);
      if (!user) throw new TRPCError({ code: "NOT_FOUND" });

      const customerId = await getOrCreateStripeCustomer(
        companyId,
        user.email ?? "",
        company.name
      );

      // Create a Stripe Checkout session in setup mode to collect a card
      const session = await stripe.checkout.sessions.create({
        mode: "setup",
        customer: customerId,
        currency: "usd",
        success_url: `${input.origin}/company/billing?setup=success`,
        cancel_url: `${input.origin}/company/billing?setup=canceled`,
        metadata: { companyId: String(companyId) },
      });

      return { checkoutUrl: session.url, customerId };
    }),

  // Company: list saved payment methods
  listPaymentMethods: companyAdminProcedure
    .query(async ({ ctx }) => {
      const companyId = getEffectiveCompanyId(ctx);
      const company = await db.getCompanyById(companyId);
      if (!company?.stripeCustomerId) return { paymentMethods: [], defaultPaymentMethodId: null };
      const pms = await listAllPaymentMethods(company.stripeCustomerId);
      // Get the default payment method from the customer object
      const customer = await stripe.customers.retrieve(company.stripeCustomerId) as any;
      const defaultPmId = customer?.invoice_settings?.default_payment_method ?? null;
      return { paymentMethods: pms, defaultPaymentMethodId: defaultPmId };
    }),

  // Admin: get platform fee settings
  getPlatformSettings: adminProcedure
    .query(async () => {
      return getPlatformSettings();
    }),

  // Company: create a Stripe Checkout session for subscribing to a plan
  createPlanCheckout: companyAdminProcedure
    .input(z.object({
      planId: z.number(),
      billingInterval: z.enum(["monthly", "annual"]),
      origin: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const companyId = getEffectiveCompanyId(ctx);
      const company = await db.getCompanyById(companyId);
      if (!company) throw new TRPCError({ code: "NOT_FOUND" });
      const user = await db.getUserById(ctx.user.id);
      if (!user) throw new TRPCError({ code: "NOT_FOUND" });

      // Fetch the plan
      const drizzleDb = await db.getDb();
      if (!drizzleDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { subscriptionPlans } = await import("../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const plans = await drizzleDb.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, input.planId)).limit(1);
      const plan = plans[0];
      if (!plan) throw new TRPCError({ code: "NOT_FOUND", message: "Plan not found" });

      // Determine the Stripe Price ID
      const stripePriceId = input.billingInterval === "annual"
        ? plan.stripePriceIdAnnual
        : plan.stripePriceIdMonthly;
      if (!stripePriceId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `This plan does not have a Stripe Price ID configured for ${input.billingInterval} billing. Please contact your administrator.`,
        });
      }

      const customerId = await getOrCreateStripeCustomer(companyId, user.email ?? "", company.name);

      // If the company already has an active Stripe subscription, upgrade/downgrade it
      // directly via the Stripe API rather than creating a new checkout session.
      // This prevents a duplicate subscription and updates the plan in the DB immediately.
      if (company.stripeSubscriptionId && (company.planStatus === "active" || company.planStatus === "trialing")) {
        try {
          const existingSub = await stripe.subscriptions.retrieve(company.stripeSubscriptionId);
          if (existingSub && existingSub.status !== "canceled") {
            const itemId = existingSub.items.data[0]?.id;
            if (itemId) {
              // ── Determine if this is an upgrade or downgrade ──────────────────
              // Compare plan price to decide: higher price = upgrade (immediate),
              // lower price = downgrade (deferred to next billing cycle)
              const { subscriptionPlans: spTable } = await import("../drizzle/schema");
              const currentPlanRows = company.planId
                ? await drizzleDb.select().from(spTable).where(eq(spTable.id, company.planId)).limit(1)
                : [];
              const currentPlan = currentPlanRows[0];
              const currentPrice = input.billingInterval === "annual"
                ? parseFloat(currentPlan?.priceAnnual ?? "0")
                : parseFloat(currentPlan?.priceMonthly ?? "0");
              const newPrice = input.billingInterval === "annual"
                ? parseFloat(plan.priceAnnual ?? "0")
                : parseFloat(plan.priceMonthly ?? "0");
              const isDowngrade = currentPlan && newPrice < currentPrice;

              if (isDowngrade) {
                // ── Downgrade: schedule via Stripe at period end, store pending in DB ──
                const periodEnd = (existingSub as any).current_period_end as number; // Unix seconds
                await stripe.subscriptions.update(company.stripeSubscriptionId, {
                  items: [{ id: itemId, price: stripePriceId }],
                  proration_behavior: "none",         // no proration credit for downgrades
                  billing_cycle_anchor: "unchanged",
                  // Stripe will apply the new price at the next renewal
                  trial_end: "now",                   // no-op if already active
                  metadata: {
                    company_id: companyId.toString(),
                    plan_id: input.planId.toString(),
                    billing_interval: input.billingInterval,
                    pending_downgrade: "true",
                  },
                });
                // Store the pending downgrade in DB — do NOT switch planId yet
                const { companies: companiesTable } = await import("../drizzle/schema");
                await drizzleDb.update(companiesTable).set({
                  pendingPlanId: input.planId,
                  pendingBillingInterval: input.billingInterval,
                  pendingPlanEffectiveAt: periodEnd * 1000, // convert to ms
                }).where(eq(companiesTable.id, companyId));
                return { checkoutUrl: null, upgraded: false, downgradeScheduled: true, effectiveAt: periodEnd * 1000 };
              } else {
                // ── Upgrade: apply immediately with prorations ────────────────────
                await stripe.subscriptions.update(company.stripeSubscriptionId, {
                  items: [{ id: itemId, price: stripePriceId }],
                  proration_behavior: "create_prorations",
                  metadata: {
                    company_id: companyId.toString(),
                    plan_id: input.planId.toString(),
                    billing_interval: input.billingInterval,
                  },
                });
                // Update the DB immediately — don't wait for the webhook
                const { companies: companiesTable } = await import("../drizzle/schema");
                await drizzleDb.update(companiesTable).set({
                  planId: input.planId,
                  planStatus: "active",
                  planAssignedAt: Date.now(),
                  planExpiresAt: null,
                  pendingPlanId: null,
                  pendingBillingInterval: null,
                  pendingPlanEffectiveAt: null,
                }).where(eq(companiesTable.id, companyId));
                return { checkoutUrl: null, upgraded: true, downgradeScheduled: false };
              }
            }
          }
        } catch (subErr: any) {
          // If retrieval/update fails (e.g. sub was deleted in Stripe), fall through to checkout
          console.warn(`[createPlanCheckout] Could not update existing subscription: ${subErr.message}`);
        }
      }

      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer: customerId,
        line_items: [{ price: stripePriceId, quantity: 1 }],
        allow_promotion_codes: true,
        success_url: `${input.origin}/company/billing?subscription=success`,
        cancel_url: `${input.origin}/company/billing?subscription=canceled`,
        client_reference_id: companyId.toString(),
        metadata: {
          company_id: companyId.toString(),
          plan_id: input.planId.toString(),
          billing_interval: input.billingInterval,
          customer_email: user.email ?? "",
          customer_name: user.name ?? "",
        },
      });
      return { checkoutUrl: session.url, upgraded: false };
    }),

  // Company: cancel their current subscription
  cancelPlanSubscription: companyAdminProcedure
    .mutation(async ({ ctx }) => {
      const companyId = getEffectiveCompanyId(ctx);
      const company = await db.getCompanyById(companyId);
      if (!company) throw new TRPCError({ code: "NOT_FOUND" });
      if (!company.stripeSubscriptionId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No active subscription found." });
      }
      // Cancel at period end (not immediately)
      await stripe.subscriptions.update(company.stripeSubscriptionId, {
        cancel_at_period_end: true,
      });
      await db.updateCompany(companyId, { planStatus: "canceled" });
      return { success: true, message: "Your subscription will be canceled at the end of the current billing period." };
    }),

  // Contractor: create Stripe checkout session for a contractor plan
  createContractorPlanCheckout: contractorProcedure
    .input(z.object({
      planId: z.number(),
      billingInterval: z.enum(["monthly", "annual"]),
      origin: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const profile = await db.getContractorProfile(ctx.user.id);
      if (!profile) throw new TRPCError({ code: "NOT_FOUND", message: "Contractor profile not found" });
      const user = await db.getUserById(ctx.user.id);
      if (!user) throw new TRPCError({ code: "NOT_FOUND" });

      const drizzleDb = await db.getDb();
      if (!drizzleDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { subscriptionPlans } = await import("../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const plans = await drizzleDb.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, input.planId)).limit(1);
      const plan = plans[0];
      if (!plan) throw new TRPCError({ code: "NOT_FOUND", message: "Plan not found" });
      if (plan.planType !== "contractor") throw new TRPCError({ code: "BAD_REQUEST", message: "This plan is not a contractor plan." });

      const stripePriceId = input.billingInterval === "annual"
        ? plan.stripePriceIdAnnual
        : plan.stripePriceIdMonthly;
      if (!stripePriceId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `This plan does not have a Stripe Price ID configured for ${input.billingInterval} billing. Please contact your administrator.`,
        });
      }

      // Get or create Stripe customer for contractor (reuse company helper with profile id as key)
      const customerId = await getOrCreateStripeCustomer(profile.id, user.email ?? "", user.name ?? "");

      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer: customerId,
        line_items: [{ price: stripePriceId, quantity: 1 }],
        allow_promotion_codes: true,
        success_url: `${input.origin}/contractor/billing?subscription=success`,
        cancel_url: `${input.origin}/contractor/billing?subscription=canceled`,
        client_reference_id: `contractor_${profile.id}`,
        metadata: {
          contractor_profile_id: profile.id.toString(),
          plan_id: input.planId.toString(),
          billing_interval: input.billingInterval,
          customer_email: user.email ?? "",
          customer_name: user.name ?? "",
          entity_type: "contractor",
        },
      });

      return { checkoutUrl: session.url };
    }),

  // Contractor: cancel their current subscription
  cancelContractorPlanSubscription: contractorProcedure
    .mutation(async ({ ctx }) => {
      const profile = await db.getContractorProfile(ctx.user.id);
      if (!profile) throw new TRPCError({ code: "NOT_FOUND" });
      if (!profile.stripeSubscriptionId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No active subscription found." });
      }
      await stripe.subscriptions.update(profile.stripeSubscriptionId, {
        cancel_at_period_end: true,
      });
      await db.updateContractorProfile(profile.id, { planStatus: "canceled" });
      return { success: true, message: "Your subscription will be canceled at the end of the current billing period." };
    }),

  // Admin: update platform fee settings
  updatePlatformSettings: adminProcedure
    .input(z.object({
      platformFeePercent: z.number().min(0).max(100).optional(),
      perListingFeeEnabled: z.boolean().optional(),
      perListingFeeAmount: z.number().min(0).optional(),
      autoClockOutMinutes: z.number().min(1).max(120).optional(),
      autoClockOutRadiusMeters: z.number().min(50).max(1000).optional(),
      // PMS auto-sync interval in hours (1-168). 0 = disabled.
      pmsSyncIntervalHours: z.number().min(0).max(168).optional(),
    }))
    .mutation(async ({ input }) => {
      const settings = await getPlatformSettings();
      const drizzleDb = await db.getDb();
      if (!drizzleDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { platformSettings } = await import("../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      await drizzleDb.update(platformSettings).set({
        ...(input.platformFeePercent !== undefined && { platformFeePercent: input.platformFeePercent.toFixed(2) }),
        ...(input.perListingFeeEnabled !== undefined && { perListingFeeEnabled: input.perListingFeeEnabled }),
        ...(input.perListingFeeAmount !== undefined && { perListingFeeAmount: input.perListingFeeAmount.toFixed(2) }),
        ...(input.autoClockOutMinutes !== undefined && { autoClockOutMinutes: input.autoClockOutMinutes }),
        ...(input.autoClockOutRadiusMeters !== undefined && { autoClockOutRadiusMeters: input.autoClockOutRadiusMeters }),
        ...(input.pmsSyncIntervalHours !== undefined && { pmsSyncIntervalHours: input.pmsSyncIntervalHours }),
       }).where(eq(platformSettings.id, settings.id));
      return { success: true };
    }),

  // ── Stripe ACH / Bank Account procedures ──────────────────────────────────

  // Company: create a SetupIntent for adding a US bank account via Financial Connections
  createBankAccountSetupIntent: companyAdminProcedure
    .mutation(async ({ ctx }) => {
      const companyId = getEffectiveCompanyId(ctx);
      const company = await db.getCompanyById(companyId);
      if (!company) throw new TRPCError({ code: "NOT_FOUND" });
      const user = await db.getUserById(ctx.user.id);
      if (!user) throw new TRPCError({ code: "NOT_FOUND" });
      const customerId = await getOrCreateStripeCustomer(companyId, user.email ?? "", company.name);
      const result = await createBankAccountSetupIntent(customerId);
      return result;
    }),

  // Company: list all saved payment methods (cards + bank accounts)
  listAllPaymentMethods: companyAdminProcedure
    .query(async ({ ctx }) => {
      const companyId = getEffectiveCompanyId(ctx);
      const company = await db.getCompanyById(companyId);
      if (!company?.stripeCustomerId) return { paymentMethods: [] };
      const pms = await listAllPaymentMethods(company.stripeCustomerId);
      return { paymentMethods: pms };
    }),

  // Company: set default payment method (card or bank account)
  setDefaultPaymentMethod: companyAdminProcedure
    .input(z.object({ paymentMethodId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const companyId = getEffectiveCompanyId(ctx);
      const company = await db.getCompanyById(companyId);
      if (!company?.stripeCustomerId) throw new TRPCError({ code: "NOT_FOUND", message: "No Stripe customer" });
      await setDefaultPaymentMethod(company.stripeCustomerId, input.paymentMethodId);
      return { success: true };
    }),

  // Company: remove a payment method
  detachPaymentMethod: companyAdminProcedure
    .input(z.object({ paymentMethodId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Verify the PM belongs to this company's customer before detaching
      const companyId = getEffectiveCompanyId(ctx);
      const company = await db.getCompanyById(companyId);
      if (!company?.stripeCustomerId) throw new TRPCError({ code: "NOT_FOUND" });
      const pm = await stripe.paymentMethods.retrieve(input.paymentMethodId);
      if ((pm as any).customer !== company.stripeCustomerId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Payment method does not belong to this company" });
      }
      await detachPaymentMethod(input.paymentMethodId);
      return { success: true };
    }),

  // Company: list Stripe subscription invoices
  getInvoices: companyAdminProcedure.query(async ({ ctx }) => {
    const companyId = getEffectiveCompanyId(ctx);
    const company = await db.getCompanyById(companyId);
    if (!company?.stripeCustomerId) return { invoices: [] };
    const invoiceList = await stripe.invoices.list({
      customer: company.stripeCustomerId,
      limit: 24,
      expand: ["data.subscription"],
    });
    return {
      invoices: invoiceList.data.map((inv) => ({
        id: inv.id,
        number: inv.number,
        status: inv.status,
        amountPaid: inv.amount_paid,
        currency: inv.currency,
        periodStart: inv.period_start,
        periodEnd: inv.period_end,
        created: inv.created,
        invoicePdf: inv.invoice_pdf,
        hostedInvoiceUrl: inv.hosted_invoice_url,
        description: inv.description ?? (inv.lines?.data?.[0]?.description ?? null),
      })),
    };
  }),

  // Contractor: list Stripe subscription invoices
  getContractorInvoices: contractorProcedure.query(async ({ ctx }) => {
    const profile = await db.getContractorProfile(ctx.user.id);
    if (!profile?.stripeAccountId && !profile) return { invoices: [] };
    // Find Stripe customer by contractor profile
    const customers = await stripe.customers.search({
      query: `metadata['contractor_profile_id']:'${profile.id}'`,
      limit: 1,
    });
    const customerId = customers.data[0]?.id;
    if (!customerId) return { invoices: [] };
    const invoiceList = await stripe.invoices.list({
      customer: customerId,
      limit: 24,
    });
    return {
      invoices: invoiceList.data.map((inv) => ({
        id: inv.id,
        number: inv.number,
        status: inv.status,
        amountPaid: inv.amount_paid,
        currency: inv.currency,
        periodStart: inv.period_start,
        periodEnd: inv.period_end,
        created: inv.created,
        invoicePdf: inv.invoice_pdf,
        hostedInvoiceUrl: inv.hosted_invoice_url,
        description: inv.description ?? (inv.lines?.data?.[0]?.description ?? null),
      })),
    };
  }),
  // Company: create a Stripe Customer Portal session for self-service billing management
  createCustomerPortalSession: companyAdminProcedure
    .input(z.object({ origin: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const companyId = getEffectiveCompanyId(ctx);
      const company = await db.getCompanyById(companyId);
      if (!company) throw new TRPCError({ code: "NOT_FOUND" });
      const user = await db.getUserById(ctx.user.id);
      if (!user) throw new TRPCError({ code: "NOT_FOUND" });
      // Ensure the company has a Stripe customer record
      const customerId = await getOrCreateStripeCustomer(
        companyId,
        user.email ?? "",
        company.name
      );
      const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: `${input.origin}/company/billing`,
      });
      return { url: session.url };
    }),
});
// ─── Platform Admin Router ──────────────────────────────────────────────────
const platformRouter = router({
  stats: adminProcedure.query(async () => {
    return db.getPlatformStats();
  }),
  revenueByCompany: adminProcedure
    .input(z.object({
      startDate: z.number().optional(), // UTC ms timestamp
      endDate: z.number().optional(),
    }))
    .query(async ({ input }) => {
      return db.getRevenueByCompany(input.startDate, input.endDate);
    }),

  // Onboarding analytics: % of new companies/contractors that completed all steps within 7 days
  onboardingAnalytics: adminProcedure.query(async () => {
    const drizzleDb = await db.getDb();
    if (!drizzleDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const { companies: companiesTable, contractorProfiles } = await import("../drizzle/schema");
    const { isNotNull, gte, and, sql } = await import("drizzle-orm");
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const cutoff = now - sevenDaysMs;

    // Companies: use planAssignedAt as "joined" date (or createdAt)
    const allCompanies = await drizzleDb.select({
      id: companiesTable.id,
      createdAt: companiesTable.createdAt,
    }).from(companiesTable);

    // Contractors: use createdAt as joined date, onboardingCompletedAt as completion
    const allContractors = await drizzleDb.select({
      id: contractorProfiles.id,
      createdAt: contractorProfiles.createdAt,
      onboardingCompletedAt: contractorProfiles.onboardingCompletedAt,
    }).from(contractorProfiles);

    // New companies in last 7 days (no onboarding tracking for companies yet — use count as proxy)
    const newCompanies = allCompanies.filter(c => new Date(c.createdAt).getTime() >= cutoff);

    // New contractors in last 7 days
    const newContractors = allContractors.filter(c => new Date(c.createdAt).getTime() >= cutoff);
    const contractorsCompletedIn7Days = newContractors.filter(c =>
      c.onboardingCompletedAt != null &&
      c.onboardingCompletedAt - new Date(c.createdAt).getTime() <= sevenDaysMs
    );

    // All-time contractor completion rate
    const allContractorsWithCompletion = allContractors.filter(c => c.onboardingCompletedAt != null);

    return {
      contractors: {
        newIn7Days: newContractors.length,
        completedIn7Days: contractorsCompletedIn7Days.length,
        completionRate7Days: newContractors.length > 0
          ? Math.round((contractorsCompletedIn7Days.length / newContractors.length) * 100)
          : 0,
        totalCompleted: allContractorsWithCompletion.length,
        totalContractors: allContractors.length,
        allTimeCompletionRate: allContractors.length > 0
          ? Math.round((allContractorsWithCompletion.length / allContractors.length) * 100)
          : 0,
      },
      companies: {
        newIn7Days: newCompanies.length,
        // Companies don't have per-step onboarding tracking yet — placeholder
        completedIn7Days: 0,
        completionRate7Days: 0,
      },
    };
  }),
  companies: adminProcedure.query(async () => {
    return db.listCompanies();
  }),
  // Admin: set per-company fee overrides (null clears the override, reverting to plan defaults)
  setCompanyFeeOverride: adminProcedure
    .input(z.object({
      companyId: z.number(),
      feeOverridePercent: z.number().min(0).max(100).nullable(),
      feeOverridePerListingEnabled: z.boolean().nullable(),
      feeOverridePerListingAmount: z.number().min(0).nullable(),
    }))
    .mutation(async ({ input }) => {
      const { companyId, feeOverridePercent, feeOverridePerListingEnabled, feeOverridePerListingAmount } = input;
      await db.updateCompany(companyId, {
        feeOverridePercent: feeOverridePercent != null ? feeOverridePercent.toFixed(2) : null,
        feeOverridePerListingEnabled: feeOverridePerListingEnabled,
        feeOverridePerListingAmount: feeOverridePerListingAmount != null ? feeOverridePerListingAmount.toFixed(2) : null,
      } as any);
      return { success: true };
    }),
  // Admin: get a single company with its effective plan (for edit dialog)
  getCompany: adminProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const company = await db.getCompanyById(input.companyId);
      if (!company) throw new TRPCError({ code: "NOT_FOUND" });
      const plan = await db.getEffectivePlanForCompany(input.companyId);
      return { company, plan };
    }),
  // Company-aware: returns plan-specific fee if company is on a plan, otherwise global default
  getFee: protectedProcedure.query(async ({ ctx }) => {
    const companyId = ctx.user.companyId ?? ctx.impersonatedCompanyId;
    if (companyId) {
      const plan = await db.getEffectivePlanForCompany(companyId);
      if (plan?.platformFeePercent != null) {
        return {
          platformFeePercent: parseFloat(String(plan.platformFeePercent)),
          perListingFeeEnabled: plan.perListingFeeEnabled,
          perListingFeeAmount: parseFloat(String(plan.perListingFeeAmount ?? "0")),
          source: "plan" as const,
        };
      }
    }
    const settings = await getPlatformSettings();
    return {
      platformFeePercent: parseFloat(settings.platformFeePercent ?? "5"),
      perListingFeeEnabled: settings.perListingFeeEnabled,
      perListingFeeAmount: parseFloat(settings.perListingFeeAmount ?? "0"),
      source: "global" as const,
    };
  }),

  webhookEvents: adminProcedure
    .input(z.object({
      companyId: z.number().optional(),
      limit: z.number().default(50),
      offset: z.number().default(0),
      dateFrom: z.date().optional(),
      dateTo: z.date().optional(),
    }))
    .query(async ({ input }) => {
      return db.getPmsWebhookEvents(input);
    }),
});

// ─── Email Preferences Router ──────────────────────────────────────────────
const emailPrefsRouter = router({
  get: protectedProcedure.query(async ({ ctx }) => {
    return db.getEmailPreferences(ctx.user.id);
  }),

  update: protectedProcedure
    .input(z.object({
      jobAssigned: z.boolean().optional(),
      jobSubmitted: z.boolean().optional(),
      jobPaid: z.boolean().optional(),
      newComment: z.boolean().optional(),
      jobDisputed: z.boolean().optional(),
      welcome: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const current = await db.getEmailPreferences(ctx.user.id);
      await db.updateEmailPreferences(ctx.user.id, { ...current, ...input });
      return { success: true };
    }),
});

// ─── Main App Router ────────────────────────────────────────────────────────
// ─── Public Router (no auth required) ───────────────────────────────────────
// ─── Contractor Invites Router ──────────────────────────────────────────────────
const invitesRouter = router({
  // Company: send invite email to a contractor
  create: companyAdminProcedure
    .input(z.object({
      email: z.string().email(),
      name: z.string().optional(),
      origin: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const companyId = getEffectiveCompanyId(ctx);
      const company = await db.getCompanyById(companyId);
      if (!company) throw new TRPCError({ code: "NOT_FOUND" });

      // Prevent duplicate pending invites for the same email
      const existing = await db.getContractorInviteByEmailAndCompany(input.email.toLowerCase(), companyId);
      if (existing) throw new TRPCError({ code: "CONFLICT", message: "A pending invite already exists for this email address." });

      // Generate a secure random token
      const { randomBytes } = await import("crypto");
      const token = randomBytes(48).toString("hex");
      const EXPIRES_IN_DAYS = 7;
      const expiresAt = Date.now() + EXPIRES_IN_DAYS * 24 * 60 * 60 * 1000;

      await db.createContractorInvite({
        companyId,
        email: input.email.toLowerCase(),
        name: input.name ?? null,
        token,
        status: "pending",
        expiresAt,
      });

      const inviteUrl = `${input.origin}/invite/${token}`;
      const emailSent = await email.sendContractorInviteEmail({
        to: input.email,
        name: input.name ?? "",
        companyName: company.name,
        inviteUrl,
        expiresInDays: EXPIRES_IN_DAYS,
      });
      return { success: true, inviteUrl, emailSent };
    }),

  // Company: list all invites they have sent
  list: companyAdminProcedure
    .query(async ({ ctx }) => {
      const companyId = getEffectiveCompanyId(ctx);
      const invites = await db.listContractorInvitesByCompany(companyId);
      // Auto-mark expired ones
      const now = Date.now();
      const updated = invites.map((inv) => ({
        ...inv,
        status: inv.status === "pending" && inv.expiresAt < now ? "expired" as const : inv.status,
      }));
      return { invites: updated };
    }),

  // Company: revoke a pending invite
  revoke: companyAdminProcedure
    .input(z.object({ inviteId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const companyId = getEffectiveCompanyId(ctx);
      const invites = await db.listContractorInvitesByCompany(companyId);
      const invite = invites.find((i) => i.id === input.inviteId);
      if (!invite) throw new TRPCError({ code: "NOT_FOUND" });
      if (invite.status !== "pending") throw new TRPCError({ code: "BAD_REQUEST", message: "Only pending invites can be revoked." });
      await db.updateContractorInviteStatus(input.inviteId, "revoked");
      return { success: true };
    }),

  // Public: validate an invite token (used on the /invite/:token landing page)
  validateToken: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input }) => {
      const invite = await db.getContractorInviteByToken(input.token);
      if (!invite) throw new TRPCError({ code: "NOT_FOUND", message: "Invite not found." });
      if (invite.status === "revoked") throw new TRPCError({ code: "FORBIDDEN", message: "This invite has been revoked." });
      if (invite.status === "accepted") throw new TRPCError({ code: "CONFLICT", message: "This invite has already been accepted." });
      if (invite.status === "expired" || invite.expiresAt < Date.now()) {
        throw new TRPCError({ code: "FORBIDDEN", message: "This invite has expired. Please ask the company to send a new one." });
      }
      const company = await db.getCompanyById(invite.companyId);
      return {
        valid: true,
        email: invite.email,
        name: invite.name,
        companyId: invite.companyId,
        companyName: company?.name ?? "Unknown Company",
        token: invite.token,
      };
    }),

  // Company: resend a pending invite (regenerates token + expiry, fires new email)
  resend: companyAdminProcedure
    .input(z.object({ inviteId: z.number(), origin: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const companyId = getEffectiveCompanyId(ctx);
      const invites = await db.listContractorInvitesByCompany(companyId);
      const invite = invites.find((i) => i.id === input.inviteId);
      if (!invite) throw new TRPCError({ code: "NOT_FOUND" });
      if (invite.status === "accepted") throw new TRPCError({ code: "BAD_REQUEST", message: "This invite has already been accepted." });

      const company = await db.getCompanyById(companyId);
      if (!company) throw new TRPCError({ code: "NOT_FOUND" });

      // Regenerate token and extend expiry
      const { randomBytes } = await import("crypto");
      const newToken = randomBytes(48).toString("hex");
      const EXPIRES_IN_DAYS = 7;
      const newExpiresAt = Date.now() + EXPIRES_IN_DAYS * 24 * 60 * 60 * 1000;

      await db.refreshContractorInviteToken(invite.id, newToken, newExpiresAt);

       const inviteUrl = `${input.origin}/invite/${newToken}`;
      const emailSent = await email.sendContractorInviteEmail({
        to: invite.email,
        name: invite.name ?? "",
        companyName: company.name,
        inviteUrl,
        expiresInDays: EXPIRES_IN_DAYS,
      });
      return { success: true, inviteUrl, emailSent };
    }),
});
const publicRouter = router({
  /** Returns all active company-type plans sorted by sortOrder — used on the landing page pricing section */
  listCompanyPlans: publicProcedure.query(async () => {
    const plans = await db.listSubscriptionPlansByType("company");
    return (plans ?? []).filter((p) => p.isActive).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  }),
  /** Returns all active contractor-type plans sorted by sortOrder */
  listContractorPlans: publicProcedure.query(async () => {
    const plans = await db.listSubscriptionPlansByType("contractor");
    return (plans ?? []).filter((p) => p.isActive).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  }),
});


// ─── Promo Codes Router ────────────────────────────────────────────────────
const promoCodesRouter = router({
  // Admin: list all promo codes
  list: adminProcedure.query(async () => {
    return db.listPromoCodes();
  }),

  // Admin: generate a random code string
  generateCode: adminProcedure.query(async () => {
    return { code: db.generatePromoCodeString() };
  }),

  // Admin: create a new promo code
  create: adminProcedure
    .input(z.object({
      code: z.string().min(3).max(64).optional(), // if omitted, auto-generate
      description: z.string().optional(),
      affectsSubscription: z.boolean().default(false),
      affectsServiceCharge: z.boolean().default(false),
      affectsListingFee: z.boolean().default(false),
      discountPercent: z.number().min(0).max(100),
      billingCycles: z.number().min(1).optional(), // null = forever
      maxRedemptions: z.number().min(1).optional(), // null = unlimited
      expiresAt: z.number().optional(), // unix ms
    }))
    .mutation(async ({ input }) => {
      const code = input.code || db.generatePromoCodeString();
      const id = await db.createPromoCode({
        code,
        description: input.description ?? null,
        affectsSubscription: input.affectsSubscription,
        affectsServiceCharge: input.affectsServiceCharge,
        affectsListingFee: input.affectsListingFee,
        discountPercent: input.discountPercent.toFixed(2),
        billingCycles: input.billingCycles ?? null,
        maxRedemptions: input.maxRedemptions ?? null,
        expiresAt: input.expiresAt ?? null,
        isActive: true,
      });
      return { id, code };
    }),

  // Admin: update a promo code (toggle active, change description, etc.)
  update: adminProcedure
    .input(z.object({
      id: z.number(),
      description: z.string().optional(),
      isActive: z.boolean().optional(),
      discountPercent: z.number().min(0).max(100).optional(),
      billingCycles: z.number().min(1).nullable().optional(),
      maxRedemptions: z.number().min(1).nullable().optional(),
      expiresAt: z.number().nullable().optional(),
      affectsSubscription: z.boolean().optional(),
      affectsServiceCharge: z.boolean().optional(),
      affectsListingFee: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, discountPercent, ...rest } = input;
      const updateData: Record<string, unknown> = { ...rest };
      if (discountPercent !== undefined) updateData.discountPercent = discountPercent.toFixed(2);
      await db.updatePromoCode(id, updateData as any);
      return { success: true };
    }),

  // Admin: delete a promo code
  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.deletePromoCode(input.id);
      return { success: true };
    }),

  // Company: get my active redemptions
  myRedemptions: companyAdminProcedure.query(async ({ ctx }) => {
    const companyId = getEffectiveCompanyId(ctx);
    return db.getCompanyPromoRedemptions(companyId);
  }),

  // Company: redeem a promo code
  redeem: companyAdminProcedure
    .input(z.object({ code: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const companyId = getEffectiveCompanyId(ctx);
      const result = await db.redeemPromoCode(companyId, input.code);
      if (!result.success) {
        throw new TRPCError({ code: "BAD_REQUEST", message: result.error ?? "Failed to redeem promo code" });
      }
      return {
        success: true,
        code: result.promo?.code,
        discountPercent: result.promo?.discountPercent,
        affectsSubscription: result.promo?.affectsSubscription,
        affectsServiceCharge: result.promo?.affectsServiceCharge,
        affectsListingFee: result.promo?.affectsListingFee,
        billingCycles: result.promo?.billingCycles,
      };
    }),
});

// ─── Admin Control Router ─────────────────────────────────────────────────────
const adminControlRouter = router({
  // 1. Platform Announcements
  listAnnouncements: adminProcedure.query(async () => {
    return db.listAnnouncements();
  }),
  createAnnouncement: adminProcedure
    .input(z.object({
      title: z.string().min(1),
      message: z.string().min(1),
      type: z.enum(["info", "warning", "success", "error"]),
      targetAudience: z.enum(["all", "companies", "contractors"]),
      expiresAt: z.number().optional(),
      isActive: z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      const id = await db.createAnnouncement({
        title: input.title,
        message: input.message,
        type: input.type,
        targetAudience: input.targetAudience,
        expiresAt: input.expiresAt ?? null,
        isActive: input.isActive,
      });
      await db.writeAuditLog({ actorId: ctx.user.id, actorName: "admin", action: "create_announcement", details: `Created announcement: ${input.title}` });
      return { id };
    }),
  updateAnnouncement: adminProcedure
    .input(z.object({
      id: z.number(),
      title: z.string().min(1).optional(),
      message: z.string().min(1).optional(),
      type: z.enum(["info", "warning", "success", "error"]).optional(),
      targetAudience: z.enum(["all", "companies", "contractors"]).optional(),
      expiresAt: z.number().nullable().optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      await db.updateAnnouncement(id, data);
      await db.writeAuditLog({ actorId: ctx.user.id, actorName: "admin", action: "update_announcement", details: `Updated announcement #${id}` });
    }),
  deleteAnnouncement: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await db.deleteAnnouncement(input.id);
      await db.writeAuditLog({ actorId: ctx.user.id, actorName: "admin", action: "delete_announcement", details: `Deleted announcement #${input.id}` });
    }),

  // 2. Maintenance Mode
  getMaintenanceMode: adminProcedure.query(async () => {
    return db.getMaintenanceMode();
  }),
  setMaintenanceMode: adminProcedure
    .input(z.object({
      isEnabled: z.boolean(),
      message: z.string().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await db.setMaintenanceMode(input.isEnabled, input.message ?? null, ctx.user.id);
      await db.writeAuditLog({ actorId: ctx.user.id, actorName: "admin", action: "set_maintenance_mode", details: `Maintenance mode ${input.isEnabled ? "enabled" : "disabled"}` });
    }),

  // 3. Feature Flags
  listFeatureFlags: adminProcedure.query(async () => {
    return db.listFeatureFlags();
  }),
  upsertFeatureFlag: adminProcedure
    .input(z.object({
      key: z.string().min(1),
      label: z.string().min(1),
      description: z.string().optional(),
      enabledForCompanies: z.boolean().default(true),
      enabledForContractors: z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      await db.upsertFeatureFlag({ ...input, description: input.description ?? null, updatedBy: ctx.user.id });
      await db.writeAuditLog({ actorId: ctx.user.id, actorName: "admin", action: "upsert_feature_flag", details: `Upserted flag: ${input.key}` });
    }),
  updateFeatureFlag: adminProcedure
    .input(z.object({
      key: z.string(),
      enabledForCompanies: z.boolean().optional(),
      enabledForContractors: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { key, ...data } = input;
      await db.updateFeatureFlag(key, data);
      await db.writeAuditLog({ actorId: ctx.user.id, actorName: "admin", action: "update_feature_flag", details: `Updated flag: ${key}` });
    }),

  // 4. Account Suspensions
  listSuspensions: adminProcedure.query(async () => {
    return db.listSuspensions();
  }),
  suspendAccount: adminProcedure
    .input(z.object({
      targetType: z.enum(["company", "contractor"]),
      targetId: z.number(),
      reason: z.string().min(1),
      suspendedUntil: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const id = await db.suspendAccount({
        targetType: input.targetType,
        targetId: input.targetId,
        reason: input.reason,
        suspendedBy: ctx.user.id,
        isActive: true,
      });
      await db.writeAuditLog({ actorId: ctx.user.id, actorName: "admin", action: "suspend_account", details: `Suspended ${input.targetType} #${input.targetId}: ${input.reason}` });
      return { id };
    }),
  reinstateAccount: adminProcedure
    .input(z.object({
      targetType: z.enum(["company", "contractor"]),
      targetId: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      await db.reinstateAccount(input.targetType, input.targetId, ctx.user.id);
      await db.writeAuditLog({ actorId: ctx.user.id, actorName: "admin", action: "reinstate_account", details: `Reinstated ${input.targetType} #${input.targetId}` });
    }),

  // 5. Audit Log
  listAuditLog: adminProcedure
    .input(z.object({ limit: z.number().default(100), offset: z.number().default(0) }))
    .query(async ({ input }) => {
      return db.listAuditLog(input.limit, input.offset);
    }),

  // 6. Manual Credits / Adjustments
  listAllCredits: adminProcedure.query(async () => {
    return db.listAllAccountCredits();
  }),
  issueCredit: adminProcedure
    .input(z.object({
      companyId: z.number(),
      amountCents: z.number().int().positive(),
      description: z.string().min(1),
      expiresAt: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const id = await db.issueAccountCredit({
        companyId: input.companyId,
        amountCents: input.amountCents,
        reason: input.description,
        issuedBy: ctx.user.id,
      });
      await db.writeAuditLog({ actorId: ctx.user.id, actorName: "admin", action: "issue_credit", details: `Issued $${(input.amountCents / 100).toFixed(2)} credit to company #${input.companyId}: ${input.description}` });
      return { id };
    }),

  // 7. Payout Holds
  listPayoutHolds: adminProcedure.query(async () => {
    return db.listPayoutHolds();
  }),
  placePayoutHold: adminProcedure
    .input(z.object({
      contractorId: z.number(),
      reason: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const id = await db.placePayoutHold({
        contractorId: input.contractorId,
        reason: input.reason,
        placedBy: ctx.user.id,
        isActive: true,
      });
      await db.writeAuditLog({ actorId: ctx.user.id, actorName: "admin", action: "place_payout_hold", details: `Placed payout hold on contractor #${input.contractorId}: ${input.reason}` });
      return { id };
    }),
  releasePayoutHold: adminProcedure
    .input(z.object({ contractorId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await db.releasePayoutHold(input.contractorId, ctx.user.id);
      await db.writeAuditLog({ actorId: ctx.user.id, actorName: "admin", action: "release_payout_hold", details: `Released payout hold on contractor #${input.contractorId}` });
    }),

  // 8. Activity Feed
  listActivityEvents: adminProcedure
    .input(z.object({ limit: z.number().default(50) }))
    .query(async ({ input }) => {
      return db.listActivityEvents(input.limit);
    }),

  // 9. Contractor Leaderboard
  contractorLeaderboard: adminProcedure
    .input(z.object({ limit: z.number().default(20) }))
    .query(async ({ input }) => {
      return db.getContractorLeaderboard(input.limit);
    }),

  // 10. Churn Risk Dashboard
  churnRisk: adminProcedure.query(async () => {
    return db.getChurnRiskCompanies();
  }),

  // 11a. Lookup job transaction details (for fee override preview)
  lookupJobTransaction: adminProcedure
    .input(z.object({ jobId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const txn = await db.getTransactionByJobId(input.jobId);
      if (!txn) throw new TRPCError({ code: "NOT_FOUND", message: "No transaction found for this job ID" });
      return {
        jobId: input.jobId,
        transactionId: txn.id,
        currentPlatformFee: String(txn.platformFee ?? "0"),
        laborCost: String(txn.laborCost ?? "0"),
        partsCost: String(txn.partsCost ?? "0"),
        totalCharged: String(txn.totalCharged ?? "0"),
        status: txn.status ?? "unknown",
      };
    }),
  // 11b. Per-job fee override (logged in audit trail)
  overrideJobFee: adminProcedure
    .input(z.object({
      jobId: z.number().int().positive(),
      newPlatformFeeCents: z.number().int().min(0),
      reason: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const txn = await db.getTransactionByJobId(input.jobId);
      if (!txn) throw new TRPCError({ code: "NOT_FOUND", message: "No transaction found for this job ID" });
      const oldFee = txn.platformFee ?? 0;
      await db.updateTransactionFee(txn.id, input.newPlatformFeeCents);
      await db.writeAuditLog({
        actorId: ctx.user.id,
        actorName: ctx.user.name ?? "admin",
        action: "override_job_fee",
        details: `Job #${input.jobId}: platform fee changed from $${oldFee} to ${(input.newPlatformFeeCents / 100).toFixed(2)}. Reason: ${input.reason}`,
        targetType: "job",
        targetId: input.jobId,
      });
      return { success: true, jobId: input.jobId, oldFee: String(oldFee), newFeeCents: input.newPlatformFeeCents };
    }),

  // 12. Bulk email blast
  sendEmailBlast: adminProcedure
    .input(z.object({
      subject: z.string().min(1),
      body: z.string().min(1),
      // audience: standard broadcast target; omit when using customEmails
      audience: z.enum(["all", "companies", "contractors"]).optional(),
      // customEmails: explicit list of recipients (used for re-engagement)
      customEmails: z.array(z.string().email()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const recipients: string[] = [];
      if (input.customEmails && input.customEmails.length > 0) {
        recipients.push(...input.customEmails);
      } else {
        const allCompanies = await db.listCompanies();
        const allContractors = await db.listAllContractors();
        const aud = input.audience ?? "all";
        if (aud === "all" || aud === "companies") {
          allCompanies.forEach(c => { if (c.email) recipients.push(c.email); });
        }
        if (aud === "all" || aud === "contractors") {
          allContractors.forEach(c => { if (c.user?.email) recipients.push(c.user.email); });
        }
      }
      let sent = 0;
      const uniqueRecipients = Array.from(new Set(recipients));
      for (const recipientEmail of uniqueRecipients) {
        try {
          await email.sendEmail({
            to: recipientEmail,
            subject: input.subject,
            html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto">${input.body.replace(/\n/g, "<br>")}</div>`,
          });
          sent++;
        } catch (_e) {
          // Continue on individual failures
        }
      }
       await db.writeAuditLog({ actorId: ctx.user.id, actorName: "admin", action: "email_blast", details: `Sent email blast to ${sent}/${uniqueRecipients.length} recipients. Subject: ${input.subject}` });
      return { sent, total: uniqueRecipients.length };
    }),
  // Job fee override history
  listJobFeeOverrideHistory: adminProcedure
    .input(z.object({ limit: z.number().int().min(1).max(100).default(50) }))
    .query(async ({ input }) => {
      return db.listAuditLogByAction("override_job_fee", input.limit);
    }),
});
// ─── User-facing Announcements Router ─────────────────────────────────────────
const announcementsRouter = router({
  active: protectedProcedure
    .input(z.object({ userType: z.enum(["company", "contractor"]) }))
    .query(async ({ ctx, input }) => {
      return db.getActiveAnnouncementsForUser(ctx.user.id, input.userType);
    }),
  dismiss: protectedProcedure
    .input(z.object({ announcementId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await db.dismissAnnouncement(ctx.user.id, input.announcementId);
      return { success: true };
    }),
});
// ─── Company Reports Router ────────────────────────────────────────────────────
const companyReportsRouter = router({
  revenueByProperty: companyAdminProcedure
    .input(z.object({
      fromMs: z.number().optional(),
      toMs: z.number().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const companyId = getEffectiveCompanyId(ctx);
      return db.getRevenueByProperty(companyId, input.fromMs, input.toMs);
    }),
  promoCycleInfo: companyAdminProcedure.query(async ({ ctx }) => {
    const companyId = getEffectiveCompanyId(ctx);
    const redemptions = await db.getCompanyPromoRedemptions(companyId);
    return redemptions
      .filter(r => r.isActive)
      .map(r => ({
        promoCode: r.code,
        discountPercent: r.discountPercent,
        billingCycles: r.billingCycles,
        cyclesRemaining: r.cyclesRemaining,
        redeemedAt: r.redeemedAt,
      }));
  }),

  // ─── New reporting endpoints ────────────────────────────────────────────────
  summary: companyAdminProcedure
    .input(z.object({ fromMs: z.number(), toMs: z.number() }))
    .query(async ({ ctx, input }) => {
      const companyId = getEffectiveCompanyId(ctx);
      return db.getCompanyReportSummary(companyId, input.fromMs, input.toMs);
    }),

  byProperty: companyAdminProcedure
    .input(z.object({ fromMs: z.number(), toMs: z.number() }))
    .query(async ({ ctx, input }) => {
      const companyId = getEffectiveCompanyId(ctx);
      return db.getCompanyReportByProperty(companyId, input.fromMs, input.toMs);
    }),

  byMonth: companyAdminProcedure
    .input(z.object({ months: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      const companyId = getEffectiveCompanyId(ctx);
      return db.getCompanyReportByMonth(companyId, input.months ?? 6);
    }),

  bySkillTier: companyAdminProcedure
    .input(z.object({ fromMs: z.number(), toMs: z.number() }))
    .query(async ({ ctx, input }) => {
      const companyId = getEffectiveCompanyId(ctx);
      return db.getCompanyReportBySkillTier(companyId, input.fromMs, input.toMs);
    }),
});

// ─── PMS Integration Router ────────────────────────────────────────────────
const pmsRouter = router({
  // List all supported providers and their config requirements
  listProviders: companyAdminProcedure.query(() => {
    return SUPPORTED_PROVIDERS;
  }),

  // List this company's active integrations
  list: companyAdminProcedure.query(async ({ ctx }) => {
    const companyId = getEffectiveCompanyId(ctx);
    const integrations = await db.listPmsIntegrations(companyId);
    // Strip credentials from the response (but expose isSandbox flag)
    return integrations.map(i => {
      const creds = decodeCredentials(i.credentialsJson ?? "");
      return {
        id: i.id,
        provider: i.provider,
        authType: i.authType,
        status: i.status,
        lastSyncAt: i.lastSyncAt,
        lastErrorMessage: i.lastErrorMessage,
        webhookSecret: i.webhookSecret,
        isSandbox: creds.isSandbox ?? false,
        createdAt: i.createdAt,
      };
    });
  }),

  // Connect a new PMS integration
  connect: companyAdminProcedure
    .input(z.object({
      provider: z.string().min(1),
      credentials: z.object({
        apiKey: z.string().optional(),
        clientId: z.string().optional(),
        clientSecret: z.string().optional(),
        accessToken: z.string().optional(),
        baseUrl: z.string().optional(),
        isSandbox: z.boolean().optional(),
      }),
    }))
    .mutation(async ({ ctx, input }) => {
      const companyId = getEffectiveCompanyId(ctx);
      const adapter = getAdapter(input.provider);
      const providerConfig = SUPPORTED_PROVIDERS.find(p => p.id === input.provider);

      // Test connection for API-key providers
      if (providerConfig?.authType === "api_key") {
        const test = await adapter.testConnection(input.credentials);
        if (!test.ok) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `Connection failed: ${test.error}` });
        }
      }

      // Generate a webhook secret for this integration
      const webhookSecret = `whsec_${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;

      const id = await db.createPmsIntegration({
        companyId,
        provider: input.provider,
        authType: providerConfig?.authType ?? "webhook_only",
        credentialsJson: encodeCredentials(input.credentials),
        webhookSecret,
        status: "connected",
      });

      return { id, webhookSecret };
    }),

  // Disconnect (delete) an integration
  disconnect: companyAdminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const companyId = getEffectiveCompanyId(ctx);
      await db.deletePmsIntegration(input.id, companyId);
      return { success: true };
    }),

  // Trigger a manual sync
  sync: companyAdminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const companyId = getEffectiveCompanyId(ctx);
      const result = await runPmsSync(input.id, companyId);
      if (result.error) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: result.error });
      }
      return result;
    }),

  // List recent webhook events for this company
  webhookEvents: companyAdminProcedure
    .input(z.object({ limit: z.number().min(1).max(100).default(50) }))
    .query(async ({ ctx, input }) => {
      const companyId = getEffectiveCompanyId(ctx);
      return db.listPmsWebhookEvents(companyId, input.limit);
    }),
  // Debug: return raw API response for first property units + first request
  // Used to inspect actual field names returned by the PMS API
  debugRaw: companyAdminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const companyId = getEffectiveCompanyId(ctx);
      const integrations = await db.listPmsIntegrations(companyId);
      const integration = integrations.find(i => i.id === input.id);
      if (!integration) throw new TRPCError({ code: 'NOT_FOUND', message: 'Integration not found' });
      const credentials = decodeCredentials(integration.credentialsJson ?? '');
      const baseUrl = credentials.isSandbox
        ? 'https://apisandbox.buildium.com/v1'
        : 'https://api.buildium.com/v1';
      const headers = {
        'x-buildium-client-id': credentials.clientId ?? '',
        'x-buildium-client-secret': credentials.clientSecret ?? '',
        'Content-Type': 'application/json',
      };
      // Fetch first property
      const rentalsRes = await fetch(`${baseUrl}/rentals?offset=0&limit=1`, { headers });
      const rentalsData = await rentalsRes.json();
      const items = Array.isArray(rentalsData) ? rentalsData : (rentalsData?.items ?? []);
      const firstProperty = items[0] as Record<string, unknown> | undefined;
      let unitsData: unknown = null;
      let firstUnitRaw: unknown = null;
      if (firstProperty) {
        const propId = firstProperty.Id ?? firstProperty.id;
        // Correct endpoint: GET /v1/rentals/units?propertyids={id} (NOT /rentals/{id}/units)
        const unitsRes = await fetch(`${baseUrl}/rentals/units?propertyids=${propId}&offset=0&limit=5`, { headers });
        unitsData = await unitsRes.json();
        const unitItems = Array.isArray(unitsData) ? unitsData : (unitsData as Record<string,unknown>)?.items;
        if (Array.isArray(unitItems) && unitItems.length > 0) {
          firstUnitRaw = unitItems[0];
        }
      }
      // Fetch first maintenance request
      const reqRes = await fetch(`${baseUrl}/tasks/residentrequests?offset=0&limit=1`, { headers });
      const reqData = await reqRes.json();
      const reqItems = Array.isArray(reqData) ? reqData : (reqData?.items ?? []);
      return {
        firstPropertyRaw: firstProperty ?? null,
        unitsResponseRaw: unitsData,
        firstUnitRaw: firstUnitRaw,
        firstRequestRaw: reqItems[0] ?? null,
      };
    }),

  // Update the webhook secret for an integration.
  // Used when the PMS generates its own signing secret (e.g. Buildium) and the company
  // needs to paste it back into our platform so we can verify incoming webhook signatures.
  updateWebhookSecret: companyAdminProcedure
    .input(z.object({
      id: z.number(),
      webhookSecret: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const companyId = getEffectiveCompanyId(ctx);
      await db.updatePmsIntegration(input.id, companyId, { webhookSecret: input.webhookSecret });
      return { success: true };
    }),
});

export const appRouter = router({
  system: systemRouter,
  public: publicRouter,
  auth: router({
    me: publicProcedure.query(opts => {
      if (!opts.ctx.user) return null;
      const { passwordHash, ...safeUser } = opts.ctx.user;
      return safeUser;
    }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
    // ─── Password Reset ────────────────────────────────────────────────────────
    requestPasswordReset: publicProcedure
      .input(z.object({
        email: z.string().email(),
        origin: z.string().url(),
      }))
      .mutation(async ({ input }) => {
        // Always return success to prevent email enumeration
        const user = await db.getUserByEmail(input.email);
        if (!user) return { success: true };
        const crypto = await import('node:crypto');
        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
        await db.createPasswordResetToken(user.id, token, expiresAt);
        const resetUrl = `${input.origin}/reset-password?token=${token}`;
        await email.sendPasswordResetEmail({ to: user.email ?? '', name: user.name ?? 'there', resetUrl });
        return { success: true };
      }),
    confirmPasswordReset: publicProcedure
      .input(z.object({
        token: z.string().min(1),
        newPassword: z.string().min(8),
      }))
      .mutation(async ({ input }) => {
        const record = await db.getPasswordResetToken(input.token);
        if (!record) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid or expired reset link.' });
        if (record.expiresAt < new Date()) throw new TRPCError({ code: 'BAD_REQUEST', message: 'This reset link has expired. Please request a new one.' });
        if (record.usedAt) throw new TRPCError({ code: 'BAD_REQUEST', message: 'This reset link has already been used.' });
        const bcrypt = await import('bcryptjs');
        const passwordHash = await bcrypt.hash(input.newPassword, 12);
        await db.updateUserPassword(record.userId, passwordHash);
        await db.markPasswordResetTokenUsed(record.id);
        return { success: true };
      }),
    // ─── Set Admin Password ────────────────────────────────────────────────────
    // Allows the platform admin to set their own password so they can log in
    // via /admin/login without needing Manus OAuth.
    setAdminPassword: protectedProcedure
      .input(z.object({
        newPassword: z.string().min(8, 'Password must be at least 8 characters'),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Only platform administrators can use this endpoint.' });
        }
        const bcrypt = await import('bcryptjs');
        const passwordHash = await bcrypt.hash(input.newPassword, 12);
        await db.updateUserPassword(ctx.user.id, passwordHash);
        return { success: true };
      }),
  }),
  company: companyRouter,
  settings: settingsRouter,
  skillTiers: skillTiersRouter,
  properties: propertiesRouter,
  contractor: contractorRouter,
  jobs: jobsRouter,
  jobBoard: jobBoardRouter,
  timeTracking: timeTrackingRouter,
  receipts: receiptsRouter,
  integrations: integrationsRouter,
  transactions: transactionsRouter,
  ratings: ratingsRouter,
  comments: commentsRouter,
  notifications: notificationsRouter,
  emailPrefs: emailPrefsRouter,
  platform: platformRouter,
  stripePayments: stripeRouter,
  invites: invitesRouter,
  adminViewAs: adminViewAsRouter,
  team: teamRouter,
  promoCodes: promoCodesRouter,
  adminControl: adminControlRouter,
  announcements: announcementsRouter,
  companyReports: companyReportsRouter,
  pms: pmsRouter,
  admin: router({
    // Re-geocode all properties and contractor profiles that are missing coordinates.
    // Safe to run multiple times — only updates records with null lat/lng.
    bulkReGeocode: adminProcedure.mutation(async () => {
      const results = { properties: { ok: 0, fail: 0 }, contractors: { ok: 0, fail: 0 } };

      // Re-geocode properties
      const allProps = await db.getAllPropertiesMissingCoords();
      for (const prop of allProps) {
        const addr = [prop.address, prop.city, prop.state, prop.zipCode].filter(Boolean).join(", ");
        if (!addr) { results.properties.fail++; continue; }
        const coords = await db.geocodeAddress(addr);
        if (coords) {
          await db.updatePropertyCoords(prop.id, coords.lat, coords.lng);
          results.properties.ok++;
        } else {
          results.properties.fail++;
        }
      }

      // Re-geocode contractor profiles
      const allContractors = await db.getAllContractorsMissingCoords();
      for (const contractor of allContractors) {
        const zip = (contractor.serviceAreaZips as string[] | null)?.[0];
        if (!zip) { results.contractors.fail++; continue; }
        const coords = await db.geocodeAddress(`${zip}, USA`);
        if (coords) {
          await db.updateContractorCoords(contractor.id, coords.lat, coords.lng);
          results.contractors.ok++;
        } else {
          results.contractors.fail++;
        }
      }

      return results;
    }),
  }),
});

export type AppRouter = typeof appRouter;
