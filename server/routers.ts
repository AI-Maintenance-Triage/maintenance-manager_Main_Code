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
import { adminViewAsRouter } from "./routers/admin-viewas";
import {
  stripe,
  getPlatformSettings,
  createContractorConnectAccount,
  createContractorOnboardingLink,
  getOrCreateStripeCustomer,
  createSetupIntent,
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
      const name = input.name?.trim() || input.address.trim();
      const id = await db.createProperty({ companyId: getEffectiveCompanyId(ctx), ...input, name });
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
    }))
    .mutation(async ({ ctx, input }) => {
      const { firstName, lastName, ...profileData } = input;
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
      }
      // Auto-geocode contractor base ZIP
      const zip = profileData.serviceAreaZips?.[0];
      if (zip) {
        const coords = await db.geocodeAddress(`${zip}, USA`);
        if (coords) await db.updateContractorCoords(profileId, coords.lat, coords.lng);
      }
      return { id: profileId };
    }),

  getProfile: protectedProcedure.query(async ({ ctx }) => {
    return getEffectiveContractorProfile(ctx);
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
      const settings = await db.getCompanySettings(getEffectiveCompanyId(ctx));
      const status = settings?.autoApproveContractors ? "approved" : "pending";
      const id = await db.createContractorCompanyRelation({
        contractorProfileId: input.contractorProfileId,
        companyId: getEffectiveCompanyId(ctx),
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
      const job = await db.getMaintenanceRequestById(input.jobId);
      if (!job || job.status !== "open") throw new TRPCError({ code: "BAD_REQUEST", message: "Job is not available" });
      await db.updateMaintenanceRequest(input.jobId, {
        assignedContractorId: profile.id,
        assignedAt: new Date(),
        status: "assigned",
      });
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
});

// ─── Maintenance Requests Router ────────────────────────────────────────────
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

      // Create the request
      const id = await db.createMaintenanceRequest({
        companyId: getEffectiveCompanyId(ctx),
        ...input,
      });

      // AI classification
      try {
        const tiers = await db.getSkillTiers(getEffectiveCompanyId(ctx));
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
        // Job still created, just without AI classification
      }

      return { id };
    }),

  update: companyAdminProcedure
    .input(z.object({
      id: z.number(),
      status: z.enum(["open", "assigned", "in_progress", "pending_verification", "completed", "verified", "disputed", "paid", "canceled"]).optional(),
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
    return db.getJobsPendingVerification(getEffectiveCompanyId(ctx));
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

          // Get platform fee settings
          const settings = await getPlatformSettings();
          const feePercent = parseFloat(settings.platformFeePercent ?? "5");
          const perListingEnabled = settings.perListingFeeEnabled;
          const perListingAmount = parseFloat(settings.perListingFeeAmount ?? "0");

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
            status: "captured",
            paidAt: new Date(),
          });

          // Update job with payment info
          await db.updateMaintenanceRequest(input.jobId, {
            stripePaymentIntentId: result.paymentIntentId,
            status: "paid",
            paidAt: new Date(),
            platformFee: (result.platformFeeCents / 100).toFixed(2),
            totalCost: (result.totalChargeCents / 100).toFixed(2),
          });

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
    .mutation(async ({ input }) => {
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
      provider: z.enum(["buildium", "appfolio", "rentmanager", "yardi"]),
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
          // Notify company admins
          const companyUserIds = await db.getCompanyAdminUserIds(job.companyId);
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
        } else {
          // Notify the assigned contractor
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
    .input(z.object({ jobId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (!getEffectiveCompanyId(ctx)) throw new TRPCError({ code: "NOT_FOUND" });
      await db.postJobToBoard(input.jobId, getEffectiveCompanyId(ctx));
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
    .mutation(async ({ ctx, input: _input }) => {
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
      const { clientSecret } = await createSetupIntent(customerId);
      return { clientSecret, customerId };
    }),

  // Company: list saved payment methods
  listPaymentMethods: companyAdminProcedure
    .query(async ({ ctx }) => {
      const companyId = getEffectiveCompanyId(ctx);
      const company = await db.getCompanyById(companyId);
      if (!company?.stripeCustomerId) return { paymentMethods: [] };
      const pms = await stripe.paymentMethods.list({
        customer: company.stripeCustomerId,
        type: "card",
      });
      return {
        paymentMethods: pms.data.map(pm => ({
          id: pm.id,
          brand: pm.card?.brand ?? "unknown",
          last4: pm.card?.last4 ?? "????",
          expMonth: pm.card?.exp_month ?? 0,
          expYear: pm.card?.exp_year ?? 0,
        })),
      };
    }),

  // Admin: get platform fee settings
  getPlatformSettings: adminProcedure
    .query(async () => {
      return getPlatformSettings();
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
});

// ─── Platform Admin Router ──────────────────────────────────────────────────
const platformRouter = router({
  stats: adminProcedure.query(async () => {
    return db.getPlatformStats();
  }),
  companies: adminProcedure.query(async () => {
    return db.listCompanies();
  }),
  // Public: returns only the platform fee percentage (safe to expose to companies/contractors)
  getFee: publicProcedure.query(async () => {
    const settings = await getPlatformSettings();
    return {
      platformFeePercent: parseFloat(settings.platformFeePercent ?? "5"),
    };
  }),
});

// ─── Main App Router ────────────────────────────────────────────────────────
export const appRouter = router({
  system: systemRouter,
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
  platform: platformRouter,
  stripePayments: stripeRouter,
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
