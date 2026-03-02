/**
 * PMS Provider Adapter Interface
 * Every PMS adapter must implement this interface so the sync engine
 * can call it uniformly regardless of the underlying API.
 */

export interface PmsProperty {
  externalId: string;
  name: string;
  address: string;
  city?: string;
  state?: string;
  zipCode?: string;
  units?: number;
}

export interface PmsMaintenanceRequest {
  externalId: string;
  title: string;
  description: string;
  unitNumber?: string;
  tenantName?: string;
  tenantPhone?: string;
  tenantEmail?: string;
  propertyExternalId: string;
  priority?: "low" | "medium" | "high" | "emergency";
  createdAt?: Date;
}

export interface PmsCredentials {
  apiKey?: string;
  clientId?: string;
  clientSecret?: string;
  accessToken?: string;
  refreshToken?: string;
  baseUrl?: string;
  isSandbox?: boolean;
}

export interface PmsAdapter {
  provider: string;
  /** Validate that the credentials work (called on connect) */
  testConnection(credentials: PmsCredentials): Promise<{ ok: boolean; error?: string }>;
  /** Import all properties for this account */
  importProperties(credentials: PmsCredentials): Promise<PmsProperty[]>;
  /** Fetch maintenance requests created/updated since a given date */
  fetchNewRequests(credentials: PmsCredentials, since?: Date): Promise<PmsMaintenanceRequest[]>;
  /** Mark a maintenance request as complete in the PMS */
  markComplete(credentials: PmsCredentials, externalId: string): Promise<{ ok: boolean; error?: string }>;
}
