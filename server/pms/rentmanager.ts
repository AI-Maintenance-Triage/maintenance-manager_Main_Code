/**
 * Rent Manager PMS Adapter
 *
 * Rent Manager exposes a REST API at https://api.rentmanager.com
 * Authentication: API key passed as X-RM12Api-ApiKey header
 * Docs: https://api.rentmanager.com/docs
 */

import type { PmsAdapter, PmsCredentials, PmsProperty, PmsMaintenanceRequest } from "./types";

const BASE_URL = "https://api.rentmanager.com";

function headers(credentials: PmsCredentials) {
  return {
    "X-RM12Api-ApiKey": credentials.apiKey ?? "",
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

async function rmFetch(path: string, credentials: PmsCredentials, options: RequestInit = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: { ...headers(credentials), ...(options.headers ?? {}) },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Rent Manager API error ${res.status}: ${text}`);
  }
  return res.json();
}

export const rentManagerAdapter: PmsAdapter = {
  provider: "rentmanager",

  async testConnection(credentials) {
    try {
      // GET /Properties?PageSize=1 to verify credentials
      await rmFetch("/Properties?PageSize=1&EmbedLinks=false", credentials);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  },

  async importProperties(credentials) {
    try {
      // Rent Manager paginates with PageSize and PageNumber
      const properties: PmsProperty[] = [];
      let page = 1;
      const pageSize = 100;

      while (true) {
        const data = await rmFetch(
          `/Properties?PageSize=${pageSize}&PageNumber=${page}&EmbedLinks=false`,
          credentials
        );

        const items: any[] = Array.isArray(data) ? data : data.Items ?? data.Results ?? [];
        if (items.length === 0) break;

        for (const prop of items) {
          // Rent Manager property object shape
          const address = prop.Address1 ?? prop.Address ?? "";
          const city = prop.City ?? "";
          const state = prop.State ?? "";
          const zip = prop.PostalCode ?? prop.ZipCode ?? "";
          const rmPropertyId = prop.PropertyID ?? prop.Id;
          // Fetch individual units for this property from /Units?PropertyID=...
          let unitNumbers: PmsProperty["unitNumbers"] = [];
          try {
            let unitPage = 1;
            while (true) {
              const unitData = await rmFetch(
                `/Units?PageSize=100&PageNumber=${unitPage}&PropertyID=${rmPropertyId}&EmbedLinks=false`,
                credentials
              );
              const unitItems: any[] = Array.isArray(unitData) ? unitData : unitData.Items ?? unitData.Results ?? [];
              if (!unitItems.length) break;
              for (const u of unitItems) {
                unitNumbers.push({
                  externalId: `rentmanager_unit_${u.UnitID ?? u.Id}`,
                  unitNumber: String(u.UnitNumber ?? u.Name ?? u.UnitID ?? u.Id),
                  bedrooms: typeof u.Bedrooms === "number" ? u.Bedrooms : undefined,
                  bathrooms: typeof u.Bathrooms === "number" ? u.Bathrooms : undefined,
                  sqft: typeof u.SquareFeet === "number" ? u.SquareFeet : undefined,
                });
              }
              if (unitItems.length < 100) break;
              unitPage++;
            }
          } catch { /* non-critical */ }
          properties.push({
            externalId: `rentmanager_${rmPropertyId}`,
            name: prop.Name ?? prop.PropertyName ?? address,
            address: [address, prop.Address2].filter(Boolean).join(", "),
            city,
            state,
            zipCode: zip,
            units: prop.UnitCount ?? prop.Units ?? 1,
            propertyType: mapRentManagerPropertyType(prop.PropertyType ?? prop.Type ?? prop.PropertyTypeName),
            unitNumbers: unitNumbers.length > 0 ? unitNumbers : undefined,
          });
        }

        if (items.length < pageSize) break;
        page++;
      }

      return properties;
    } catch {
      return [];
    }
  },

  async fetchNewRequests(credentials, since) {
    try {
      const requests: PmsMaintenanceRequest[] = [];
      let page = 1;
      const pageSize = 100;

      // Rent Manager uses ServiceIssues for maintenance requests
      const sinceParam = since
        ? `&CreatedDateTimeFrom=${since.toISOString()}`
        : "";

      while (true) {
        const data = await rmFetch(
          `/ServiceIssues?PageSize=${pageSize}&PageNumber=${page}&EmbedLinks=false${sinceParam}`,
          credentials
        );

        const items: any[] = Array.isArray(data) ? data : data.Items ?? data.Results ?? [];
        if (items.length === 0) break;

        for (const issue of items) {
          // Skip closed/completed issues
          const status = (issue.Status ?? issue.StatusName ?? "").toLowerCase();
          if (status === "closed" || status === "completed" || status === "cancelled") continue;

          const propertyId = issue.PropertyID ?? issue.Property?.PropertyID ?? issue.PropertyId;
          if (!propertyId) continue;

          const priority = mapRentManagerPriority(issue.Priority ?? issue.PriorityName ?? "");

          requests.push({
            externalId: `rentmanager_${issue.ServiceIssueID ?? issue.Id}`,
            title: issue.Subject ?? issue.Title ?? "Maintenance Request",
            description: issue.Description ?? issue.Notes ?? "",
            unitNumber: issue.UnitNumber ?? issue.Unit?.UnitNumber ?? undefined,
            tenantName: issue.TenantName ?? issue.Tenant?.Name ?? undefined,
            tenantPhone: issue.TenantPhone ?? issue.Tenant?.Phone ?? undefined,
            tenantEmail: issue.TenantEmail ?? issue.Tenant?.Email ?? undefined,
            propertyExternalId: `rentmanager_${propertyId}`,
            priority,
            createdAt: issue.CreatedDateTime ? new Date(issue.CreatedDateTime) : undefined,
          });
        }

        if (items.length < pageSize) break;
        page++;
      }

      return requests;
    } catch {
      return [];
    }
  },

  async markComplete(credentials, externalId) {
    try {
      // externalId format: "rentmanager_12345"
      const issueId = externalId.replace("rentmanager_", "");

      // PATCH /ServiceIssues/{id} to update status to Closed
      await rmFetch(`/ServiceIssues/${issueId}`, credentials, {
        method: "PATCH",
        body: JSON.stringify({ Status: "Closed" }),
      });

      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  },

  async markReopen(credentials, externalId) {
    try {
      const issueId = externalId.replace("rentmanager_", "");
      await rmFetch(`/ServiceIssues/${issueId}`, credentials, {
        method: "PATCH",
        body: JSON.stringify({ Status: "Open" }),
      });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  },
};

function mapRentManagerPropertyType(t?: string): "single_family" | "multi_family" | "commercial" | "other" | undefined {
  if (!t) return undefined;
  const lower = String(t).toLowerCase();
  if (lower.includes("single") || lower.includes("sfr") || lower.includes("house") || lower.includes("condo") || lower.includes("townhouse")) return "single_family";
  if (lower.includes("multi") || lower.includes("apartment") || lower.includes("duplex") || lower.includes("triplex") || lower.includes("fourplex") || lower.includes("mfr")) return "multi_family";
  if (lower.includes("commercial") || lower.includes("office") || lower.includes("retail") || lower.includes("industrial")) return "commercial";
  return "other";
}

function mapRentManagerPriority(priority: string): "low" | "medium" | "high" | "emergency" {
  const p = priority.toLowerCase();
  if (p.includes("emergency") || p.includes("urgent") || p === "1") return "emergency";
  if (p.includes("high") || p === "2") return "high";
  if (p.includes("low") || p === "4" || p === "5") return "low";
  return "medium";
}
