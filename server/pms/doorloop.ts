/**
 * DoorLoop PMS Adapter
 *
 * DoorLoop exposes a REST API at https://api.doorloop.com/v1
 * Authentication: Bearer token (API key) in Authorization header
 * Docs: https://api.doorloop.com/docs
 */

import type { PmsAdapter, PmsCredentials, PmsProperty, PmsMaintenanceRequest } from "./types";

const BASE_URL = "https://api.doorloop.com/v1";

function headers(credentials: PmsCredentials) {
  return {
    Authorization: `Bearer ${credentials.apiKey ?? ""}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

async function dlFetch(path: string, credentials: PmsCredentials, options: RequestInit = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: { ...headers(credentials), ...(options.headers ?? {}) },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`DoorLoop API error ${res.status}: ${text}`);
  }
  return res.json();
}

export const doorloopAdapter: PmsAdapter = {
  provider: "doorloop",

  async testConnection(credentials) {
    try {
      // GET /properties?limit=1 to verify the API key
      await dlFetch("/properties?limit=1", credentials);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  },

  async importProperties(credentials) {
    try {
      const properties: PmsProperty[] = [];
      let cursor: string | undefined;

      while (true) {
        const url = cursor
          ? `/properties?limit=100&cursor=${encodeURIComponent(cursor)}`
          : "/properties?limit=100";

        const data = await dlFetch(url, credentials);

        // DoorLoop returns { data: [...], meta: { nextCursor } }
        const items: any[] = data.data ?? data.results ?? (Array.isArray(data) ? data : []);
        if (items.length === 0) break;

        for (const prop of items) {
          // DoorLoop property shape
          const addr = prop.address ?? {};
          const dlPropertyId = prop.id;
          // Fetch individual units for this property from /units?propertyId=...
          let unitNumbers: PmsProperty["unitNumbers"] = [];
          try {
            let unitCursor: string | undefined;
            while (true) {
              const unitUrl = unitCursor
                ? `/units?propertyId=${dlPropertyId}&limit=100&cursor=${encodeURIComponent(unitCursor)}`
                : `/units?propertyId=${dlPropertyId}&limit=100`;
              const unitData = await dlFetch(unitUrl, credentials);
              const unitItems: any[] = unitData.data ?? unitData.results ?? (Array.isArray(unitData) ? unitData : []);
              if (!unitItems.length) break;
              for (const u of unitItems) {
                unitNumbers.push({
                  externalId: `doorloop_unit_${u.id}`,
                  unitNumber: String(u.unitNumber ?? u.name ?? u.displayName ?? u.id),
                  bedrooms: typeof u.bedrooms === "number" ? u.bedrooms : undefined,
                  bathrooms: typeof u.bathrooms === "number" ? u.bathrooms : undefined,
                  sqft: typeof u.squareFeet === "number" ? u.squareFeet : typeof u.sqft === "number" ? u.sqft : undefined,
                });
              }
              unitCursor = unitData.meta?.nextCursor;
              if (!unitCursor || unitItems.length < 100) break;
            }
          } catch { /* non-critical */ }
          properties.push({
            externalId: `doorloop_${dlPropertyId}`,
            name: prop.name ?? prop.displayName ?? addr.street1 ?? "Property",
            address: [addr.street1, addr.street2].filter(Boolean).join(", "),
            city: addr.city ?? "",
            state: addr.state ?? "",
            zipCode: addr.zip ?? addr.postalCode ?? "",
            units: prop.unitCount ?? prop.numberOfUnits ?? 1,
            propertyType: mapDoorLoopPropertyType(prop.type ?? prop.propertyType ?? prop.classification),
            unitNumbers: unitNumbers.length > 0 ? unitNumbers : undefined,
          });
        }

        cursor = data.meta?.nextCursor;
        if (!cursor || items.length < 100) break;
      }

      return properties;
    } catch {
      return [];
    }
  },

  async fetchNewRequests(credentials, since) {
    try {
      const requests: PmsMaintenanceRequest[] = [];
      let cursor: string | undefined;

      const sinceParam = since
        ? `&createdAfter=${encodeURIComponent(since.toISOString())}`
        : "";

      while (true) {
        const cursorParam = cursor ? `&cursor=${encodeURIComponent(cursor)}` : "";
        const data = await dlFetch(
          `/maintenance-requests?limit=100${sinceParam}${cursorParam}`,
          credentials
        );

        const items: any[] = data.data ?? data.results ?? (Array.isArray(data) ? data : []);
        if (items.length === 0) break;

        for (const req of items) {
          // Skip completed/closed requests
          const status = (req.status ?? "").toLowerCase();
          if (status === "completed" || status === "closed" || status === "cancelled") continue;

          const propertyId = req.propertyId ?? req.property?.id;
          if (!propertyId) continue;

          requests.push({
            externalId: `doorloop_${req.id}`,
            title: req.subject ?? req.title ?? "Maintenance Request",
            description: req.description ?? req.notes ?? "",
            unitNumber: req.unitNumber ?? req.unit?.number ?? undefined,
            tenantName:
              req.tenantName ??
              ([req.tenant?.firstName, req.tenant?.lastName].filter(Boolean).join(" ") || undefined),
            tenantPhone: req.tenantPhone ?? req.tenant?.phone ?? undefined,
            tenantEmail: req.tenantEmail ?? req.tenant?.email ?? undefined,
            propertyExternalId: `doorloop_${propertyId}`,
            priority: mapDoorLoopPriority(req.priority ?? ""),
            createdAt: req.createdAt ? new Date(req.createdAt) : undefined,
          });
        }

        cursor = data.meta?.nextCursor;
        if (!cursor || items.length < 100) break;
      }

      return requests;
    } catch {
      return [];
    }
  },

  async markComplete(credentials, externalId) {
    try {
      // externalId format: "doorloop_abc123"
      const requestId = externalId.replace("doorloop_", "");

      // PATCH /maintenance-requests/{id} with status: "completed"
      await dlFetch(`/maintenance-requests/${requestId}`, credentials, {
        method: "PATCH",
        body: JSON.stringify({ status: "completed" }),
      });

      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  },

  async markReopen(credentials, externalId) {
    try {
      const requestId = externalId.replace("doorloop_", "");
      await dlFetch(`/maintenance-requests/${requestId}`, credentials, {
        method: "PATCH",
        body: JSON.stringify({ status: "new" }),
      });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  },
};

function mapDoorLoopPropertyType(t?: string): "single_family" | "multi_family" | "commercial" | "other" | undefined {
  if (!t) return undefined;
  const lower = String(t).toLowerCase();
  if (lower.includes("single") || lower.includes("sfr") || lower.includes("house") || lower.includes("condo") || lower.includes("townhouse")) return "single_family";
  if (lower.includes("multi") || lower.includes("apartment") || lower.includes("duplex") || lower.includes("triplex") || lower.includes("fourplex") || lower.includes("mfr")) return "multi_family";
  if (lower.includes("commercial") || lower.includes("office") || lower.includes("retail") || lower.includes("industrial")) return "commercial";
  return "other";
}

function mapDoorLoopPriority(priority: string): "low" | "medium" | "high" | "emergency" {
  const p = priority.toLowerCase();
  if (p === "emergency" || p === "urgent") return "emergency";
  if (p === "high") return "high";
  if (p === "low") return "low";
  return "medium";
}
