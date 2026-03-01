import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, adminProcedure, router } from "./_core/trpc";
import * as db from "./db";
import { classifyMaintenanceRequest } from "./ai-classify";
import { adminViewAsRouter } from "./routers/admin-viewas";

// ─── Middleware: require company_admin role ─────────────────────────────────
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
    if (!ctx.user.companyId) throw new TRPCError({ code: "NOT_FOUND", message: "No company associated" });
    return db.getCompanyById(ctx.user.companyId);
  }),

  update: companyAdminProcedure
    .input(z.object({ name: z.string().optional(), address: z.string().optional(), phone: z.string().optional(), email: z.string().optional(), logoUrl: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.companyId) throw new TRPCError({ code: "NOT_FOUND" });
      await db.updateCompany(ctx.user.companyId, input);
      return { success: true };
    }),

  listAll: adminProcedure.query(async () => {
    return db.listCompanies();
  }),

  dashboardStats: companyAdminProcedure.query(async ({ ctx }) => {
    if (!ctx.user.companyId) throw new TRPCError({ code: "NOT_FOUND" });
    return db.getCompanyDashboardStats(ctx.user.companyId);
  }),
});

// ─── Settings Router ────────────────────────────────────────────────────────
const settingsRouter = router({
  get: companyAdminProcedure.query(async ({ ctx }) => {
    if (!ctx.user.companyId) throw new TRPCError({ code: "NOT_FOUND" });
    return db.getCompanySettings(ctx.user.companyId);
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
    }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.companyId) throw new TRPCError({ code: "NOT_FOUND" });
      await db.updateCompanySettings(ctx.user.companyId, input);
      return { success: true };
    }),
});

// ─── Skill Tiers Router ────────────────────────────────────────────────────
const skillTiersRouter = router({
  list: companyAdminProcedure.query(async ({ ctx }) => {
    if (!ctx.user.companyId) throw new TRPCError({ code: "NOT_FOUND" });
    return db.getSkillTiers(ctx.user.companyId);
  }),

  create: companyAdminProcedure
    .input(z.object({ name: z.string().min(1), description: z.string().optional(), hourlyRate: z.string(), emergencyMultiplier: z.string().optional(), sortOrder: z.number().optional() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.companyId) throw new TRPCError({ code: "NOT_FOUND" });
      const id = await db.createSkillTier({ companyId: ctx.user.companyId, ...input });
      return { id };
    }),

  update: companyAdminProcedure
    .input(z.object({ id: z.number(), name: z.string().optional(), description: z.string().optional(), hourlyRate: z.string().optional(), emergencyMultiplier: z.string().optional(), sortOrder: z.number().optional() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.companyId) throw new TRPCError({ code: "NOT_FOUND" });
      const { id, ...data } = input;
      await db.updateSkillTier(id, ctx.user.companyId, data);
      return { success: true };
    }),

  delete: companyAdminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.companyId) throw new TRPCError({ code: "NOT_FOUND" });
      await db.deleteSkillTier(input.id, ctx.user.companyId);
      return { success: true };
    }),
});

// ─── Properties Router ─────────────────────────────────────────────────────
const propertiesRouter = router({
  list: companyAdminProcedure.query(async ({ ctx }) => {
    if (!ctx.user.companyId) throw new TRPCError({ code: "NOT_FOUND" });
    return db.listProperties(ctx.user.companyId);
  }),

  get: companyAdminProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      if (!ctx.user.companyId) throw new TRPCError({ code: "NOT_FOUND" });
      return db.getPropertyById(input.id, ctx.user.companyId);
    }),

  create: companyAdminProcedure
    .input(z.object({ name: z.string().optional(), address: z.string().min(1), city: z.string().optional(), state: z.string().optional(), zipCode: z.string().optional(), latitude: z.string().optional(), longitude: z.string().optional(), units: z.number().optional() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.companyId) throw new TRPCError({ code: "NOT_FOUND" });
      const name = input.name?.trim() || input.address.trim();
      const id = await db.createProperty({ companyId: ctx.user.companyId, ...input, name });
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
      if (!ctx.user.companyId) throw new TRPCError({ code: "NOT_FOUND" });
      const { id, ...data } = input;
      await db.updateProperty(id, ctx.user.companyId, data);
      return { success: true };
    }),

  delete: companyAdminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.companyId) throw new TRPCError({ code: "NOT_FOUND" });
      await db.deleteProperty(input.id, ctx.user.companyId);
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
      const existing = await db.getContractorProfile(ctx.user.id);
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
    return db.getContractorProfile(ctx.user.id);
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
      const profile = await db.getContractorProfile(ctx.user.id);
      if (!profile) throw new TRPCError({ code: "NOT_FOUND", message: "No contractor profile" });
      await db.updateContractorProfile(profile.id, input);
      return { success: true };
    }),

  // Company-side: list contractors for this company
  listByCompany: companyAdminProcedure.query(async ({ ctx }) => {
    if (!ctx.user.companyId) throw new TRPCError({ code: "NOT_FOUND" });
    return db.listContractorsByCompany(ctx.user.companyId);
  }),

  // Contractor-side: list companies they're connected to
  myCompanies: contractorProcedure.query(async ({ ctx }) => {
    const profile = await db.getContractorProfile(ctx.user.id);
    if (!profile) return [];
    return db.listCompaniesByContractor(profile.id);
  }),

  // Request to join a company (contractor-initiated)
  requestJoin: contractorProcedure
    .input(z.object({ companyId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const profile = await db.getContractorProfile(ctx.user.id);
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
      if (!ctx.user.companyId) throw new TRPCError({ code: "NOT_FOUND" });
      const settings = await db.getCompanySettings(ctx.user.companyId);
      const status = settings?.autoApproveContractors ? "approved" : "pending";
      const id = await db.createContractorCompanyRelation({
        contractorProfileId: input.contractorProfileId,
        companyId: ctx.user.companyId,
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
    const profile = await db.getContractorProfile(ctx.user.id);
    if (!profile) return [];
    return db.getJobsForContractor(profile.id);
  }),

  // Contractor: my assigned jobs
  myJobs: contractorProcedure.query(async ({ ctx }) => {
    const profile = await db.getContractorProfile(ctx.user.id);
    if (!profile) return [];
    return db.getContractorAssignedJobs(profile.id);
  }),

  // Contractor: accept a job
  acceptJob: contractorProcedure
    .input(z.object({ jobId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const profile = await db.getContractorProfile(ctx.user.id);
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
});

// ─── Maintenance Requests Router ────────────────────────────────────────────
const jobsRouter = router({
  list: companyAdminProcedure
    .input(z.object({ status: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      if (!ctx.user.companyId) throw new TRPCError({ code: "NOT_FOUND" });
      return db.listMaintenanceRequests(ctx.user.companyId, input?.status);
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
      if (!ctx.user.companyId) throw new TRPCError({ code: "NOT_FOUND" });

      // Create the request
      const id = await db.createMaintenanceRequest({
        companyId: ctx.user.companyId,
        ...input,
      });

      // AI classification
      try {
        const tiers = await db.getSkillTiers(ctx.user.companyId);
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
      status: z.enum(["open", "assigned", "in_progress", "completed", "verified", "paid", "canceled"]).optional(),
      skillTierId: z.number().optional(),
      hourlyRate: z.string().optional(),
      isEmergency: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      await db.updateMaintenanceRequest(id, data);
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
      const profile = await db.getContractorProfile(ctx.user.id);
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

      return { sessionId: id };
    }),

  clockOut: contractorProcedure
    .input(z.object({
      sessionId: z.number(),
      latitude: z.string(),
      longitude: z.string(),
      method: z.enum(["manual", "auto_geofence", "auto_timeout"]).optional(),
    }))
    .mutation(async ({ input }) => {
      const clockOutTime = Date.now();
      await db.updateTimeSession(input.sessionId, {
        clockOutTime,
        clockOutLat: input.latitude,
        clockOutLng: input.longitude,
        clockOutMethod: input.method ?? "manual",
        status: "completed",
      });
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
      const profile = await db.getContractorProfile(ctx.user.id);
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
    if (!ctx.user.companyId) throw new TRPCError({ code: "NOT_FOUND" });
    return db.getIntegrationConnectors(ctx.user.companyId);
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
      if (!ctx.user.companyId) throw new TRPCError({ code: "NOT_FOUND" });
      const id = await db.upsertIntegrationConnector({
        companyId: ctx.user.companyId,
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
    if (!ctx.user.companyId) throw new TRPCError({ code: "NOT_FOUND" });
    return db.getTransactionsByCompany(ctx.user.companyId);
  }),

  listByContractor: contractorProcedure.query(async ({ ctx }) => {
    const profile = await db.getContractorProfile(ctx.user.id);
    if (!profile) return [];
    return db.getTransactionsByContractor(profile.id);
  }),
});

// ─── Job Board Router ─────────────────────────────────────────────────────
const jobBoardRouter = router({
  // Contractor: list jobs in their service area
  list: contractorProcedure.query(async ({ ctx }) => {
    const profile = await db.getContractorProfile(ctx.user.id);
    if (!profile) throw new TRPCError({ code: "NOT_FOUND", message: "No contractor profile" });
    return db.listJobBoardForContractor(profile.id);
  }),

  // Contractor: accept a job from the board
  accept: contractorProcedure
    .input(z.object({ jobId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const profile = await db.getContractorProfile(ctx.user.id);
      if (!profile) throw new TRPCError({ code: "NOT_FOUND", message: "No contractor profile" });
      await db.acceptJobFromBoard(input.jobId, profile.id);
      return { success: true };
    }),

  // Company: post a job to the board
  post: companyAdminProcedure
    .input(z.object({ jobId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.companyId) throw new TRPCError({ code: "NOT_FOUND" });
      await db.postJobToBoard(input.jobId, ctx.user.companyId);
      return { success: true };
    }),

  // Company: remove a job from the board
  remove: companyAdminProcedure
    .input(z.object({ jobId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.companyId) throw new TRPCError({ code: "NOT_FOUND" });
      await db.removeJobFromBoard(input.jobId, ctx.user.companyId);
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
  platform: platformRouter,
  adminViewAs: adminViewAsRouter,
});

export type AppRouter = typeof appRouter;
