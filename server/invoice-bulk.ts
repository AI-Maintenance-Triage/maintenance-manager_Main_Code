import type { Express, Request, Response } from "express";
import PDFDocument from "pdfkit";
import archiver from "archiver";
import { getDb } from "./db";
import {
  transactions,
  maintenanceRequests,
  companies,
  contractorProfiles,
  properties,
  users,
} from "../drizzle/schema";
import { and, eq, gte, lte, inArray } from "drizzle-orm";
import { sdk } from "./_core/sdk";

/**
 * Generates a single invoice PDF buffer for a job.
 * Reuses the same rendering logic as the individual invoice endpoint.
 */
async function generateInvoicePdf(
  job: typeof maintenanceRequests.$inferSelect,
  txn: (typeof transactions.$inferSelect) | null,
  company: typeof companies.$inferSelect,
  contractorName: string,
  propertyAddress: string
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({ margin: 50, size: "LETTER" });
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // ── Header ──────────────────────────────────────────────────────────────
    doc
      .rect(0, 0, 612, 100)
      .fillColor("#111111")
      .fill();
    doc
      .fontSize(22)
      .font("Helvetica-Bold")
      .fillColor("#ffffff")
      .text("INVOICE", 50, 35);
    doc
      .fontSize(9)
      .font("Helvetica")
      .fillColor("#aaaaaa")
      .text("Maintenance Manager", 50, 62);

    // Invoice number and date
    const invoiceDate = job.paidAt
      ? new Date(job.paidAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
      : new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    doc
      .fontSize(9)
      .font("Helvetica")
      .fillColor("#aaaaaa")
      .text(`Invoice #: INV-${String(job.id).padStart(6, "0")}`, 350, 40, { align: "right", width: 212 })
      .text(`Date: ${invoiceDate}`, 350, 55, { align: "right", width: 212 })
      .text(`Status: PAID`, 350, 70, { align: "right", width: 212 });

    // ── Bill To / From ───────────────────────────────────────────────────────
    const billingY = 120;
    doc
      .fontSize(8)
      .font("Helvetica-Bold")
      .fillColor("#888888")
      .text("BILL TO", 50, billingY)
      .text("SERVICE PROVIDER", 300, billingY);
    doc
      .fontSize(10)
      .font("Helvetica-Bold")
      .fillColor("#000000")
      .text(company.name ?? "Company", 50, billingY + 14)
      .text(contractorName, 300, billingY + 14);

    // ── Job Details ──────────────────────────────────────────────────────────
    const detailY = 200;
    doc
      .rect(50, detailY, 512, 22)
      .fillColor("#f5f5f5")
      .fill();
    doc
      .fontSize(9)
      .font("Helvetica-Bold")
      .fillColor("#333333")
      .text("JOB DETAILS", 58, detailY + 7);
    doc
      .fontSize(9)
      .font("Helvetica")
      .fillColor("#333333")
      .text(`Job: ${job.title}`, 50, detailY + 30)
      .text(`Property: ${propertyAddress}`, 50, detailY + 44)
      .text(`Category: ${job.aiSkillTier ?? "General Maintenance"}`, 50, detailY + 58)
      .text(`Priority: ${(job.aiPriority ?? "normal").toUpperCase()}`, 50, detailY + 72);

    // ── Line Items ───────────────────────────────────────────────────────────
    doc.fillColor("#000000");
    const tableY = detailY + 110;
    doc.rect(50, tableY, 512, 22).fillColor("#f0f0f0").fill();
    doc
      .fontSize(9)
      .font("Helvetica-Bold")
      .fillColor("#333333")
      .text("DESCRIPTION", 58, tableY + 7)
      .text("HOURS", 310, tableY + 7, { width: 60, align: "right" })
      .text("RATE", 380, tableY + 7, { width: 60, align: "right" })
      .text("AMOUNT", 450, tableY + 7, { width: 100, align: "right" });

    doc.fillColor("#000000");
    const laborMinutes = job.totalLaborMinutes ?? 0;
    const laborHours = laborMinutes / 60;
    const hourlyRate = parseFloat(job.hourlyRate ?? "0");
    const laborCost = parseFloat(job.totalLaborCost ?? "0");
    const partsCost = parseFloat(job.totalPartsCost ?? "0");
    const platformFee = txn ? parseFloat(txn.platformFee ?? "0") : parseFloat(job.platformFee ?? "0");
    const totalCharged = txn ? parseFloat(txn.totalCharged ?? "0") : parseFloat(job.totalCost ?? "0");
    const contractorPayout = txn ? parseFloat(txn.contractorPayout ?? "0") : laborCost + partsCost;

    let rowY = tableY + 30;
    if (laborCost > 0) {
      doc
        .fontSize(9).font("Helvetica").fillColor("#000000")
        .text("Labor", 58, rowY)
        .text(laborHours.toFixed(2), 310, rowY, { width: 60, align: "right" })
        .text(`$${hourlyRate.toFixed(2)}/hr`, 380, rowY, { width: 60, align: "right" })
        .text(`$${laborCost.toFixed(2)}`, 450, rowY, { width: 100, align: "right" });
      doc.moveTo(50, rowY + 16).lineTo(562, rowY + 16).strokeColor("#eeeeee").stroke();
      rowY += 22;
    }
    if (partsCost > 0) {
      doc
        .fontSize(9).font("Helvetica").fillColor("#000000")
        .text("Parts & Materials", 58, rowY)
        .text("—", 310, rowY, { width: 60, align: "right" })
        .text("—", 380, rowY, { width: 60, align: "right" })
        .text(`$${partsCost.toFixed(2)}`, 450, rowY, { width: 100, align: "right" });
      doc.moveTo(50, rowY + 16).lineTo(562, rowY + 16).strokeColor("#eeeeee").stroke();
      rowY += 22;
    }
    rowY += 6;
    doc.fontSize(9).font("Helvetica").fillColor("#555555")
      .text("Subtotal (Contractor Payout)", 58, rowY)
      .text(`$${contractorPayout.toFixed(2)}`, 450, rowY, { width: 100, align: "right" });
    rowY += 18;
    if (platformFee > 0) {
      doc.text("Platform Service Fee", 58, rowY)
        .text(`$${platformFee.toFixed(2)}`, 450, rowY, { width: 100, align: "right" });
      rowY += 18;
    }
    doc.moveTo(350, rowY).lineTo(562, rowY).strokeColor("#333333").lineWidth(1).stroke();
    rowY += 8;
    doc.fontSize(12).font("Helvetica-Bold").fillColor("#000000")
      .text("TOTAL CHARGED", 58, rowY)
      .text(`$${totalCharged.toFixed(2)}`, 450, rowY, { width: 100, align: "right" });

    // ── Footer ───────────────────────────────────────────────────────────────
    doc.fontSize(8).fillColor("#aaaaaa")
      .text(
        "This invoice was generated automatically by Maintenance Manager.",
        50, 720, { align: "center", width: 512 }
      );

    doc.end();
  });
}

export function registerInvoiceBulkRoute(app: Express) {
  /**
   * GET /api/invoices/bulk?from=YYYY-MM-DD&to=YYYY-MM-DD
   * Downloads a ZIP file containing individual PDF invoices for all paid jobs
   * in the given date range belonging to the authenticated company.
   */
  app.get("/api/invoices/bulk", async (req: Request, res: Response) => {
    try {
      const user = await sdk.authenticateRequest(req).catch(() => null);
      if (!user) return res.status(401).json({ error: "Unauthorized" });

      const db = await getDb();
      if (!db) return res.status(500).json({ error: "Database unavailable" });

      // Resolve company ID
      let companyId: number | null = null;
      if (user.role === "admin") {
        // Admin must pass companyId as query param
        companyId = req.query.companyId ? parseInt(req.query.companyId as string) : null;
      } else {
        const [userRow] = await db
          .select({ companyId: users.companyId })
          .from(users)
          .where(eq(users.id, user.id))
          .limit(1);
        companyId = userRow?.companyId ?? null;
      }
      if (!companyId) return res.status(403).json({ error: "No company associated with this account" });

      // Parse date range
      const fromStr = req.query.from as string | undefined;
      const toStr = req.query.to as string | undefined;
      if (!fromStr || !toStr) {
        return res.status(400).json({ error: "Query params 'from' and 'to' are required (YYYY-MM-DD)" });
      }
      const fromTs = new Date(fromStr).getTime();
      const toTs = new Date(toStr + "T23:59:59.999Z").getTime();
      if (isNaN(fromTs) || isNaN(toTs)) {
        return res.status(400).json({ error: "Invalid date format. Use YYYY-MM-DD." });
      }

      // Fetch paid jobs in the date range for this company
      const jobs = await db
        .select()
        .from(maintenanceRequests)
        .where(
          and(
            eq(maintenanceRequests.companyId, companyId),
            inArray(maintenanceRequests.status, ["paid", "payment_pending_ach"]),
            gte(maintenanceRequests.paidAt, new Date(fromTs)),
            lte(maintenanceRequests.paidAt, new Date(toTs))
          )
        );

      if (jobs.length === 0) {
        return res.status(404).json({ error: "No paid invoices found in the selected date range." });
      }

      // Fetch company info once
      const [company] = await db
        .select()
        .from(companies)
        .where(eq(companies.id, companyId))
        .limit(1);

      // Fetch all transactions for these jobs in one query
      const jobIds = jobs.map((j) => j.id);
      const txns = await db
        .select()
        .from(transactions)
        .where(inArray(transactions.maintenanceRequestId, jobIds));
      const txnByJobId = new Map(txns.map((t) => [t.maintenanceRequestId, t]));

      // Fetch all contractor profiles
      const contractorIds = Array.from(new Set(jobs.map((j) => j.assignedContractorId).filter(Boolean))) as number[];
      const contractorRows = contractorIds.length > 0
        ? await db.select().from(contractorProfiles).where(inArray(contractorProfiles.id, contractorIds))
        : [];
      const contractorById = new Map(contractorRows.map((c) => [c.id, c]));

      // Fetch all properties
      const propertyIds = Array.from(new Set(jobs.map((j) => j.propertyId).filter(Boolean))) as number[];
      const propertyRows = propertyIds.length > 0
        ? await db.select().from(properties).where(inArray(properties.id, propertyIds))
        : [];
      const propertyById = new Map(propertyRows.map((p) => [p.id, p]));

      // Stream ZIP response
      const safeFrom = fromStr.replace(/-/g, "");
      const safeTo = toStr.replace(/-/g, "");
      res.setHeader("Content-Type", "application/zip");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="invoices-${safeFrom}-${safeTo}.zip"`
      );

      const archive = archiver("zip", { zlib: { level: 6 } });
      archive.on("error", (err: Error) => {
        console.error("[InvoiceBulk] Archiver error:", err);
        if (!res.headersSent) res.status(500).end();
      });
      archive.pipe(res);

      for (const job of jobs) {
        const txn = txnByJobId.get(job.id) ?? null;
        const contractor = job.assignedContractorId ? contractorById.get(job.assignedContractorId) : null;
        const property = job.propertyId ? propertyById.get(job.propertyId) : null;
        const contractorName = contractor?.businessName ?? "Contractor";
        const propertyAddress = property?.address ?? "N/A";

        try {
          const pdfBuffer = await generateInvoicePdf(
            job,
            txn,
            company,
            contractorName,
            propertyAddress
          );
          archive.append(pdfBuffer, { name: `invoice-job-${job.id}.pdf` });
        } catch (err) {
          console.error(`[InvoiceBulk] Failed to generate PDF for job ${job.id}:`, err);
          // Skip failed PDFs — continue with the rest
        }
      }

      await archive.finalize();
    } catch (err) {
      console.error("[InvoiceBulk] Error:", err);
      if (!res.headersSent) res.status(500).json({ error: "Failed to generate invoice export" });
    }
  });
}
