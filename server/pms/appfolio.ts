/**
 * AppFolio PMS Adapter
 * Uses AppFolio Property Manager API v1 with Client ID + Client Secret (Basic Auth).
 * Docs: https://developer.appfolio.com/
 */

import type { PmsAdapter, PmsCredentials, PmsProperty, PmsMaintenanceRequest } from "./types";

async function appfolioFetch(credentials: PmsCredentials, path: string, options: RequestInit = {}) {
  const baseUrl = credentials.baseUrl ?? "https://yourcompany.appfolio.com";
  const url = `${baseUrl}/api/v1${path}`;
  const authHeader = Buffer.from(`${credentials.clientId ?? ""}:${credentials.clientSecret ?? ""}`).toString("base64");

  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Basic ${authHeader}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`AppFolio API error ${res.status}: ${text}`);
  }
  return res.json();
}

export const appfolioAdapter: PmsAdapter = {
  provider: "appfolio",

  async testConnection(credentials) {
    try {
      await appfolioFetch(credentials, "/properties?per_page=1");
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  },

  async importProperties(credentials) {
    const results: PmsProperty[] = [];
    let page = 1;
    const perPage = 100;

    while (true) {
      const data = await appfolioFetch(credentials, `/properties?per_page=${perPage}&page=${page}`);
      const items: unknown[] = data?.results ?? [];
      if (!items.length) break;

      for (const item of items) {
        const r = item as Record<string, unknown>;
        const addr = r.address as Record<string, string> | undefined;
        results.push({
          externalId: String(r.id ?? r.property_id),
          name: String(r.name ?? r.property_name ?? r.id),
          address: addr ? String(addr.street ?? "") : String(r.address ?? ""),
          city: addr?.city,
          state: addr?.state,
          zipCode: addr?.zip,
          units: typeof r.unit_count === "number" ? r.unit_count : 1,
        });
      }

      if (items.length < perPage) break;
      page++;
    }

    return results;
  },

  async fetchNewRequests(credentials, since) {
    const results: PmsMaintenanceRequest[] = [];
    let page = 1;
    const perPage = 100;
    const sinceParam = since ? `&created_from=${since.toISOString()}` : "";

    while (true) {
      const data = await appfolioFetch(
        credentials,
        `/maintenance_requests?per_page=${perPage}&page=${page}${sinceParam}`
      );
      const items: unknown[] = data?.results ?? [];
      if (!items.length) break;

      for (const item of items) {
        const r = item as Record<string, unknown>;
        results.push({
          externalId: String(r.id),
          title: String(r.subject ?? r.title ?? "Maintenance Request"),
          description: String(r.description ?? r.details ?? ""),
          unitNumber: r.unit ? String((r.unit as Record<string, unknown>).name ?? "") : undefined,
          tenantName: r.tenant_name ? String(r.tenant_name) : undefined,
          tenantEmail: r.tenant_email ? String(r.tenant_email) : undefined,
          propertyExternalId: r.property_id ? String(r.property_id) : "",
          priority: mapAppFolioPriority(r.priority as string | undefined),
          createdAt: r.created_at ? new Date(r.created_at as string) : undefined,
        });
      }

      if (items.length < perPage) break;
      page++;
    }

    return results;
  },

  async markComplete(credentials, externalId) {
    try {
      await appfolioFetch(credentials, `/maintenance_requests/${externalId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "completed" }),
      });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  },
};

function mapAppFolioPriority(p?: string): "low" | "medium" | "high" | "emergency" | undefined {
  if (!p) return undefined;
  const lower = p.toLowerCase();
  if (lower === "emergency" || lower === "urgent") return "emergency";
  if (lower === "high") return "high";
  if (lower === "normal" || lower === "medium") return "medium";
  if (lower === "low") return "low";
  return "medium";
}
