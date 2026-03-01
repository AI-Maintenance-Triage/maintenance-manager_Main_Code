/**
 * PMS Webhook Receiver
 *
 * Accepts inbound maintenance request payloads from property management
 * software (Buildium, AppFolio, Rent Manager, Yardi, DoorLoop, RealPage,
 * Propertyware) and auto-creates jobs in the platform.
 *
 * Authentication: Bearer token matching the company's integration connector
 * apiKey for the given provider.
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

import { Request, Response, Router } from "express";
import * as db from "./db";
import { pmsWebhookEvents, integrationConnectors } from "../drizzle/schema";
import { getDb } from "./db";
import { eq, and } from "drizzle-orm";
import { invokeLLM } from "./_core/llm";
import { notifyOwner } from "./_core/notification";

// Supported providers — must match the schema enum
const SUPPORTED_PROVIDERS = [
  "buildium", "appfolio", "rentmanager", "yardi", "doorloop", "realpage", "propertyware",
] as const;
type Provider = typeof SUPPORTED_PROVIDERS[number];

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
        unitNumber: String(mr.unit_name ?? ""),
        tenantName: String(mr.tenant_name ?? ""),
        tenantEmail: String(mr.tenant_email ?? ""),
        tenantPhone: String(mr.tenant_phone ?? ""),
        priority: mapPriority(String(mr.priority ?? raw.priority ?? "")),
        propertyRef: String(mr.property_name ?? mr.property_address ?? ""),
        photoUrls: Array.isArray(raw.photo_urls) ? raw.photo_urls as string[] : [],
      };
    }
    case "yardi": {
      return {
        externalId: String(raw.ServiceRequestId ?? raw.id ?? ""),
        title: String(raw.Category ?? raw.title ?? "Maintenance Request"),
        description: String(raw.Description ?? raw.description ?? ""),
        unitNumber: String(raw.Unit ?? ""),
        tenantName: String(raw.TenantName ?? ""),
        tenantEmail: String(raw.TenantEmail ?? ""),
        tenantPhone: String(raw.TenantPhone ?? ""),
        priority: mapPriority(String(raw.Priority ?? raw.priority ?? "")),
        propertyRef: String(raw.PropertyCode ?? raw.PropertyName ?? ""),
        photoUrls: [],
      };
    }
    case "doorloop": {
      const wr = (raw.work_request ?? raw) as Record<string, unknown>;
      return {
        externalId: String(wr.id ?? raw.id ?? ""),
        title: String(wr.title ?? raw.title ?? "Maintenance Request"),
        description: String(wr.description ?? raw.description ?? ""),
        unitNumber: String(wr.unit_number ?? ""),
        tenantName: String(wr.tenant_name ?? ""),
        tenantEmail: String(wr.tenant_email ?? ""),
        tenantPhone: String(wr.tenant_phone ?? ""),
        priority: mapPriority(String(wr.priority ?? raw.priority ?? "")),
        propertyRef: String(wr.property_name ?? ""),
        photoUrls: Array.isArray(wr.attachments) ? (wr.attachments as string[]) : [],
      };
    }
    default:
      // Generic / Rent Manager / RealPage / Propertyware — use field names as-is
      return {
        externalId: String(raw.externalId ?? raw.id ?? raw.workOrderId ?? ""),
        title: String(raw.title ?? raw.subject ?? raw.summary ?? "Maintenance Request"),
        description: String(raw.description ?? raw.notes ?? raw.details ?? ""),
        unitNumber: String(raw.unitNumber ?? raw.unit ?? ""),
        tenantName: String(raw.tenantName ?? raw.tenant_name ?? ""),
        tenantEmail: String(raw.tenantEmail ?? raw.tenant_email ?? ""),
        tenantPhone: String(raw.tenantPhone ?? raw.tenant_phone ?? ""),
        priority: mapPriority(String(raw.priority ?? raw.Priority ?? "")),
        propertyRef: String(raw.propertyRef ?? raw.property ?? raw.propertyName ?? ""),
        propertyId: typeof raw.propertyId === "number" ? raw.propertyId : undefined,
        photoUrls: Array.isArray(raw.photoUrls) ? raw.photoUrls as string[] : [],
      };
  }
}

function mapPriority(raw: string): "low" | "medium" | "high" | "emergency" {
  const v = raw.toLowerCase();
  if (v.includes("emergency") || v.includes("urgent") || v === "4") return "emergency";
  if (v.includes("high") || v === "3") return "high";
  if (v.includes("medium") || v.includes("normal") || v === "2") return "medium";
  return "low";
}

// ─── AI classification helper ─────────────────────────────────────────────
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

  // Authenticate via Bearer token matching integrationConnectors.apiKey
  const authHeader = req.headers.authorization ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;
  if (!token) {
    return res.status(401).json({ error: "Missing Authorization header" });
  }

  const database = await getDb();
  if (!database) return res.status(503).json({ error: "Database unavailable" });

  // Find the connector matching this provider + apiKey
  const [connector] = await database
    .select()
    .from(integrationConnectors)
    .where(and(eq(integrationConnectors.provider, provider), eq(integrationConnectors.apiKey, token), eq(integrationConnectors.isActive, true)))
    .limit(1);

  if (!connector) {
    return res.status(401).json({ error: "Invalid API key or integration not active" });
  }

  const companyId = connector.companyId;
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
      const existing = await database
        .select({ id: pmsWebhookEvents.id })
        .from(pmsWebhookEvents)
        .where(
          and(
            eq(pmsWebhookEvents.companyId, companyId),
            eq(pmsWebhookEvents.provider, provider),
            eq(pmsWebhookEvents.status, "processed")
          )
        )
        .limit(1);
      // Check via rawPayload externalId match
      // (simple approach — check if any processed event has same externalId in rawPayload)
      const dupCheck = await database
        .select({ id: pmsWebhookEvents.id })
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

// ─── Route registration ───────────────────────────────────────────────────
export function registerPmsWebhookRoute(app: { use: (path: string, router: Router) => void }) {
  const router = Router();
  router.post("/:provider", handlePmsWebhook);
  app.use("/api/webhooks/pms", router);
}
