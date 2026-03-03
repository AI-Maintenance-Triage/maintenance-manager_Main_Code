/**
 * Buildium PMS Adapter
 * Uses Buildium Open API v1 with Client ID + Client Secret (API key auth).
 * Docs: https://developer.buildium.com/
 *
 * All response objects use snake_case field names (confirmed from official SDK):
 * - RentalMessage: id, name, number_units, rental_type, rental_sub_type, address
 * - RentalUnitMessage: id, property_id, unit_number, unit_bedrooms, unit_bathrooms, unit_size
 * - ResidentRequestTaskMessage: id, title, description, unit_id, property, requested_by_user_entity, created_date_time, priority
 * - ListingPropertyMessageAddress: address_line1, city, state, postal_code, country
 */

import type { PmsAdapter, PmsCredentials, PmsProperty, PmsMaintenanceRequest } from "./types";

const PROD_BASE_URL = "https://api.buildium.com/v1";
const SANDBOX_BASE_URL = "https://apisandbox.buildium.com/v1";

function getBaseUrl(credentials: PmsCredentials): string {
  return credentials.isSandbox ? SANDBOX_BASE_URL : PROD_BASE_URL;
}

async function buildiumFetch(credentials: PmsCredentials, path: string, options: RequestInit = {}) {
  const url = `${getBaseUrl(credentials)}${path}`;
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
      // RentalMessage fields (all snake_case): id, name, number_units, rental_type, rental_sub_type, address
      const data = await buildiumFetch(credentials, `/rentals?offset=${offset}&limit=${limit}`);
      const items: unknown[] = Array.isArray(data) ? data : (data?.items ?? []);
      if (!items.length) break;

      for (const item of items) {
        const r = item as Record<string, unknown>;

        // id (integer)
        const propertyId = String(r.id);

        // number_units (integer)
        const numUnits = typeof r.number_units === "number" ? r.number_units : 1;

        // rental_type enum: "None" | "Residential" | "Commercial"
        // rental_sub_type enum: "CondoTownhome" | "MultiFamily" | "SingleFamily" | "Industrial" | "Office" | "Retail" | "ShoppingCenter" | "Storage" | "ParkingSpace"
        const rentalType = String(r.rental_type ?? "");
        const rentalSubType = String(r.rental_sub_type ?? "");
        let propertyType: PmsProperty["propertyType"];
        if (rentalType === "Commercial" || ["Industrial", "Office", "Retail", "ShoppingCenter", "Storage", "ParkingSpace"].includes(rentalSubType)) {
          propertyType = "commercial";
        } else if (rentalSubType === "MultiFamily" || rentalSubType === "CondoTownhome" || numUnits > 1) {
          propertyType = "multi_family";
        } else if (rentalSubType === "SingleFamily") {
          propertyType = "single_family";
        } else {
          // Default: single_family for Residential with no sub_type, or None
          propertyType = numUnits > 1 ? "multi_family" : "single_family";
        }

        // address: ListingPropertyMessageAddress — snake_case: address_line1, city, state, postal_code
        const addr = r.address as Record<string, string> | undefined;

        // Fetch individual units for multi-family properties from /rentals/{id}/units
        let unitNumbers: PmsProperty["unitNumbers"] = [];
        if (numUnits > 1 || propertyType === "multi_family") {
          try {
            let unitOffset = 0;
            while (true) {
              const unitData = await buildiumFetch(
                credentials,
                `/rentals/${propertyId}/units?offset=${unitOffset}&limit=100`
              );
              // Response is a direct array or wrapped in { items: [] }
              const unitItems: unknown[] = Array.isArray(unitData) ? unitData : (unitData?.items ?? []);
              if (!unitItems.length) break;
              for (const u of unitItems) {
                const unit = u as Record<string, unknown>;
                // RentalUnitMessage: id (integer), unit_number (string)
                const rawId = unit.id;
                const rawUnitNumber = unit.unit_number;
                if (!rawId && !rawUnitNumber) continue;
                unitNumbers.push({
                  externalId: String(rawId ?? ""),
                  unitNumber: String(rawUnitNumber ?? rawId ?? ""),
                  bedrooms: typeof unit.unit_bedrooms === "number" ? unit.unit_bedrooms
                    : typeof unit.unit_bedrooms === "string" ? parseFloat(unit.unit_bedrooms) || undefined
                    : undefined,
                  bathrooms: typeof unit.unit_bathrooms === "number" ? unit.unit_bathrooms
                    : typeof unit.unit_bathrooms === "string" ? parseFloat(unit.unit_bathrooms) || undefined
                    : undefined,
                  sqft: typeof unit.unit_size === "number" ? unit.unit_size : undefined,
                });
              }
              if (unitItems.length < 100) break;
              unitOffset += 100;
            }
          } catch (e) {
            console.warn(`[Buildium] Could not fetch units for property ${propertyId}:`, (e as Error).message);
          }
        }

        results.push({
          externalId: propertyId,
          name: String(r.name ?? r.id),
          address: addr ? String(addr.address_line1 ?? "").trim() : "",
          city: addr?.city,
          state: addr?.state,
          zipCode: addr?.postal_code,
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
    // Buildium filter param: lastupdatedfrom (all lowercase)
    const sinceParam = since ? `&lastupdatedfrom=${since.toISOString().split("T")[0]}` : "";

    while (true) {
      // ResidentRequestTaskMessage fields (snake_case):
      // id, title, description, unit_id, property, requested_by_user_entity, created_date_time, priority
      const data = await buildiumFetch(
        credentials,
        `/tasks/residentrequests?offset=${offset}&limit=${limit}${sinceParam}`
      );
      const items: unknown[] = Array.isArray(data) ? data : (data?.items ?? []);
      if (!items.length) break;

      for (const item of items) {
        const r = item as Record<string, unknown>;

        // property: ContactRequestTaskMessageProperty — has id, name
        const property = r.property as Record<string, unknown> | undefined;

        // requested_by_user_entity: ResidentRequestTaskMessageRequestedByUserEntity
        // Has: first_name, last_name, email
        const requestedBy = r.requested_by_user_entity as Record<string, unknown> | undefined;
        const tenantName = requestedBy
          ? `${requestedBy.first_name ?? ""} ${requestedBy.last_name ?? ""}`.trim()
          : undefined;
        const tenantEmail = requestedBy ? String(requestedBy.email ?? "") || undefined : undefined;

        // unit_id: integer — resolve unit_number by fetching /rentals/units/{unit_id}
        const rawUnitId = r.unit_id;
        let unitNumber: string | undefined;
        if (rawUnitId) {
          try {
            const unitData = await buildiumFetch(credentials, `/rentals/units/${rawUnitId}`);
            const u = unitData as Record<string, unknown>;
            // RentalUnitMessage: unit_number (string)
            unitNumber = String(u.unit_number ?? rawUnitId);
          } catch {
            unitNumber = String(rawUnitId);
          }
        }

        results.push({
          externalId: String(r.id),
          title: String(r.title ?? "Maintenance Request"),
          description: String(r.description ?? ""),
          unitNumber: unitNumber || undefined,
          tenantName: tenantName || undefined,
          tenantEmail: tenantEmail || undefined,
          propertyExternalId: property ? String(property.id ?? "") : "",
          priority: mapBuildiumPriority(r.priority as string | undefined),
          createdAt: r.created_date_time
            ? new Date(r.created_date_time as string)
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
