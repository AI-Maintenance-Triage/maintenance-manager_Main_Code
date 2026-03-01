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
  listProperties,
  createMaintenanceRequest,
  createPmsWebhookEvent,
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
        await createProperty({
          companyId,
          name: prop.name,
          address: prop.address,
          city: prop.city,
          state: prop.state,
          zipCode: prop.zipCode,
          units: prop.units ?? 1,
          externalId: prop.externalId,
        });
        imported++;
      }
    }

    // 2. Fetch new maintenance requests
    const since = integration.lastSyncAt ?? undefined;
    const requests = await adapter.fetchNewRequests(credentials, since);

    // 3. Create jobs for each new request
    let jobs = 0;
    const allProperties = await listProperties(companyId);
    const propByExternalId = new Map(allProperties.filter(p => p.externalId).map(p => [p.externalId!, p]));

    for (const req of requests) {
      const property = propByExternalId.get(req.propertyExternalId);
      if (!property) continue;

      // Check for duplicate by externalId
      // (createMaintenanceRequest handles the duplicate check via externalId unique constraint)
      try {
        await createMaintenanceRequest({
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
        jobs++;
      } catch {
        // Likely a duplicate — skip silently
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

export type { PmsAdapter, PmsCredentials };
