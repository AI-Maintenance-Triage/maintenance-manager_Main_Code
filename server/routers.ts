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
    return {
      plan,
      planStatus,
      planExpiresAt,
      daysRemaining,
      planPriceOverride: company?.planPriceOverride ?? null,
      planNotes: company?.planNotes ?? null,
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
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Only platform admins can add skill tiers" });
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
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Only platform admins can delete skill tiers" });
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
    .input(z.object({ name: z.string().optional(), address: z.string().min(1), city: z.string().optional(), state: z.string().optional(), zipCode: z.string().optional(), latitude: z.string().optional(), longitude: z.string().optional(), units: z.number().optional() }))
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
    .input(z.object({ id: z.number(), name: z.string().optional(), address: z.string().optional(), city: z.string().optional(), state: z.string().optional(), zipCode: z.string().optional(), latitude: z.string().optional(), longitude: z.string().optional(), units: z.number().optional() }))
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
            }).onDuplicateKeyUpdate({ set: { status: "approved" } });
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
    const profile = await db.getContractorProfile(ctx.user.id);
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
      // Calculate labor cost from completed time sessions before marking complete
      const sessions = await db.getTimeSessionsByJob(input.jobId);
      const completedSessions = sessions.filter((s: any) => s.status === "completed" && s.totalMinutes);
      const totalLaborMinutes = completedSessions.reduce((sum: number, s: any) => sum + (s.totalMinutes ?? 0), 0);
      // Get job to find hourlyRate
      const jobs = await db.getContractorJobs(profile.id);
      const job = jobs.find((j: any) => j.job.id === input.jobId);
      const hourlyRate = parseFloat(job?.job?.hourlyRate ?? "0");
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

  // Company: get jobs awaiting verification
  pendingVerification: companyAdminProcedure.query(async ({ ctx }) => {
    if (!getEffectiveCompanyId(ctx)) throw new TRPCError({ code: "NOT_FOUND" });
    const rows = await db.getJobsPendingVerification(getEffectiveCompanyId(ctx));
    // Enrich each job with live time session data so the verification dialog
    // always shows accurate labor minutes even if the job record is stale.
    const enriched = await Promise.all(rows.map(async (row: any) => {
      const sessions = await db.getTimeSessionsByJob(row.job.id);
      const completedSessions = sessions.filter((s: any) => s.status === "completed" && s.totalMinutes);
      const liveMinutes = completedSessions.reduce((sum: number, s: any) => sum + (s.totalMinutes ?? 0), 0);
      const storedMinutes = row.job.totalLaborMinutes ?? 0;
      const totalLaborMinutes = liveMinutes > storedMinutes ? liveMinutes : storedMinutes;
      const hourlyRate = parseFloat(row.job.hourlyRate ?? "0");
      const totalLaborCost = hourlyRate > 0 && totalLaborMinutes > 0
        ? ((totalLaborMinutes / 60) * hourlyRate).toFixed(2)
        : row.job.totalLaborCost ?? null;
      return {
        ...row,
        job: {
          ...row.job,
          totalLaborMinutes: totalLaborMinutes > 0 ? totalLaborMinutes : row.job.totalLaborMinutes,
          totalLaborCost,
          sessionCount: completedSessions.length,
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
      notes: z.string().min(1, "Please provide notes"),
    }))
    .mutation(async ({ ctx, input }) => {
      const companyId = getEffectiveCompanyId(ctx);

      // Verify the job first
      await db.verifyJob(input.jobId, companyId, ctx.user.id, input.action, input.notes);

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
          if (!contractorProfile?.stripeAccountId || !contractorProfile.stripeOnboardingComplete) {
            console.warn(`[Payment] Contractor ${job.assignedContractorId} has no Stripe account. Skipping payment for job ${input.jobId}.`);
            return { success: true, paymentSkipped: true, reason: "contractor_no_stripe" };
          }

          // Get platform fee settings — plan takes priority over global settings
          const companyPlan = await db.getEffectivePlanForCompany(companyId);
          const globalSettings = await getPlatformSettings();
          const feePercent = companyPlan?.platformFeePercent != null
            ? parseFloat(String(companyPlan.platformFeePercent))
            : parseFloat(globalSettings.platformFeePercent ?? "5");
          const perListingEnabled = companyPlan != null
            ? companyPlan.perListingFeeEnabled
            : globalSettings.perListingFeeEnabled;
          const perListingAmount = companyPlan != null
            ? parseFloat(String(companyPlan.perListingFeeAmount ?? "0"))
            : parseFloat(globalSettings.perListingFeeAmount ?? "0");

          // Calculate costs in cents
          const laborCost = parseFloat(job.totalLaborCost ?? "0");
          const partsCost = parseFloat(job.totalPartsCost ?? "0");
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
          });

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
      });

      // Update job status
      if (job.status === "assigned") {
        await db.updateMaintenanceRequest(input.jobId, { status: "in_progress" });
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
      if (role === 'company_admin' && ctx.user.companyId) {
        const hasComments = await db.companyHasPlanFeature(ctx.user.companyId, "jobComments");
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

      return { checkoutUrl: session.url };
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
});
// ─── Platform Admin Router ──────────────────────────────────────────────────
const platformRouter = router({
  stats: adminProcedure.query(async () => {
    return db.getPlatformStats();
  }),
  companies: adminProcedure.query(async () => {
    return db.listCompanies();
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
    .input(z.object({ companyId: z.number().optional(), limit: z.number().default(50), offset: z.number().default(0) }))
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
      await email.sendContractorInviteEmail({
        to: input.email,
        name: input.name ?? "",
        companyName: company.name,
        inviteUrl,
        expiresInDays: EXPIRES_IN_DAYS,
      });

      return { success: true };
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
      await email.sendContractorInviteEmail({
        to: invite.email,
        name: invite.name ?? "",
        companyName: company.name,
        inviteUrl,
        expiresInDays: EXPIRES_IN_DAYS,
      });

      return { success: true };
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
