/**
 * Buildium PMS Adapter
 * Uses Buildium Open API v1 with Client ID + Client Secret (API key auth).
 * Docs: https://developer.buildium.com/
 *
 * CONFIRMED from actual API response (debug tool): ALL fields are PascalCase.
 * - RentalMessage: Id, Name, NumberUnits, RentalType, RentalSubType, Address
 * - Address: AddressLine1, AddressLine2, City, State, PostalCode, Country
 * - RentalUnitMessage (from GET /v1/rentals/units): snake_case fields:
 *   id, property_id, unit_number, unit_bedrooms, unit_bathrooms, unit_size
 * - ResidentRequestTaskMessage: Id, Title, Description, UnitId, Property, RequestedByUserEntity, CreatedDateTime, Priority
 * - Property (nested): Id, Name
 * - RequestedByUserEntity: FirstName, LastName, Email
 *
 * UNITS ENDPOINT: GET /v1/rentals/units?propertyids={id}
 * NOT /rentals/{id}/units (that path does not exist)
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

/** Helper to read a field trying both PascalCase and snake_case variants */
function getField(r: Record<string, unknown>, pascal: string, snake: string): unknown {
  return r[pascal] !== undefined ? r[pascal] : r[snake];
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
      const data = await buildiumFetch(credentials, `/rentals?offset=${offset}&limit=${limit}`);
      const items: unknown[] = Array.isArray(data) ? data : (data?.items ?? []);
      if (!items.length) break;

      for (const item of items) {
        const r = item as Record<string, unknown>;

        // Id — PascalCase confirmed from debug
        const propertyId = getField(r, "Id", "id");
        if (!propertyId) continue;

        // Name — skip properties with no name (avoids "undefined" cards)
        const nameRaw = getField(r, "Name", "name");
        if (!nameRaw || String(nameRaw).trim() === "") continue;

        // NumberUnits — PascalCase confirmed
        const numUnitsRaw = getField(r, "NumberUnits", "number_units");
        const numUnits = typeof numUnitsRaw === "number" ? numUnitsRaw : 1;

        // RentalType / RentalSubType — PascalCase confirmed
        const rentalType = String(getField(r, "RentalType", "rental_type") ?? "");
        const rentalSubType = String(getField(r, "RentalSubType", "rental_sub_type") ?? "");

        let propertyType: PmsProperty["propertyType"];
        if (rentalType === "Commercial" || ["Industrial", "Office", "Retail", "ShoppingCenter", "Storage", "ParkingSpace"].includes(rentalSubType)) {
          propertyType = "commercial";
        } else if (rentalSubType === "MultiFamily" || rentalSubType === "CondoTownhome" || numUnits > 1) {
          propertyType = "multi_family";
        } else if (rentalSubType === "SingleFamily") {
          propertyType = "single_family";
        } else {
          propertyType = numUnits > 1 ? "multi_family" : "single_family";
        }

        // Address — PascalCase confirmed: Address.AddressLine1, .City, .State, .PostalCode
        const addr = (getField(r, "Address", "address") ?? {}) as Record<string, string>;
        const street = String(getField(addr, "AddressLine1", "address_line1") ?? "").trim();
        const city = String(getField(addr, "City", "city") ?? "").trim() || undefined;
        const state = String(getField(addr, "State", "state") ?? "").trim() || undefined;
        const zip = String(getField(addr, "PostalCode", "postal_code") ?? "").trim() || undefined;

        // Fetch individual units for multi-family properties
        // Correct endpoint: GET /v1/rentals/units?propertyids={id}
        // RentalUnitMessage fields are snake_case: id, unit_number, unit_bedrooms, unit_bathrooms, unit_size
        let unitNumbers: PmsProperty["unitNumbers"] = [];
        if (numUnits > 1 || propertyType === "multi_family") {
          try {
            let unitOffset = 0;
            while (true) {
              const unitData = await buildiumFetch(
                credentials,
                `/rentals/units?propertyids=${propertyId}&offset=${unitOffset}&limit=100`
              );
              const unitItems: unknown[] = Array.isArray(unitData) ? unitData : (unitData?.items ?? []);
              if (!unitItems.length) break;
              for (const u of unitItems) {
                const unit = u as Record<string, unknown>;
                // RentalUnitMessage uses snake_case (confirmed from SDK docs)
                const unitId = unit["id"] ?? unit["Id"];
                const rawUnitNumber = unit["unit_number"] ?? unit["UnitNumber"];
                if (!unitId && !rawUnitNumber) continue;
                // bedrooms/bathrooms come as strings like "TwoBedrooms" or numbers
                const bedroomsRaw = unit["unit_bedrooms"] ?? unit["Bedrooms"];
                const bathroomsRaw = unit["unit_bathrooms"] ?? unit["Bathrooms"];
                const sqftRaw = unit["unit_size"] ?? unit["SquareFeet"];
                const parseBedBath = (v: unknown): number | undefined => {
                  if (typeof v === "number") return v;
                  if (typeof v === "string") {
                    const n = parseFloat(v);
                    if (!isNaN(n)) return n;
                    // Handle string enums like "TwoBedrooms"
                    const map: Record<string, number> = { One: 1, Two: 2, Three: 3, Four: 4, Five: 5 };
                    for (const [k, val] of Object.entries(map)) {
                      if (v.startsWith(k)) return val;
                    }
                  }
                  return undefined;
                };
                unitNumbers.push({
                  externalId: String(unitId ?? ""),
                  unitNumber: String(rawUnitNumber ?? unitId ?? ""),
                  bedrooms: parseBedBath(bedroomsRaw),
                  bathrooms: parseBedBath(bathroomsRaw),
                  sqft: typeof sqftRaw === "number" ? sqftRaw : undefined,
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
          externalId: String(propertyId),
          name: String(nameRaw).trim(),
          address: street,
          city,
          state,
          zipCode: zip,
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
    // Use createddatefrom so we only pull genuinely NEW tasks, not tasks updated since last sync
    // This prevents re-pulling already-imported tasks on every resync
    const sinceParam = since ? `&createddatefrom=${since.toISOString().split("T")[0]}` : "";

    while (true) {
      const data = await buildiumFetch(
        credentials,
        `/tasks/residentrequests?offset=${offset}&limit=${limit}${sinceParam}`
      );
      const items: unknown[] = Array.isArray(data) ? data : (data?.items ?? []);
      if (!items.length) break;

      for (const item of items) {
        const r = item as Record<string, unknown>;

        // Property — try both PascalCase and snake_case
        const property = (getField(r, "Property", "property") ?? {}) as Record<string, unknown>;

        // RequestedByUserEntity — try both cases
        const requestedBy = (getField(r, "RequestedByUserEntity", "requested_by_user_entity") ?? {}) as Record<string, unknown>;
        const firstName = String(getField(requestedBy, "FirstName", "first_name") ?? "");
        const lastName = String(getField(requestedBy, "LastName", "last_name") ?? "");
        const tenantName = `${firstName} ${lastName}`.trim() || undefined;
        const tenantEmailRaw = getField(requestedBy, "Email", "email");
        const tenantEmail = tenantEmailRaw ? String(tenantEmailRaw) || undefined : undefined;

        // UnitId — used to look up tenant phone number via /leases/tenants?unitids={unitId}
        // (unitagreementids is NOT a valid filter; unitids is the correct parameter)
        const rawUnitIdForPhone = getField(r, "UnitId", "unit_id");

        // Try to get tenant phone via unit ID lookup
        let tenantPhone: string | undefined;
        if (rawUnitIdForPhone) {
          try {
            const tenantsData = await buildiumFetch(
              credentials,
              `/leases/tenants?unitids=${rawUnitIdForPhone}&limit=1`
            );
            const tenants: unknown[] = Array.isArray(tenantsData) ? tenantsData : (tenantsData?.items ?? []);
            if (tenants.length > 0) {
              const tenant = tenants[0] as Record<string, unknown>;
              const phoneNumbers = (getField(tenant, "PhoneNumbers", "phone_numbers") ?? []) as Array<Record<string, unknown>>;
              // Prefer Home > Cell > Work > first available
              const preferred = phoneNumbers.find(p => String(getField(p, "Type", "type") ?? "").toLowerCase() === "home")
                ?? phoneNumbers.find(p => String(getField(p, "Type", "type") ?? "").toLowerCase() === "cell")
                ?? phoneNumbers.find(p => String(getField(p, "Type", "type") ?? "").toLowerCase() === "work")
                ?? phoneNumbers[0];
              if (preferred) {
                const num = getField(preferred, "Number", "number");
                if (num) tenantPhone = String(num);
              }
            }
          } catch {
            // Phone lookup is best-effort; don't fail the whole sync
          }
        }

        // UnitId — try both cases, then resolve unit number
        const rawUnitId = getField(r, "UnitId", "unit_id");
        let unitNumber: string | undefined;
        if (rawUnitId) {
          try {
            const unitData = await buildiumFetch(credentials, `/rentals/units/${rawUnitId}`);
            const u = unitData as Record<string, unknown>;
            const unitNum = getField(u, "UnitNumber", "unit_number");
            unitNumber = String(unitNum ?? rawUnitId);
          } catch {
            unitNumber = String(rawUnitId);
          }
        }

        // Id, Title, Description, CreatedDateTime, Priority
        const reqId = getField(r, "Id", "id");
        const title = getField(r, "Title", "title");
        const description = getField(r, "Description", "description");
        const createdAt = getField(r, "CreatedDateTime", "created_date_time");
        const priority = getField(r, "Priority", "priority");
        const propertyId = getField(property, "Id", "id");

        results.push({
          externalId: String(reqId),
          title: String(title ?? "Maintenance Request"),
          description: String(description ?? ""),
          unitNumber: unitNumber || undefined,
          tenantName: tenantName || undefined,
          tenantPhone: tenantPhone || undefined,
          tenantEmail: tenantEmail || undefined,
          propertyExternalId: propertyId ? String(propertyId) : "",
          priority: mapBuildiumPriority(priority as string | undefined),
          createdAt: createdAt ? new Date(createdAt as string) : undefined,
        });
      }

      if (items.length < limit) break;
      offset += limit;
    }

    return results;
  },

  async markComplete(credentials, externalId) {
    try {
      // First fetch the task to get required fields (title, priority) for the PUT body
      const task = await buildiumFetch(credentials, `/tasks/residentrequests/${externalId}`) as Record<string, unknown>;
      const title = String(getField(task, "Title", "title") ?? "Maintenance Request");
      const priority = String(getField(task, "Priority", "priority") ?? "Normal");
      // PUT requires title, task_status, and priority as required fields
      await buildiumFetch(credentials, `/tasks/residentrequests/${externalId}`, {
        method: "PUT",
        body: JSON.stringify({
          Title: title,
          TaskStatus: "Completed",
          Priority: priority,
        }),
      });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  },

  async markReopen(credentials, externalId) {
    try {
      // First fetch the task to get required fields (title, priority) for the PUT body
      const task = await buildiumFetch(credentials, `/tasks/residentrequests/${externalId}`) as Record<string, unknown>;
      const title = String(getField(task, "Title", "title") ?? "Maintenance Request");
      const priority = String(getField(task, "Priority", "priority") ?? "Normal");
      // PUT requires title, task_status, and priority as required fields
      // Set TaskStatus back to "New" to re-open the task in Buildium
      await buildiumFetch(credentials, `/tasks/residentrequests/${externalId}`, {
        method: "PUT",
        body: JSON.stringify({
          Title: title,
          TaskStatus: "New",
          Priority: priority,
        }),
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
