import { z } from "zod";
import { adminProcedure, router } from "../_core/trpc";
import * as db from "../db";

/**
 * Admin "View As" router — allows platform admin to query data
 * as if they were a specific company or contractor.
 */
export const adminViewAsRouter = router({
  // Get dashboard stats for a specific company (admin impersonation)
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
    .input(z.object({ companyId: z.number(), status: z.string().optional() }))
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

  // List all contractors on the platform
  allContractors: adminProcedure.query(async () => {
    return db.listAllContractors();
  }),

  // Get contractor jobs
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
});
