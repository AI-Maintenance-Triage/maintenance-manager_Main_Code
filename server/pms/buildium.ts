/**
 * Buildium PMS Adapter
 * Uses Buildium Open API v1 with Client ID + Client Secret (API key auth).
 * Docs: https://developer.buildium.com/
 */

import type { PmsAdapter, PmsCredentials, PmsProperty, PmsMaintenanceRequest } from "./types";

const BASE_URL = "https://api.buildium.com/v1";

async function buildiumFetch(credentials: PmsCredentials, path: string, options: RequestInit = {}) {
  const url = `${BASE_URL}${path}`;
  // Buildium uses HTTP Basic Auth: Authorization: Basic base64(clientId:clientSecret)
  const basicToken = Buffer.from(`${credentials.clientId ?? ""}:${credentials.clientSecret ?? ""}`).toString("base64");
  const res = await fetch(url, {
    ...options,
    headers: {
      "Authorization": `Basic ${basicToken}`,
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
      await buildiumFetch(credentials, "/rentals?pagelimit=1");
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  },

  async importProperties(credentials) {
    const results: PmsProperty[] = [];
    let pageNumber = 1;
    const pageLimit = 100;

    while (true) {
      const data = await buildiumFetch(credentials, `/rentals?pagelimit=${pageLimit}&pagenumber=${pageNumber}`);
      const items: unknown[] = Array.isArray(data) ? data : (data?.items ?? []);
      if (!items.length) break;

      for (const item of items) {
        const r = item as Record<string, unknown>;
        const addr = r.address as Record<string, string> | undefined;
        results.push({
          externalId: String(r.id),
          name: String(r.name ?? r.id),
          address: addr ? `${addr.addressLine1 ?? ""}`.trim() : "",
          city: addr?.city,
          state: addr?.state,
          zipCode: addr?.postalCode,
          units: typeof r.totalUnits === "number" ? r.totalUnits : 1,
        });
      }

      if (items.length < pageLimit) break;
      pageNumber++;
    }

    return results;
  },

  async fetchNewRequests(credentials, since) {
    const results: PmsMaintenanceRequest[] = [];
    let pageNumber = 1;
    const pageLimit = 100;
    const sinceParam = since ? `&lastupdatedfrom=${since.toISOString().split("T")[0]}` : "";

    while (true) {
      const data = await buildiumFetch(
        credentials,
        `/maintenancerequests?pagelimit=${pageLimit}&pagenumber=${pageNumber}${sinceParam}`
      );
      const items: unknown[] = Array.isArray(data) ? data : (data?.items ?? []);
      if (!items.length) break;

      for (const item of items) {
        const r = item as Record<string, unknown>;
        const unit = r.unit as Record<string, unknown> | undefined;
        const tenant = r.requestedByUser as Record<string, unknown> | undefined;
        const property = r.rental as Record<string, unknown> | undefined;

        results.push({
          externalId: String(r.id),
          title: String(r.subject ?? r.title ?? "Maintenance Request"),
          description: String(r.message ?? r.description ?? ""),
          unitNumber: unit ? String(unit.unitNumber ?? unit.name ?? "") : undefined,
          tenantName: tenant ? `${tenant.firstName ?? ""} ${tenant.lastName ?? ""}`.trim() : undefined,
          tenantEmail: tenant ? String(tenant.email ?? "") : undefined,
          propertyExternalId: property ? String(property.id) : "",
          priority: mapBuildiumPriority(r.priority as string | undefined),
          createdAt: r.createdDateTime ? new Date(r.createdDateTime as string) : undefined,
        });
      }

      if (items.length < pageLimit) break;
      pageNumber++;
    }

    return results;
  },

  async markComplete(credentials, externalId) {
    try {
      await buildiumFetch(credentials, `/maintenancerequests/${externalId}`, {
        method: "PUT",
        body: JSON.stringify({ status: "Completed" }),
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
