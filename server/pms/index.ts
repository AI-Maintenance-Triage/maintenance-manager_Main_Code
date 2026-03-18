/**
 * PMS Adapter Registry + Sync Engine
 * Central entry point for all PMS integration operations.
 */

import { buildiumAdapter } from "./buildium";
import { appfolioAdapter } from "./appfolio";
import { rentManagerAdapter } from "./rentmanager";
import { doorloopAdapter } from "./doorloop";
import { genericAdapter } from "./generic";
import type { PmsAdapter, PmsCredentials } from "./types";

// ─── Registry ─────────────────────────────────────────────────────────────────

const ADAPTERS: Record<string, PmsAdapter> = {
  buildium: buildiumAdapter,
  appfolio: appfolioAdapter,
  rentmanager: rentManagerAdapter,
  doorloop: doorloopAdapter,
  // Webhook-only fallback for providers without a REST API adapter
  yardi: { ...genericAdapter, provider: "yardi" },
  resman: { ...genericAdapter, provider: "resman" },
  other: { ...genericAdapter, provider: "other" },
};

export function getAdapter(provider: string): PmsAdapter {
  return ADAPTERS[provider.toLowerCase()] ?? { ...genericAdapter, provider };
}

export const SUPPORTED_PROVIDERS = [
  {
    id: "buildium",
    name: "Buildium",
    authType: "api_key",
    fields: [
      { key: "clientId", label: "Client ID", type: "text", required: true },
      { key: "clientSecret", label: "Client Secret", type: "password", required: true },
      { key: "isSandbox", label: "Use Sandbox environment (for testing)", type: "checkbox", required: false },
    ],
    supportsPropertyImport: true,
    supportsRequestSync: true,
    supportsWriteback: true,
  },
  {
    id: "appfolio",
    name: "AppFolio",
    authType: "api_key",
    fields: [
      { key: "baseUrl", label: "AppFolio URL (e.g. https://yourcompany.appfolio.com)", type: "text", required: true },
      { key: "clientId", label: "Client ID", type: "text", required: true },
      { key: "clientSecret", label: "Client Secret", type: "password", required: true },
    ],
    supportsPropertyImport: true,
    supportsRequestSync: true,
    supportsWriteback: true,
  },
  {
    id: "rentmanager",
    name: "Rent Manager",
    authType: "api_key",
    fields: [
      { key: "apiKey", label: "API Key", type: "password", required: true },
    ],
    supportsPropertyImport: true,
    supportsRequestSync: true,
    supportsWriteback: true,
  },
  {
    id: "yardi",
    name: "Yardi",
    authType: "webhook_only",
    fields: [],
    supportsPropertyImport: false,
    supportsRequestSync: false,
    supportsWriteback: false,
    webhookNote: "Yardi sends maintenance requests via webhook. Configure the webhook URL in your Yardi portal.",
  },
  {
    id: "resman",
    name: "ResMan",
    authType: "webhook_only",
    fields: [],
    supportsPropertyImport: false,
    supportsRequestSync: false,
    supportsWriteback: false,
    webhookNote: "ResMan sends maintenance requests via webhook. Configure the webhook URL in your ResMan portal.",
  },
  {
    id: "doorloop",
    name: "DoorLoop",
    authType: "api_key",
    fields: [
      { key: "apiKey", label: "API Key", type: "password", required: true },
    ],
    supportsPropertyImport: true,
    supportsRequestSync: true,
    supportsWriteback: true,
  },
  {
    id: "other",
    name: "Other / Custom",
    authType: "webhook_only",
    fields: [],
    supportsPropertyImport: false,
    supportsRequestSync: false,
    supportsWriteback: false,
    webhookNote: "Use the webhook URL below to receive maintenance requests from any PMS that supports outbound webhooks.",
  },
] as const;

export type SupportedProvider = typeof SUPPORTED_PROVIDERS[number];

// ─── Credential helpers ────────────────────────────────────────────────────────

export function encodeCredentials(credentials: PmsCredentials): string {
  // In production, encrypt this with a server-side key. For now, base64 encode.
  return Buffer.from(JSON.stringify(credentials)).toString("base64");
}

export function decodeCredentials(encoded: string): PmsCredentials {
  try {
    return JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
  } catch {
    return {};
  }
}

// ─── Sync engine ──────────────────────────────────────────────────────────────

import {
  listPmsIntegrations,
  updatePmsIntegration,
  createProperty,
  updateProperty,
  listProperties,
  upsertMaintenanceRequestFromPms,
  createPmsWebhookEvent,
  geocodeAddress,
  updatePropertyCoords,
  upsertPropertyUnit,
} from "../db";

/**
 * Run a full sync for a single PMS integration.
 * 1. Import properties (upsert by externalId)
 * 2. Fetch new maintenance requests since lastSyncAt
 * 3. Create jobs for each new request and post to job board
 */
export async function runPmsSync(integrationId: number, companyId: number): Promise<{ imported: number; jobs: number; error?: string }> {
  const integrations = await listPmsIntegrations(companyId);
  const integration = integrations.find(i => i.id === integrationId);
  if (!integration) return { imported: 0, jobs: 0, error: "Integration not found" };

  const credentials = decodeCredentials(integration.credentialsJson ?? "");
  const adapter = getAdapter(integration.provider);

  try {
    // 1. Import properties
    const pmsProperties = await adapter.importProperties(credentials);
    const existingProperties = await listProperties(companyId);
    const existingExternalIds = new Set(existingProperties.map(p => p.externalId).filter(Boolean));

    let imported = 0;
    for (const prop of pmsProperties) {
      if (!existingExternalIds.has(prop.externalId)) {
        // Create new property
        const newId = await createProperty({
          companyId,
          name: prop.name,
          address: prop.address,
          city: prop.city,
          state: prop.state,
          zipCode: prop.zipCode,
          units: prop.units ?? 1,
          externalId: prop.externalId,
          propertyType: prop.propertyType ?? "single_family",
        });
        // Auto-geocode: fetch lat/lng from address
        const fullAddress = [prop.address, prop.city, prop.state, prop.zipCode].filter(Boolean).join(", ");
        if (fullAddress) {
          const coords = await geocodeAddress(fullAddress);
          if (coords) await updatePropertyCoords(newId, coords.lat, coords.lng);
        }
        // Upsert unit numbers for this property
        if (prop.unitNumbers && prop.unitNumbers.length > 0) {
          for (const unit of prop.unitNumbers) {
            await upsertPropertyUnit({
              propertyId: newId,
              companyId,
              unitNumber: unit.unitNumber,
              bedrooms: unit.bedrooms ?? null,
              bathrooms: unit.bathrooms != null ? String(unit.bathrooms) : null,
              sqft: unit.sqft ?? null,
              externalId: unit.externalId,
            });
          }
        }
        imported++;
      } else {
        // Upsert: update propertyType and units on existing property
        const existing = existingProperties.find(p => p.externalId === prop.externalId);
        if (existing) {
          await updateProperty(existing.id, companyId, {
            units: prop.units ?? existing.units ?? 1,
            propertyType: prop.propertyType ?? existing.propertyType ?? "single_family",
          });
          // Geocode if missing coords
          if (!existing.latitude || !existing.longitude) {
            const fullAddress = [prop.address, prop.city, prop.state, prop.zipCode].filter(Boolean).join(", ");
            if (fullAddress) {
              const coords = await geocodeAddress(fullAddress);
              if (coords) await updatePropertyCoords(existing.id, coords.lat, coords.lng);
            }
          }
          // Upsert unit numbers for this property
          if (prop.unitNumbers && prop.unitNumbers.length > 0) {
            for (const unit of prop.unitNumbers) {
              await upsertPropertyUnit({
                propertyId: existing.id,
                companyId,
                unitNumber: unit.unitNumber,
                bedrooms: unit.bedrooms ?? null,
                bathrooms: unit.bathrooms != null ? String(unit.bathrooms) : null,
                sqft: unit.sqft ?? null,
                externalId: unit.externalId,
              });
            }
          }
        }
      }
    }

    // 2. Fetch new maintenance requests — pass lastSyncAt so the adapter only returns
    //    requests created AFTER the last successful sync (incremental / webhook-backup mode).
    //    Webhooks are the primary intake path; this poll is a safety net for missed events.
    const since = integration.lastSyncAt ? new Date(integration.lastSyncAt) : undefined;
    const requests = await adapter.fetchNewRequests(credentials, since);

    // 3. Create jobs for each new request (idempotent — skips already-imported externalIds)
    let jobs = 0;
    const allProperties = await listProperties(companyId);
    const propByExternalId = new Map(allProperties.filter(p => p.externalId).map(p => [p.externalId!, p]));

    for (const req of requests) {
      const property = propByExternalId.get(req.propertyExternalId);
      if (!property) continue;

      try {
        const newJobId = await upsertMaintenanceRequestFromPms({
          companyId,
          propertyId: property.id,
          title: req.title,
          description: req.description,
          unitNumber: req.unitNumber,
          tenantName: req.tenantName,
          tenantPhone: req.tenantPhone,
          tenantEmail: req.tenantEmail,
          aiPriority: req.priority ?? "medium",
          status: "open",
          externalId: req.externalId,
          source: integration.provider as "buildium" | "appfolio" | "rentmanager" | "yardi" | "doorloop",
        });

        // null means already imported — skip AI classification and count
        if (newJobId === null) continue;
        jobs++;

        // Run AI skill tier classification for the new job (same logic as jobs.create)
        try {
          const { companyHasPlanFeature, getSkillTiers, updateMaintenanceRequest } = await import("../db");
          const { classifyMaintenanceRequest } = await import("../ai-classify");
          const aiEnabled = await companyHasPlanFeature(companyId, "aiJobClassification");
          const tiers = await getSkillTiers(companyId);
          if (aiEnabled && tiers.length > 0) {
            const classification = await classifyMaintenanceRequest(req.title, req.description, tiers);
            const matchedTier = tiers.find((t: { name: string }) => t.name.toLowerCase() === classification.skillTierName.toLowerCase());
            let aiHourlyRate: string | null = (matchedTier as any)?.hourlyRate ?? null;
            if (classification.priority === "emergency" && (matchedTier as any)?.emergencyMultiplier) {
              const base = parseFloat((matchedTier as any).hourlyRate);
              const mult = parseFloat((matchedTier as any).emergencyMultiplier);
              if (!isNaN(base) && !isNaN(mult)) aiHourlyRate = (base * mult).toFixed(2);
            }
            await updateMaintenanceRequest(newJobId, {
              aiPriority: classification.priority,
              aiSkillTier: classification.skillTierName,
              aiSkillTierId: (matchedTier as any)?.id ?? null,
              aiReasoning: classification.reasoning,
              aiClassifiedAt: new Date(),
              skillTierId: (matchedTier as any)?.id ?? null,
              hourlyRate: aiHourlyRate,
              isEmergency: classification.priority === "emergency",
            });
          }
        } catch (classifyErr) {
          console.error('[PMS Sync] AI classification failed for job', newJobId, classifyErr);
          // Non-critical — job still created
        }
      } catch (syncErr) {
        console.error('[PMS Sync] Failed to import request', req.externalId, syncErr instanceof Error ? syncErr.message : String(syncErr));
      }
    }

    // Update lastSyncAt
    await updatePmsIntegration(integrationId, companyId, {
      lastSyncAt: new Date(),
      status: "connected",
      lastErrorMessage: null,
    });

    return { imported, jobs };
  } catch (e) {
    const errorMessage = (e as Error).message;
    await updatePmsIntegration(integrationId, companyId, {
      status: "error",
      lastErrorMessage: errorMessage,
    });
    return { imported: 0, jobs: 0, error: errorMessage };
  }
}

/**
 * Run sync for all active integrations for a company.
 */
export async function runAllPmsSyncs(companyId: number) {
  const integrations = await listPmsIntegrations(companyId);
  const results = [];
  for (const integration of integrations.filter(i => i.status === "connected")) {
    const result = await runPmsSync(integration.id, companyId);
    results.push({ integrationId: integration.id, provider: integration.provider, ...result });
  }
  return results;
}

/**
 * Notify the PMS that a job has been completed.
 * Called from the job completion flow.
 */
export async function notifyPmsJobComplete(
  companyId: number,
  provider: string,
  externalId: string
): Promise<{ ok: boolean; error?: string }> {
  const integration = await import("../db").then(db => db.getPmsIntegrationByProvider(companyId, provider));
  if (!integration) return { ok: false, error: "Integration not found" };

  const credentials = decodeCredentials(integration.credentialsJson ?? "");
  const adapter = getAdapter(provider);
  return adapter.markComplete(credentials, externalId);
}

export async function notifyPmsJobReopen(
  companyId: number,
  provider: string,
  externalId: string
): Promise<{ ok: boolean; error?: string }> {
  const integration = await import("../db").then(db => db.getPmsIntegrationByProvider(companyId, provider));
  if (!integration) return { ok: false, error: "Integration not found" };

  const credentials = decodeCredentials(integration.credentialsJson ?? "");
  const adapter = getAdapter(provider);
  return adapter.markReopen(credentials, externalId);
}

export type { PmsAdapter, PmsCredentials };
