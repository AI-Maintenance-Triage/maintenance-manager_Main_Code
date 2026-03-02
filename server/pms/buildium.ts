/**
 * Buildium PMS Adapter
 * Uses Buildium Open API v1 with Client ID + Client Secret (API key auth).
 * Docs: https://developer.buildium.com/
 *
 * Key facts from official OpenAPI spec:
 * - Response objects use PascalCase field names (Id, Name, Title, etc.)
 * - Pagination uses `offset` + `limit` (NOT pagelimit/pagenumber)
 * - Maintenance requests endpoint: /v1/tasks/residentrequests
 * - Rentals endpoint: /v1/rentals
 * - Date filter param: `lastupdatedfrom` (all lowercase)
 */

import type { PmsAdapter, PmsCredentials, PmsProperty, PmsMaintenanceRequest } from "./types";

const PROD_BASE_URL = "https://api.buildium.com/v1";
const SANDBOX_BASE_URL = "https://apisandbox.buildium.com/v1";

function getBaseUrl(credentials: PmsCredentials): string {
  return credentials.isSandbox ? SANDBOX_BASE_URL : PROD_BASE_URL;
}

async function buildiumFetch(credentials: PmsCredentials, path: string, options: RequestInit = {}) {
  const url = `${getBaseUrl(credentials)}${path}`;
  // Buildium uses custom API key headers (per official docs)
  const res = await fetch(url, {
    ...options,
    headers: {
      "x-buildium-client-id": credentials.clientId ?? "",
      "x-buildium-client-secret": credentials.clientSecret ?? "",
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Buildium API error ${res.status}: ${text}`);
  }
  return res.json();
}

export const buildiumAdapter: PmsAdapter = {
  provider: "buildium",

  async testConnection(credentials) {
    try {
      // Use correct pagination params: offset + limit
      await buildiumFetch(credentials, "/rentals?offset=0&limit=1");
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  },

  async importProperties(credentials) {
    const results: PmsProperty[] = [];
    let offset = 0;
    const limit = 100;

    while (true) {
      // Buildium uses offset-based pagination; response fields are PascalCase
      const data = await buildiumFetch(credentials, `/rentals?offset=${offset}&limit=${limit}`);
      const items: unknown[] = Array.isArray(data) ? data : (data?.items ?? []);
      if (!items.length) break;

      for (const item of items) {
        const r = item as Record<string, unknown>;
        // RentalMessage response: Id, Name, Address (PascalCase)
        const addr = r.Address as Record<string, string> | undefined;
        results.push({
          externalId: String(r.Id ?? r.id),
          name: String(r.Name ?? r.name ?? r.Id ?? r.id),
          address: addr ? `${addr.AddressLine1 ?? addr.addressLine1 ?? ""}`.trim() : "",
          city: addr?.City ?? addr?.city,
          state: addr?.State ?? addr?.state,
          zipCode: addr?.PostalCode ?? addr?.postalCode ?? addr?.ZipCode ?? addr?.zipCode,
          units: typeof r.NumberUnits === "number" ? r.NumberUnits :
                 typeof r.totalUnits === "number" ? r.totalUnits : 1,
        });
      }

      if (items.length < limit) break;
      offset += limit;
    }

    return results;
  },

  async fetchNewRequests(credentials, since) {
    const results: PmsMaintenanceRequest[] = [];
    let offset = 0;
    const limit = 100;
    // Buildium filter param is all-lowercase: lastupdatedfrom
    const sinceParam = since ? `&lastupdatedfrom=${since.toISOString().split("T")[0]}` : "";

    while (true) {
      // Correct endpoint: /v1/tasks/residentrequests (NOT /v1/maintenancerequests)
      const data = await buildiumFetch(
        credentials,
        `/tasks/residentrequests?offset=${offset}&limit=${limit}${sinceParam}`
      );
      const items: unknown[] = Array.isArray(data) ? data : (data?.items ?? []);
      if (!items.length) break;

      for (const item of items) {
        const r = item as Record<string, unknown>;
        // ResidentRequestTaskMessage fields are PascalCase:
        // Id, Title, Description, Property, RequestedByUserEntity, CreatedDateTime, LastUpdatedDateTime
        const property = r.Property as Record<string, unknown> | undefined;
        const requestedBy = r.RequestedByUserEntity as Record<string, unknown> | undefined;
        const unitAgreement = r.UnitAgreement as Record<string, unknown> | undefined;

        // Tenant name from RequestedByUserEntity
        const tenantName = requestedBy
          ? `${requestedBy.FirstName ?? requestedBy.firstName ?? ""} ${requestedBy.LastName ?? requestedBy.lastName ?? ""}`.trim()
          : undefined;
        const tenantEmail = requestedBy
          ? String(requestedBy.Email ?? requestedBy.email ?? "")
          : undefined;

        // Unit number from UnitAgreement
        const unitNumber = unitAgreement
          ? String(unitAgreement.UnitNumber ?? unitAgreement.unitNumber ?? unitAgreement.Name ?? unitAgreement.name ?? "")
          : undefined;

        results.push({
          externalId: String(r.Id ?? r.id),
          title: String(r.Title ?? r.title ?? "Maintenance Request"),
          description: String(r.Description ?? r.description ?? ""),
          unitNumber: unitNumber || undefined,
          tenantName: tenantName || undefined,
          tenantEmail: tenantEmail || undefined,
          propertyExternalId: property ? String(property.Id ?? property.id ?? "") : "",
          priority: mapBuildiumPriority(r.Priority as string | undefined ?? r.priority as string | undefined),
          createdAt: r.CreatedDateTime
            ? new Date(r.CreatedDateTime as string)
            : r.createdDateTime
            ? new Date(r.createdDateTime as string)
            : undefined,
        });
      }

      if (items.length < limit) break;
      offset += limit;
    }

    return results;
  },

  async markComplete(credentials, externalId) {
    try {
      // Update resident request status via PATCH on the task
      await buildiumFetch(credentials, `/tasks/residentrequests/${externalId}`, {
        method: "PUT",
        body: JSON.stringify({ Status: "Completed" }),
      });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  },
};

function mapBuildiumPriority(p?: string): "low" | "medium" | "high" | "emergency" | undefined {
  if (!p) return undefined;
  const lower = p.toLowerCase();
  if (lower === "emergency") return "emergency";
  if (lower === "high") return "high";
  if (lower === "normal" || lower === "medium") return "medium";
  if (lower === "low") return "low";
  return "medium";
}
