/**
 * cron-routes.ts
 * HTTP endpoints for manually triggering cron jobs.
 * Protected by x-cron-secret header to prevent unauthorized execution.
 */
import { Express, Request, Response } from "express";
import { runTrialExpiryCheck, runJobEscalationCheck, runPmsSyncAll } from "./cron";

const CRON_SECRET = process.env.CRON_SECRET;

function verifyCronSecret(req: Request, res: Response): boolean {
  if (!CRON_SECRET) {
    // If no secret is configured, reject all requests for safety
    res.status(401).json({ error: "Cron secret not configured" });
    return false;
  }
  const provided = req.headers["x-cron-secret"];
  if (!provided || provided !== CRON_SECRET) {
    res.status(401).json({ error: "Unauthorized: invalid or missing cron secret" });
    return false;
  }
  return true;
}

export function registerCronRoutes(app: Express) {
  app.post("/api/cron/trial-expiry", async (req: Request, res: Response) => {
    if (!verifyCronSecret(req, res)) return;
    try {
      const result = await runTrialExpiryCheck();
      res.json({ ok: true, result });
    } catch (e) {
      console.error("[cron-routes] trial-expiry error:", e);
      res.status(500).json({ error: "Internal error during trial expiry check" });
    }
  });

  app.post("/api/cron/pms-sync", async (req: Request, res: Response) => {
    if (!verifyCronSecret(req, res)) return;
    try {
      await runPmsSyncAll();
      res.json({ ok: true });
    } catch (e) {
      console.error("[cron-routes] pms-sync error:", e);
      res.status(500).json({ error: "Internal error during PMS sync" });
    }
  });

  app.post("/api/cron/job-escalation", async (req: Request, res: Response) => {
    if (!verifyCronSecret(req, res)) return;
    try {
      await runJobEscalationCheck();
      res.json({ ok: true });
    } catch (e) {
      console.error("[cron-routes] job-escalation error:", e);
      res.status(500).json({ error: "Internal error during job escalation check" });
    }
  });
}
