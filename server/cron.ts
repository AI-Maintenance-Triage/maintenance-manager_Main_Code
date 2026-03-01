/**
 * Scheduled jobs for the Maintenance Manager platform.
 *
 * Currently scheduled:
 *  - Trial expiry check: runs every day at midnight UTC
 *    • Sends 3-day warning emails to companies/contractors whose trial ends in ≤3 days
 *    • Marks overdue trials as "expired" and sends expiry notification emails
 */
import cron from "node-cron";
import * as db from "./db";
import * as email from "./email";

const PLATFORM_ORIGIN = process.env.PLATFORM_ORIGIN ?? "https://maintmanager-bbuqzrfk.manus.space";

async function runTrialExpiryCheck(): Promise<void> {
  const results = { warned: 0, expired: 0, errors: [] as string[] };
  const now = new Date().toISOString();
  console.log(`[cron] runTrialExpiryCheck started at ${now}`);

  // ── 3-day warnings for companies ──────────────────────────────────────────
  try {
    const companiesWarning = await db.getCompaniesExpiringInDays(3);
    for (const c of companiesWarning) {
      try {
        const planRow = c.planId ? await db.getSubscriptionPlanById(c.planId) : null;
        const planName = planRow?.name ?? "your plan";
        const daysLeft = c.planExpiresAt
          ? Math.max(1, Math.ceil((c.planExpiresAt - Date.now()) / (24 * 60 * 60 * 1000)))
          : 3;
        if (!c.userEmail) continue;
        await email.sendTrialExpiryWarningEmail({
          to: c.userEmail,
          name: c.userName ?? c.companyName ?? "there",
          planName,
          daysRemaining: daysLeft,
          billingUrl: `${PLATFORM_ORIGIN}/company/billing`,
        });
        results.warned++;
      } catch (e: any) {
        results.errors.push(`company warning ${c.companyId}: ${e.message}`);
      }
    }
  } catch (e: any) {
    results.errors.push(`getCompaniesExpiringInDays: ${e.message}`);
  }

  // ── 3-day warnings for contractors ────────────────────────────────────────
  try {
    const contractorsWarning = await db.getContractorsExpiringInDays(3);
    for (const c of contractorsWarning) {
      try {
        const planRow = c.planId ? await db.getSubscriptionPlanById(c.planId) : null;
        const planName = planRow?.name ?? "your plan";
        const daysLeft = c.planExpiresAt
          ? Math.max(1, Math.ceil((c.planExpiresAt - Date.now()) / (24 * 60 * 60 * 1000)))
          : 3;
        if (!c.userEmail) continue;
        await email.sendTrialExpiryWarningEmail({
          to: c.userEmail,
          name: c.userName ?? c.contractorName ?? "there",
          planName,
          daysRemaining: daysLeft,
          billingUrl: `${PLATFORM_ORIGIN}/contractor/billing`,
        });
        results.warned++;
      } catch (e: any) {
        results.errors.push(`contractor warning ${c.contractorProfileId}: ${e.message}`);
      }
    }
  } catch (e: any) {
    results.errors.push(`getContractorsExpiringInDays: ${e.message}`);
  }

  // ── Expire overdue company trials ─────────────────────────────────────────
  try {
    const expiredCompanies = await db.getExpiredTrialCompanies();
    for (const c of expiredCompanies) {
      try {
        const planRow = c.planId ? await db.getSubscriptionPlanById(c.planId) : null;
        const planName = planRow?.name ?? "your plan";
        await db.markCompanyPlanExpired(c.companyId);
        if (!c.userEmail) continue;
        await email.sendTrialExpiredEmail({
          to: c.userEmail,
          name: c.userName ?? c.companyName ?? "there",
          planName,
          billingUrl: `${PLATFORM_ORIGIN}/company/billing`,
        });
        results.expired++;
      } catch (e: any) {
        results.errors.push(`company expired ${c.companyId}: ${e.message}`);
      }
    }
  } catch (e: any) {
    results.errors.push(`getExpiredTrialCompanies: ${e.message}`);
  }

  // ── Expire overdue contractor trials ──────────────────────────────────────
  try {
    const expiredContractors = await db.getExpiredTrialContractors();
    for (const c of expiredContractors) {
      try {
        const planRow = c.planId ? await db.getSubscriptionPlanById(c.planId) : null;
        const planName = planRow?.name ?? "your plan";
        await db.markContractorPlanExpired(c.contractorProfileId);
        if (!c.userEmail) continue;
        await email.sendTrialExpiredEmail({
          to: c.userEmail,
          name: c.userName ?? c.contractorName ?? "there",
          planName,
          billingUrl: `${PLATFORM_ORIGIN}/contractor/billing`,
        });
        results.expired++;
      } catch (e: any) {
        results.errors.push(`contractor expired ${c.contractorProfileId}: ${e.message}`);
      }
    }
  } catch (e: any) {
    results.errors.push(`getExpiredTrialContractors: ${e.message}`);
  }

  console.log(
    `[cron] runTrialExpiryCheck complete — warned: ${results.warned}, expired: ${results.expired}, errors: ${results.errors.length}`
  );
  if (results.errors.length > 0) {
    console.error("[cron] Errors during trial expiry check:", results.errors);
  }
}

// ─── Job Escalation Check ─────────────────────────────────────────────────────
async function runJobEscalationCheck(): Promise<void> {
  const now = Date.now();
  console.log(`[cron] runJobEscalationCheck started at ${new Date(now).toISOString()}`);
  let notified = 0;
  const errors: string[] = [];

  try {
    const overdueJobs = await db.getOverdueUnacceptedJobs();
    for (const job of overdueJobs) {
      try {
        // Mark as notified so we don't spam
        await db.markJobEscalationNotified(job.id, now);

        // Notify platform admin
        const { notifyOwner } = await import("./_core/notification");
        await notifyOwner({
          title: `⚠️ Job Not Accepted: ${job.title}`,
          content: `Job #${job.id} "${job.title}" at ${job.propertyName ?? "unknown property"} (Company: ${job.companyName ?? "unknown"}) has been open for more than the escalation timeout without being accepted by a contractor.`,
        });

        // Email the company contact if available
        if (job.companyEmail) {
          await email.sendJobEscalationEmail({
            to: job.companyEmail,
            companyName: job.companyName ?? "Your company",
            jobTitle: job.title,
            jobId: job.id,
            propertyName: job.propertyName ?? "Unknown property",
            minutesOpen: job.minutesOpen,
            jobsUrl: `${PLATFORM_ORIGIN}/company/jobs`,
          });
        }

        notified++;
      } catch (e: any) {
        errors.push(`job ${job.id}: ${e.message}`);
      }
    }
  } catch (e: any) {
    errors.push(`getOverdueUnacceptedJobs: ${e.message}`);
  }

  console.log(`[cron] runJobEscalationCheck complete — notified: ${notified}, errors: ${errors.length}`);
  if (errors.length > 0) console.error("[cron] Escalation errors:", errors);
}

/**
 * Start all scheduled cron jobs.
 * Call this once from the server entry point after the Express server starts.
 */
export function startCronJobs(): void {
  // Run every day at midnight UTC (00:00:00)
  cron.schedule(
    "0 0 * * *",
    async () => {
      try {
        await runTrialExpiryCheck();
      } catch (e: any) {
        console.error("[cron] Unhandled error in runTrialExpiryCheck:", e.message);
      }
    },
    { timezone: "UTC" }
  );

  // Run every 15 minutes to check for jobs that have not been accepted within the escalation timeout
  cron.schedule(
    "*/15 * * * *",
    async () => {
      try {
        await runJobEscalationCheck();
      } catch (e: any) {
        console.error("[cron] Unhandled error in runJobEscalationCheck:", e.message);
      }
    },
    { timezone: "UTC" }
  );

  console.log("[cron] Scheduled: trial expiry check daily at midnight UTC");
  console.log("[cron] Scheduled: job escalation check every 15 minutes");
}
