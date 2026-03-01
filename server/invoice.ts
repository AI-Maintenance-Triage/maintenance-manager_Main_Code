import type { Express, Request, Response } from "express";
import PDFDocument from "pdfkit";
import { getDb } from "./db";
import { transactions, maintenanceRequests, companies, contractorProfiles, properties } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { sdk } from "./_core/sdk";

export function registerInvoiceRoute(app: Express) {
  // GET /api/invoice/:jobId — generates and streams a PDF invoice for a paid job
  app.get("/api/invoice/:jobId", async (req: Request, res: Response) => {
    try {
      // Auth check — must be logged in
      const user = await sdk.authenticateRequest(req).catch(() => null);
      if (!user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const jobId = parseInt(req.params.jobId);
      if (isNaN(jobId)) {
        return res.status(400).json({ error: "Invalid job ID" });
      }

      const db = await getDb();
      if (!db) return res.status(500).json({ error: "Database unavailable" });

      // Fetch job
      const [job] = await db
        .select()
        .from(maintenanceRequests)
        .where(eq(maintenanceRequests.id, jobId))
        .limit(1);

      if (!job) return res.status(404).json({ error: "Job not found" });

      // Authorization: company admin or platform admin only
      if (user.role !== "admin") {
        const { users } = await import("../drizzle/schema");
        const [userRow] = await db
          .select({ companyId: users.companyId })
          .from(users)
          .where(eq(users.id, user.id))
          .limit(1);
        if (!userRow?.companyId || userRow.companyId !== job.companyId) {
          return res.status(403).json({ error: "Forbidden" });
        }
      }

      // Fetch transaction
      const [txn] = await db
        .select()
        .from(transactions)
        .where(eq(transactions.maintenanceRequestId, jobId))
        .limit(1);

      // Fetch company
      const [company] = await db
        .select()
        .from(companies)
        .where(eq(companies.id, job.companyId!))
        .limit(1);

      // Fetch contractor profile
      let contractorName = "Contractor";
      if (job.assignedContractorId) {
        const [cp] = await db
          .select()
          .from(contractorProfiles)
          .where(eq(contractorProfiles.id, job.assignedContractorId))
          .limit(1);
        if (cp) contractorName = cp.businessName ?? "Contractor";
      }

      // Fetch property address
      let propertyAddress = "N/A";
      if (job.propertyId) {
        const [prop] = await db
          .select()
          .from(properties)
          .where(eq(properties.id, job.propertyId))
          .limit(1);
        if (prop) propertyAddress = prop.address ?? "N/A";
      }

      // Build PDF
      const doc = new PDFDocument({ margin: 50, size: "LETTER" });
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="invoice-job-${jobId}.pdf"`
      );
      doc.pipe(res);

      // ── Header ──────────────────────────────────────────────────────────
      doc
        .fontSize(24)
        .font("Helvetica-Bold")
        .text("INVOICE", 50, 50);

      doc
        .fontSize(10)
        .font("Helvetica")
        .fillColor("#666666")
        .text("Maintenance Manager Platform", 50, 82)
        .fillColor("#000000");

      // Invoice number + date on the right
      const invoiceDate = job.paidAt
        ? new Date(job.paidAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
        : new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

      doc
        .fontSize(10)
        .font("Helvetica-Bold")
        .text(`Invoice #: JOB-${String(jobId).padStart(5, "0")}`, 350, 50, { align: "right" })
        .font("Helvetica")
        .text(`Date: ${invoiceDate}`, 350, 65, { align: "right" })
        .text(`Status: ${(job.status ?? "").toUpperCase()}`, 350, 80, { align: "right" });

      // Divider
      doc.moveTo(50, 110).lineTo(562, 110).strokeColor("#cccccc").stroke();

      // ── Bill To / Service Info ───────────────────────────────────────────
      doc.moveDown(1.5);
      const billY = 125;

      doc
        .fontSize(9)
        .font("Helvetica-Bold")
        .fillColor("#888888")
        .text("BILL TO", 50, billY)
        .fillColor("#000000")
        .fontSize(11)
        .font("Helvetica-Bold")
        .text(company?.name ?? "Company", 50, billY + 14)
        .fontSize(9)
        .font("Helvetica")
        .fillColor("#555555")
        .text(company?.email ?? "", 50, billY + 30)
        .text(company?.phone ?? "", 50, billY + 44);

      doc
        .fontSize(9)
        .font("Helvetica-Bold")
        .fillColor("#888888")
        .text("SERVICE PROVIDER", 300, billY)
        .fillColor("#000000")
        .fontSize(11)
        .font("Helvetica-Bold")
        .text(contractorName, 300, billY + 14)
        .fontSize(9)
        .font("Helvetica")
        .fillColor("#555555")
        .text("Independent Contractor", 300, billY + 30);

      // ── Job Details ──────────────────────────────────────────────────────
      doc.fillColor("#000000");
      const detailY = billY + 80;
      doc.moveTo(50, detailY).lineTo(562, detailY).strokeColor("#cccccc").stroke();

      doc
        .fontSize(9)
        .font("Helvetica-Bold")
        .fillColor("#888888")
        .text("JOB DETAILS", 50, detailY + 10)
        .fillColor("#000000")
        .fontSize(11)
        .font("Helvetica-Bold")
        .text(job.title ?? `Job #${jobId}`, 50, detailY + 24)
        .fontSize(9)
        .font("Helvetica")
        .fillColor("#555555")
        .text(`Property: ${propertyAddress}`, 50, detailY + 40)
        .text(`Category: ${job.aiSkillTier ?? "General Maintenance"}`, 50, detailY + 54)
        .text(`Priority: ${(job.aiPriority ?? "normal").toUpperCase()}`, 50, detailY + 68);

      if (job.description) {
        doc.text(`Description: ${job.description}`, 50, detailY + 82, { width: 500 });
      }

      // ── Line Items Table ─────────────────────────────────────────────────
      doc.fillColor("#000000");
      const tableY = detailY + 120;

      // Table header
      doc
        .rect(50, tableY, 512, 22)
        .fillColor("#f0f0f0")
        .fill();

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

      // Labor row
      if (laborCost > 0) {
        doc
          .fontSize(9)
          .font("Helvetica")
          .fillColor("#000000")
          .text("Labor", 58, rowY)
          .text(laborHours.toFixed(2), 310, rowY, { width: 60, align: "right" })
          .text(`$${hourlyRate.toFixed(2)}/hr`, 380, rowY, { width: 60, align: "right" })
          .text(`$${laborCost.toFixed(2)}`, 450, rowY, { width: 100, align: "right" });
        doc.moveTo(50, rowY + 16).lineTo(562, rowY + 16).strokeColor("#eeeeee").stroke();
        rowY += 22;
      }

      // Parts row
      if (partsCost > 0) {
        doc
          .fontSize(9)
          .font("Helvetica")
          .fillColor("#000000")
          .text("Parts & Materials", 58, rowY)
          .text("—", 310, rowY, { width: 60, align: "right" })
          .text("—", 380, rowY, { width: 60, align: "right" })
          .text(`$${partsCost.toFixed(2)}`, 450, rowY, { width: 100, align: "right" });
        doc.moveTo(50, rowY + 16).lineTo(562, rowY + 16).strokeColor("#eeeeee").stroke();
        rowY += 22;
      }

      // Subtotal
      rowY += 6;
      doc
        .fontSize(9)
        .font("Helvetica")
        .fillColor("#555555")
        .text("Subtotal (Contractor Payout)", 58, rowY)
        .text(`$${contractorPayout.toFixed(2)}`, 450, rowY, { width: 100, align: "right" });
      rowY += 18;

      // Platform fee
      if (platformFee > 0) {
        doc
          .text("Platform Service Fee", 58, rowY)
          .text(`$${platformFee.toFixed(2)}`, 450, rowY, { width: 100, align: "right" });
        rowY += 18;
      }

      // Total
      doc.moveTo(350, rowY).lineTo(562, rowY).strokeColor("#333333").lineWidth(1).stroke();
      rowY += 8;
      doc
        .fontSize(12)
        .font("Helvetica-Bold")
        .fillColor("#000000")
        .text("TOTAL CHARGED", 58, rowY)
        .text(`$${totalCharged.toFixed(2)}`, 450, rowY, { width: 100, align: "right" });

      // ── Payment Info ─────────────────────────────────────────────────────
      rowY += 40;
      doc.moveTo(50, rowY).lineTo(562, rowY).strokeColor("#cccccc").lineWidth(0.5).stroke();
      rowY += 14;

      doc
        .fontSize(9)
        .font("Helvetica-Bold")
        .fillColor("#888888")
        .text("PAYMENT INFORMATION", 50, rowY);
      rowY += 14;

      doc
        .fontSize(9)
        .font("Helvetica")
        .fillColor("#555555");

      if (txn?.stripePaymentIntentId) {
        doc.text(`Payment Reference: ${txn.stripePaymentIntentId}`, 50, rowY);
        rowY += 14;
      }
      if (txn?.stripeTransferId) {
        doc.text(`Transfer Reference: ${txn.stripeTransferId}`, 50, rowY);
        rowY += 14;
      }
      doc.text(`Payment Status: ${txn?.status?.toUpperCase() ?? "PAID"}`, 50, rowY);

      // ── Footer ───────────────────────────────────────────────────────────
      doc
        .fontSize(8)
        .fillColor("#aaaaaa")
        .text(
          "This invoice was generated automatically by Maintenance Manager. For questions, contact support.",
          50,
          720,
          { align: "center", width: 512 }
        );

      doc.end();
    } catch (err) {
      console.error("[Invoice] Error generating invoice:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to generate invoice" });
      }
    }
  });
}
