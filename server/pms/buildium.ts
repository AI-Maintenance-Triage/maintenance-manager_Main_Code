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
        // RentalMessage response: Id, Name, Address, PropertyType (PascalCase)
        const addr = r.Address as Record<string, string> | undefined;
        // Map Buildium PropertyType to our enum
        // Buildium types: "ResidentialProperty", "CommercialProperty", "AssociationProperty"
        // NumberUnits > 1 => multi_family; single-unit residential => single_family
        const numUnits = typeof r.NumberUnits === "number" ? r.NumberUnits :
                         typeof r.totalUnits === "number" ? r.totalUnits : 1;
        const bType = String(r.PropertyType ?? r.propertyType ?? "").toLowerCase();
        let propertyType: PmsProperty["propertyType"];
        if (bType.includes("commercial")) {
          propertyType = "commercial";
        } else if (bType.includes("association")) {
          propertyType = "other";
        } else if (numUnits > 1) {
          propertyType = "multi_family";
        } else {
          propertyType = "single_family";
        }
        const propertyId = String(r.Id ?? r.id);
        // Fetch individual units for this property from /rentals/{id}/units
        let unitNumbers: PmsProperty["unitNumbers"] = [];
        try {
          let unitOffset = 0;
          while (true) {
            const unitData = await buildiumFetch(
              credentials,
              `/rentals/${propertyId}/units?offset=${unitOffset}&limit=100`
            );
            const unitItems: unknown[] = Array.isArray(unitData) ? unitData : (unitData?.items ?? []);
            if (!unitItems.length) break;
            for (const u of unitItems) {
              const unit = u as Record<string, unknown>;
              // Buildium RentalUnitMessage uses snake_case: unit_number, unit_bedrooms, unit_bathrooms, unit_size
              // Also try PascalCase as fallback for older API versions
              const rawUnitNumber = unit.unit_number ?? unit.UnitNumber ?? unit.unitNumber;
              const rawId = unit.id ?? unit.Id;
              if (!rawUnitNumber && !rawId) continue; // skip malformed entries
              unitNumbers.push({
                externalId: String(rawId ?? ""),
                unitNumber: String(rawUnitNumber ?? rawId ?? ""),
                bedrooms: typeof unit.unit_bedrooms === "number" ? unit.unit_bedrooms
                  : typeof unit.Bedrooms === "number" ? unit.Bedrooms
                  : typeof unit.bedrooms === "number" ? unit.bedrooms : undefined,
                bathrooms: typeof unit.unit_bathrooms === "number" ? unit.unit_bathrooms
                  : typeof unit.Bathrooms === "number" ? unit.Bathrooms
                  : typeof unit.bathrooms === "number" ? unit.bathrooms : undefined,
                sqft: typeof unit.unit_size === "number" ? unit.unit_size
                  : typeof unit.SquareFeet === "number" ? unit.SquareFeet
                  : typeof unit.squareFeet === "number" ? unit.squareFeet : undefined,
              });
            }
            if (unitItems.length < 100) break;
            unitOffset += 100;
          }
        } catch { /* non-critical: units may not be available */ }
        results.push({
          externalId: propertyId,
          name: String(r.Name ?? r.name ?? r.Id ?? r.id),
          address: addr ? `${addr.AddressLine1 ?? addr.addressLine1 ?? ""}`.trim() : "",
          city: addr?.City ?? addr?.city,
          state: addr?.State ?? addr?.state,
          zipCode: addr?.PostalCode ?? addr?.postalCode ?? addr?.ZipCode ?? addr?.zipCode,
          units: numUnits,
          propertyType,
          unitNumbers: unitNumbers.length > 0 ? unitNumbers : undefined,
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
        // ResidentRequestTaskMessage fields: API returns snake_case (property, requested_by_user_entity, etc.)
        // Also try PascalCase as fallback for older API versions
        const property = (r.property ?? r.Property) as Record<string, unknown> | undefined;
        const requestedBy = (r.RequestedByUserEntity ?? r.requested_by_user_entity) as Record<string, unknown> | undefined;
        const unitAgreement = r.unit_agreement as Record<string, unknown> | undefined
          ?? r.UnitAgreement as Record<string, unknown> | undefined;

        // Tenant name from requested_by_user_entity (snake_case in API response)
        const requestedBySnake = r.requested_by_user_entity as Record<string, unknown> | undefined ?? requestedBy;
        const tenantName = requestedBySnake
          ? `${requestedBySnake.first_name ?? requestedBySnake.FirstName ?? requestedBySnake.firstName ?? ""} ${requestedBySnake.last_name ?? requestedBySnake.LastName ?? requestedBySnake.lastName ?? ""}`.trim()
          : undefined;
        const tenantEmail = requestedBySnake
          ? String(requestedBySnake.email ?? requestedBySnake.Email ?? "")
          : undefined;

        // Unit number: Buildium provides unit_id (integer) on the request.
        // We resolve the unit number by fetching the unit directly using unit_id.
        const rawUnitId = r.unit_id ?? r.UnitId ?? r.unitId;
        let unitNumber: string | undefined;
        if (rawUnitId) {
          try {
            const unitData = await buildiumFetch(credentials, `/rentals/units/${rawUnitId}`);
            const u = unitData as Record<string, unknown>;
            unitNumber = String(u.unit_number ?? u.UnitNumber ?? u.unitNumber ?? rawUnitId);
          } catch {
            // fallback: just use the ID as a label
            unitNumber = String(rawUnitId);
          }
        } else if (unitAgreement) {
          // Older API: try to extract from unit_agreement object
          unitNumber = String(unitAgreement.unit_number ?? unitAgreement.UnitNumber ?? unitAgreement.unitNumber ?? unitAgreement.Name ?? unitAgreement.name ?? "") || undefined;
        }

        results.push({
          externalId: String(r.id ?? r.Id),
          title: String(r.title ?? r.Title ?? "Maintenance Request"),
          description: String(r.description ?? r.Description ?? ""),
          unitNumber: unitNumber || undefined,
          tenantName: tenantName || undefined,
          tenantEmail: tenantEmail || undefined,
          propertyExternalId: property ? String(property.id ?? property.Id ?? "") : "",
          priority: mapBuildiumPriority((r.priority ?? r.Priority) as string | undefined),
          createdAt: r.created_date_time
            ? new Date(r.created_date_time as string)
            : r.CreatedDateTime
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
