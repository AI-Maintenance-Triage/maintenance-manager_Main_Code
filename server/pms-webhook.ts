/**
 * PMS Webhook Receiver
 *
 * Accepts inbound maintenance request payloads from property management
 * software (Buildium, AppFolio, Rent Manager, Yardi, DoorLoop, RealPage,
 * Propertyware) and auto-creates jobs in the platform.
 *
 * Authentication:
 *   Primary:   HMAC-SHA256 signature verification (if webhookSecret is set on connector)
 *   Fallback:  Bearer token matching the company's integration connector apiKey
 *
 * Route: POST /api/webhooks/pms/:provider
 *
 * Normalised payload (any PMS can map to this):
 * {
 *   externalId:   string            // PMS-side work order / ticket ID
 *   title:        string            // short summary
 *   description:  string            // full description
 *   propertyId?:  number            // our internal property ID (preferred)
 *   propertyRef?: string            // PMS property name / address / external ref
 *   unitNumber?:  string
 *   tenantName?:  string
 *   tenantEmail?: string
 *   tenantPhone?: string
 *   priority?:    "low"|"medium"|"high"|"emergency"
 *   photoUrls?:   string[]
 * }
 */

import { createHmac, timingSafeEqual } from "crypto";
import { Request, Response, Router } from "express";
import * as db from "./db";
import { pmsWebhookEvents, integrationConnectors, pmsIntegrations } from "../drizzle/schema";
import { getDb } from "./db";
import { eq, and } from "drizzle-orm";
import { invokeLLM } from "./_core/llm";
import { notifyOwner } from "./_core/notification";
import { buildiumAdapter } from "./pms/buildium";
import type { PmsCredentials } from "./pms/types";
import { runPmsSync } from "./pms/index";

// Supported providers — must match the schema enum
const SUPPORTED_PROVIDERS = [
  "buildium", "appfolio", "rentmanager", "yardi", "doorloop", "realpage", "propertyware",
] as const;
type Provider = typeof SUPPORTED_PROVIDERS[number];

// ─── HMAC Signature Verification ─────────────────────────────────────────────

/**
 * Per-provider header name for the HMAC signature.
 * Buildium: X-Buildium-Signature
 * AppFolio: X-AppFolio-Signature
 * Generic:  X-Webhook-Signature
 */
function getSignatureHeader(provider: Provider): string {
  switch (provider) {
    case "buildium":    return "x-buildium-signature";
    case "appfolio":    return "x-appfolio-signature";
    case "rentmanager": return "x-rentmanager-signature";
    case "yardi":       return "x-yardi-signature";
    case "doorloop":    return "x-doorloop-signature";
    case "realpage":    return "x-realpage-signature";
    case "propertyware":return "x-propertyware-signature";
    default:            return "x-webhook-signature";
  }
}

/**
 * Verify HMAC-SHA256 signature.
 * Returns true if the signature matches, false otherwise.
 * Uses timing-safe comparison to prevent timing attacks.
 */
export function verifyHmacSignature(
  secret: string,
  rawBody: Buffer,
  signatureHeader: string
): boolean {
  try {
    // Some providers prefix with "sha256=" — strip it
    const sig = signatureHeader.startsWith("sha256=")
      ? signatureHeader.slice(7)
      : signatureHeader;
    const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
    const expectedBuf = Buffer.from(expected, "hex");
    const sigBuf = Buffer.from(sig, "hex");
    if (expectedBuf.length !== sigBuf.length) return false;
    return timingSafeEqual(expectedBuf, sigBuf);
  } catch {
    return false;
  }
}

// ─── Normalised inbound payload ───────────────────────────────────────────
interface PmsPayload {
  externalId?: string;
  title?: string;
  description?: string;
  propertyId?: number;
  propertyRef?: string;
  unitNumber?: string;
  tenantName?: string;
  tenantEmail?: string;
  tenantPhone?: string;
  priority?: "low" | "medium" | "high" | "emergency";
  photoUrls?: string[];
  // Provider-specific raw fields — we normalise these below
  [key: string]: unknown;
}

// ─── Provider-specific normalisation ─────────────────────────────────────
function normalise(provider: Provider, raw: Record<string, unknown>): PmsPayload {
  switch (provider) {
    case "buildium": {
      // Buildium work order webhook shape
      const wo = (raw.WorkOrder ?? raw) as Record<string, unknown>;
      return {
        externalId: String(wo.Id ?? raw.id ?? ""),
        title: String(wo.Title ?? wo.Subject ?? raw.title ?? "Maintenance Request"),
        description: String(wo.Description ?? raw.description ?? ""),
        unitNumber: String(wo.UnitNumber ?? raw.unit ?? ""),
        tenantName: String(wo.TenantName ?? ""),
        tenantEmail: String(wo.TenantEmail ?? ""),
        tenantPhone: String(wo.TenantPhone ?? ""),
        priority: mapPriority(String(wo.Priority ?? raw.priority ?? "")),
        propertyRef: String(wo.PropertyAddress ?? wo.PropertyName ?? ""),
        photoUrls: Array.isArray(raw.photoUrls) ? raw.photoUrls as string[] : [],
      };
    }
    case "appfolio": {
      const mr = (raw.maintenance_request ?? raw) as Record<string, unknown>;
      return {
        externalId: String(mr.id ?? raw.id ?? ""),
        title: String(mr.subject ?? mr.title ?? raw.title ?? "Maintenance Request"),
        description: String(mr.description ?? raw.description ?? ""),
        unitNumber: String(mr.unit ?? ""),
        tenantName: String(mr.tenant_name ?? ""),
        tenantEmail: String(mr.tenant_email ?? ""),
        tenantPhone: String(mr.tenant_phone ?? ""),
        priority: mapPriority(String(mr.priority ?? raw.priority ?? "")),
        propertyRef: String(mr.property_address ?? mr.property_name ?? ""),
        photoUrls: Array.isArray(raw.photo_urls) ? raw.photo_urls as string[] : [],
      };
    }
    case "rentmanager": {
      const sr = (raw.ServiceRequest ?? raw) as Record<string, unknown>;
      return {
        externalId: String(sr.ServiceRequestID ?? sr.ID ?? raw.id ?? ""),
        title: String(sr.Subject ?? sr.Title ?? raw.title ?? "Maintenance Request"),
        description: String(sr.Description ?? raw.description ?? ""),
        unitNumber: String(sr.UnitNumber ?? ""),
        tenantName: String(sr.TenantName ?? ""),
        tenantEmail: String(sr.TenantEmail ?? ""),
        tenantPhone: String(sr.TenantPhone ?? ""),
        priority: mapPriority(String(sr.Priority ?? raw.priority ?? "")),
        propertyRef: String(sr.PropertyName ?? sr.PropertyAddress ?? ""),
        photoUrls: [],
      };
    }
    default: {
      // Generic / webhook-only mode — accept any reasonable field names
      return {
        externalId: String(raw.externalId ?? raw.id ?? raw.external_id ?? ""),
        title: String(raw.title ?? raw.subject ?? raw.summary ?? "Maintenance Request"),
        description: String(raw.description ?? raw.body ?? raw.notes ?? ""),
        unitNumber: String(raw.unitNumber ?? raw.unit ?? raw.unit_number ?? ""),
        tenantName: String(raw.tenantName ?? raw.tenant_name ?? raw.tenant ?? ""),
        tenantEmail: String(raw.tenantEmail ?? raw.tenant_email ?? ""),
        tenantPhone: String(raw.tenantPhone ?? raw.tenant_phone ?? ""),
        priority: mapPriority(String(raw.priority ?? "")),
        propertyRef: String(raw.propertyRef ?? raw.property_ref ?? raw.property ?? raw.address ?? ""),
        photoUrls: Array.isArray(raw.photoUrls) ? raw.photoUrls as string[] :
                   Array.isArray(raw.photo_urls) ? raw.photo_urls as string[] : [],
      };
    }
  }
}

function mapPriority(raw: string): "low" | "medium" | "high" | "emergency" {
  const p = raw.toLowerCase();
  if (p.includes("emergency") || p.includes("urgent") || p === "critical") return "emergency";
  if (p.includes("high")) return "high";
  if (p.includes("low")) return "low";
  return "medium";
}

// ─── AI Classification ────────────────────────────────────────────────────
async function classifyWithAI(title: string, description: string) {
  try {
    const result = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are a property maintenance classifier. Given a maintenance request, return JSON with:
- priority: "low" | "medium" | "high" | "emergency"
- skillTier: a short trade label (e.g. "Plumbing", "HVAC", "Electrical", "General Repair", "Appliance", "Pest Control", "Roofing", "Landscaping")
- reasoning: one sentence explaining the classification
- isEmergency: boolean`,
        },
        {
          role: "user" as const,
          content: `Title: ${title}\nDescription: ${description}`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "maintenance_classification",
          strict: true,
          schema: {
            type: "object",
            properties: {
              priority: { type: "string", enum: ["low", "medium", "high", "emergency"] },
              skillTier: { type: "string" },
              reasoning: { type: "string" },
              isEmergency: { type: "boolean" },
            },
            required: ["priority", "skillTier", "reasoning", "isEmergency"],
            additionalProperties: false,
          },
        },
      },
    });
    const raw = result?.choices?.[0]?.message?.content;
    const content = typeof raw === "string" ? raw : null;
    if (!content) return null;
    return JSON.parse(content) as { priority: "low" | "medium" | "high" | "emergency"; skillTier: string; reasoning: string; isEmergency: boolean };
  } catch {
    return null;
  }
}

// ─── Property resolution ──────────────────────────────────────────────────
async function resolveProperty(companyId: number, payload: PmsPayload): Promise<number | null> {
  // 1. Direct internal ID provided
  if (payload.propertyId) {
    const prop = await db.getPropertyById(payload.propertyId, companyId);
    if (prop) return prop.id;
  }
  // 2. Try to match by name/address substring
  if (payload.propertyRef) {
    const props = await db.listProperties(companyId);
    const ref = payload.propertyRef.toLowerCase();
    const match = props.find(
      (p) =>
        (p.name && p.name.toLowerCase().includes(ref)) ||
        (p.address && p.address.toLowerCase().includes(ref)) ||
        (p.zipCode && ref.includes(p.zipCode))
    );
    if (match) return match.id;
    // 3. If no match, use the first property as a fallback (company can reassign later)
    if (props.length > 0) return props[0].id;
  }
  // 4. Absolute fallback: first property in company
  const props = await db.listProperties(companyId);
  return props.length > 0 ? props[0].id : null;
}

// ─── Main handler ─────────────────────────────────────────────────────────
async function handlePmsWebhook(req: Request, res: Response) {
  const provider = req.params.provider as Provider;

  if (!SUPPORTED_PROVIDERS.includes(provider)) {
    return res.status(400).json({ error: `Unsupported provider: ${provider}` });
  }

  const database = await getDb();
  if (!database) return res.status(503).json({ error: "Database unavailable" });

  // ── Step 1: Identify the connector ──────────────────────────────────────
  // Try HMAC-signed requests first (no Bearer token needed — provider signs the body)
  // Fall back to Bearer token auth for connectors without a webhook secret configured.

  const authHeader = req.headers.authorization ?? "";
  const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;

  // rawBody is available because we registered the route with express.raw()
  const rawBody: Buffer = (req as any).rawBody ?? Buffer.from(JSON.stringify(req.body));

  // Check if there's a signature header for this provider
  const sigHeaderName = getSignatureHeader(provider);
  const incomingSignature = req.headers[sigHeaderName] as string | undefined;

  // Resolved company ID — set by whichever auth path succeeds
  let companyId: number | undefined;

  if (incomingSignature) {
    // ── HMAC path ──────────────────────────────────────────────────────────
    // Check pmsIntegrations first (new table used by the connect flow)
    const pmsRows = await database
      .select({ id: pmsIntegrations.id, companyId: pmsIntegrations.companyId, webhookSecret: pmsIntegrations.webhookSecret })
      .from(pmsIntegrations)
      .where(and(eq(pmsIntegrations.provider, provider), eq(pmsIntegrations.status, "connected")))
      .limit(50);

    const matchedPms = pmsRows.find((r) => {
      if (!r.webhookSecret) return false;
      return verifyHmacSignature(r.webhookSecret, rawBody, incomingSignature);
    });

    if (matchedPms) {
      companyId = matchedPms.companyId;
    } else {
      // Fall back to legacy integrationConnectors table
      const legacyCandidates = await database
        .select()
        .from(integrationConnectors)
        .where(and(eq(integrationConnectors.provider, provider), eq(integrationConnectors.isActive, true)))
        .limit(50);

      const matchedLegacy = legacyCandidates.find((c) => {
        if (!c.webhookSecret) return false;
        return verifyHmacSignature(c.webhookSecret, rawBody, incomingSignature);
      });

      if (matchedLegacy) {
        companyId = matchedLegacy.companyId;
      }
    }

    if (!companyId) {
      return res.status(401).json({ error: "Invalid webhook signature" });
    }
  } else {
    // ── Bearer token fallback ───────────────────────────────────────────────
    if (!bearerToken) {
      return res.status(401).json({ error: "Missing Authorization header or webhook signature" });
    }

    const [found] = await database
      .select()
      .from(integrationConnectors)
      .where(and(
        eq(integrationConnectors.provider, provider),
        eq(integrationConnectors.apiKey, bearerToken),
        eq(integrationConnectors.isActive, true)
      ))
      .limit(1);

    if (!found) {
      return res.status(401).json({ error: "Invalid API key or integration not active" });
    }
    companyId = found.companyId;
  }
  const rawPayload = req.body as Record<string, unknown>;

  // Log the inbound event
  const [eventRow] = await database
    .insert(pmsWebhookEvents)
    .values({ provider, companyId, rawPayload, status: "received" });
  const eventId = (eventRow as any).insertId as number;

  try {
    const payload = normalise(provider, rawPayload);

    // Require at minimum a title
    if (!payload.title || payload.title === "undefined") {
      await database.update(pmsWebhookEvents).set({ status: "ignored", errorMessage: "No title in payload" }).where(eq(pmsWebhookEvents.id, eventId));
      return res.status(200).json({ status: "ignored", reason: "no_title" });
    }

    // Deduplicate: skip if externalId already processed for this company
    if (payload.externalId) {
      const dupCheck = await database
        .select({ id: pmsWebhookEvents.id, rawPayload: pmsWebhookEvents.rawPayload })
        .from(pmsWebhookEvents)
        .where(and(eq(pmsWebhookEvents.companyId, companyId), eq(pmsWebhookEvents.provider, provider)))
        .limit(200);
      const isDup = dupCheck.some((e: any) => {
        const rp = e.rawPayload as Record<string, unknown> | null;
        if (!rp) return false;
        const norm = normalise(provider, rp);
        return norm.externalId === payload.externalId;
      });
      if (isDup) {
        await database.update(pmsWebhookEvents).set({ status: "ignored", errorMessage: "Duplicate externalId" }).where(eq(pmsWebhookEvents.id, eventId));
        return res.status(200).json({ status: "ignored", reason: "duplicate" });
      }
    }

    // Resolve property
    const propertyId = await resolveProperty(companyId, payload);
    if (!propertyId) {
      await database.update(pmsWebhookEvents).set({ status: "failed", errorMessage: "No properties found for company" }).where(eq(pmsWebhookEvents.id, eventId));
      return res.status(422).json({ error: "No properties found for this company" });
    }

    // AI classification
    const ai = await classifyWithAI(payload.title, payload.description ?? "");

    // Create the maintenance request
    const jobId = await db.createMaintenanceRequest({
      companyId,
      propertyId,
      externalId: payload.externalId ?? null,
      source: provider,
      title: payload.title,
      description: payload.description ?? "",
      unitNumber: payload.unitNumber ?? null,
      tenantName: payload.tenantName ?? null,
      tenantEmail: payload.tenantEmail ?? null,
      tenantPhone: payload.tenantPhone ?? null,
      photoUrls: payload.photoUrls ?? [],
      aiPriority: ai?.priority ?? payload.priority ?? "medium",
      aiSkillTier: ai?.skillTier ?? null,
      aiReasoning: ai?.reasoning ?? null,
      aiClassifiedAt: ai ? new Date() : null,
      isEmergency: ai?.isEmergency ?? payload.priority === "emergency",
      status: "open",
    });

    // Mark event as processed
    await database.update(pmsWebhookEvents).set({ status: "processed", createdJobId: jobId }).where(eq(pmsWebhookEvents.id, eventId));

    // Notify owner (admin) of new automated job
    await notifyOwner({
      title: `New job from ${provider}`,
      content: `A maintenance request was automatically created for company #${companyId}: "${payload.title}" (Job #${jobId})`,
    }).catch(() => {});

    return res.status(201).json({ status: "created", jobId });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    await database.update(pmsWebhookEvents).set({ status: "failed", errorMessage: msg }).where(eq(pmsWebhookEvents.id, eventId));
    console.error("[PMS Webhook] Error processing payload:", msg);
    return res.status(500).json({ error: "Internal error processing webhook" });
  }
}

// ─── Property auto-push handler ──────────────────────────────────────────
/**
 * Handles Buildium property events (rental.created, rental.updated).
 * When Buildium fires these events, we re-run the full PMS sync for that company
 * so the new/updated property appears immediately without a manual resync.
 *
 * Buildium sends a webhook with event type in the body:
 * { "EventType": "rental.created", "EntityId": 12345, ... }
 */
async function handlePropertyWebhook(companyId: number, provider: Provider, rawPayload: Record<string, unknown>) {
  try {
    // Determine if this is a property event
    const eventType = String(rawPayload.EventType ?? rawPayload.event_type ?? rawPayload.eventType ?? "").toLowerCase();
    const isPropertyEvent = [
      "rental.created", "rental.updated", "rental.deleted",
      "property.created", "property.updated", "property.deleted",
    ].some(t => eventType.includes(t.split(".")[0]) && eventType.includes(t.split(".")[1]));

    if (!isPropertyEvent) return; // Not a property event — skip

    console.log(`[PMS Webhook] Property event "${eventType}" for company ${companyId} — triggering sync`);

    // Look up the PMS integration credentials for this company
    const database = await getDb();
    if (!database) return;

    const [integration] = await database
      .select()
      .from(pmsIntegrations)
      .where(and(
        eq(pmsIntegrations.companyId, companyId),
        eq(pmsIntegrations.provider, provider),
        eq(pmsIntegrations.status, "connected")
      ))
      .limit(1);

    if (!integration) return;

    // Run a full sync for this company's PMS integration
    await runPmsSync(companyId, integration.id);

    console.log(`[PMS Webhook] Property sync complete for company ${companyId}`);
  } catch (err) {
    console.error(`[PMS Webhook] Property auto-push error for company ${companyId}:`, err);
  }
}

// ─── Route registration ───────────────────────────────────────────────────
export function registerPmsWebhookRoute(app: { use: (path: string, router: Router) => void }) {
  const router = Router();
  // Use express.raw() to preserve the raw body for HMAC signature verification
  // This must be registered BEFORE express.json() parses the body
  router.post("/:provider", (req, res, next) => {
    // Capture raw body for HMAC verification
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      (req as any).rawBody = Buffer.concat(chunks);
      // Parse JSON body manually since express.raw() won't do it
      try {
        req.body = JSON.parse((req as any).rawBody.toString());
      } catch {
        req.body = {};
      }
      next();
    });
  }, async (req, res) => {
    const provider = req.params.provider as Provider;
    const rawPayload = req.body as Record<string, unknown>;

    // Check if this is a property event — handle it separately from maintenance requests
    const eventType = String(rawPayload.EventType ?? rawPayload.event_type ?? rawPayload.eventType ?? "").toLowerCase();
    const isPropertyEvent = [
      "rental.created", "rental.updated", "rental.deleted",
      "property.created", "property.updated", "property.deleted",
    ].some(t => eventType.includes(t.split(".")[0]) && eventType.includes(t.split(".")[1]));

    if (isPropertyEvent) {
      // Authenticate the request first
      const database = await getDb();
      if (!database) return res.status(503).json({ error: "Database unavailable" });

      const authHeader = req.headers.authorization ?? "";
      const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;
      const rawBody: Buffer = (req as any).rawBody ?? Buffer.from(JSON.stringify(rawPayload));
      const sigHeaderName = getSignatureHeader(provider);
      const incomingSignature = req.headers[sigHeaderName] as string | undefined;

      let companyId: number | undefined;

      if (incomingSignature) {
        const pmsRows = await database
          .select({ id: pmsIntegrations.id, companyId: pmsIntegrations.companyId, webhookSecret: pmsIntegrations.webhookSecret })
          .from(pmsIntegrations)
          .where(and(eq(pmsIntegrations.provider, provider), eq(pmsIntegrations.status, "connected")))
          .limit(50);
        const matchedPms = pmsRows.find((r) => r.webhookSecret && verifyHmacSignature(r.webhookSecret, rawBody, incomingSignature));
        if (matchedPms) companyId = matchedPms.companyId;
      } else if (bearerToken) {
        const [found] = await database
          .select()
          .from(integrationConnectors)
          .where(and(eq(integrationConnectors.provider, provider), eq(integrationConnectors.apiKey, bearerToken), eq(integrationConnectors.isActive, true)))
          .limit(1);
        if (found) companyId = found.companyId;
      }

      if (!companyId) return res.status(401).json({ error: "Unauthorized" });

      // Fire-and-forget the sync — respond immediately so Buildium doesn't timeout
      res.status(200).json({ status: "accepted", message: "Property sync triggered" });
      handlePropertyWebhook(companyId, provider, rawPayload).catch(console.error);
      return;
    }

    // Otherwise handle as a maintenance request webhook
    return handlePmsWebhook(req, res);
  });
  app.use("/api/webhooks/pms", router);
}
