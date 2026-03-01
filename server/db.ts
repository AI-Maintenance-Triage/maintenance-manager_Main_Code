import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser, users,
  companies, InsertCompany,
  companySettings, InsertCompanySettings,
  skillTiers, InsertSkillTier,
  properties, InsertProperty,
  contractorProfiles, InsertContractorProfile,
  contractorCompanies, InsertContractorCompany,
  maintenanceRequests, InsertMaintenanceRequest,
  timeSessions, InsertTimeSession,
  locationPings, InsertLocationPing,
  partsReceipts, InsertPartsReceipt,
  transactions, InsertTransaction,
  integrationConnectors, InsertIntegrationConnector,
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ─── Users ─────────────────────────────────────────────────────────────────
export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};

  const textFields = ["name", "email", "loginMethod"] as const;
  type TextField = (typeof textFields)[number];
  const assignNullable = (field: TextField) => {
    const value = user[field];
    if (value === undefined) return;
    const normalized = value ?? null;
    values[field] = normalized;
    updateSet[field] = normalized;
  };
  textFields.forEach(assignNullable);

  if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
  if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; }
  else if (user.openId === ENV.ownerOpenId) { values.role = 'admin'; updateSet.role = 'admin'; }

  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();

  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function createLocalUser(data: { name: string; email: string; passwordHash: string }) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  // Generate a unique openId for local users (prefix with "local_" to distinguish from OAuth)
  const localOpenId = `local_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const result = await db.insert(users).values({
    openId: localOpenId,
    name: data.name,
    email: data.email,
    passwordHash: data.passwordHash,
    loginMethod: "email",
    role: "user",
    lastSignedIn: new Date(),
  });
  return result[0].insertId;
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function updateUserRole(userId: number, role: "user" | "admin" | "company_admin" | "contractor", companyId?: number, contractorProfileId?: number) {
  const db = await getDb();
  if (!db) return;
  const updateData: Record<string, unknown> = { role };
  if (companyId !== undefined) updateData.companyId = companyId;
  if (contractorProfileId !== undefined) updateData.contractorProfileId = contractorProfileId;
  await db.update(users).set(updateData).where(eq(users.id, userId));
}

// ─── Companies ─────────────────────────────────────────────────────────────
export async function createCompany(data: InsertCompany) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(companies).values(data);
  const id = result[0].insertId;
  // Create default settings
  await db.insert(companySettings).values({ companyId: id });
  // Create default skill tiers
  await db.insert(skillTiers).values([
    { companyId: id, name: "General", description: "Basic handyman, minor fixes, cosmetic repairs", hourlyRate: "35.00", sortOrder: 1 },
    { companyId: id, name: "Skilled", description: "Moderate plumbing, basic electrical, carpentry", hourlyRate: "50.00", sortOrder: 2 },
    { companyId: id, name: "Specialty", description: "Licensed HVAC, electrical, plumbing", hourlyRate: "80.00", sortOrder: 3 },
    { companyId: id, name: "Emergency", description: "Any trade, after-hours emergency response", hourlyRate: "120.00", emergencyMultiplier: "1.50", sortOrder: 4 },
  ]);
  return id;
}

export async function getCompanyById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(companies).where(eq(companies.id, id)).limit(1);
  return result[0];
}

export async function listCompanies() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(companies).orderBy(desc(companies.createdAt));
}

export async function updateCompany(id: number, data: Partial<InsertCompany>) {
  const db = await getDb();
  if (!db) return;
  await db.update(companies).set(data).where(eq(companies.id, id));
}

// ─── Company Settings ──────────────────────────────────────────────────────
export async function getCompanySettings(companyId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(companySettings).where(eq(companySettings.companyId, companyId)).limit(1);
  return result[0];
}

export async function updateCompanySettings(companyId: number, data: Partial<InsertCompanySettings>) {
  const db = await getDb();
  if (!db) return;
  await db.update(companySettings).set(data).where(eq(companySettings.companyId, companyId));
}

// ─── Skill Tiers ───────────────────────────────────────────────────────────
export async function getSkillTiers(companyId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(skillTiers).where(eq(skillTiers.companyId, companyId)).orderBy(skillTiers.sortOrder);
}

export async function createSkillTier(data: InsertSkillTier) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(skillTiers).values(data);
  return result[0].insertId;
}

export async function updateSkillTier(id: number, companyId: number, data: Partial<InsertSkillTier>) {
  const db = await getDb();
  if (!db) return;
  await db.update(skillTiers).set(data).where(and(eq(skillTiers.id, id), eq(skillTiers.companyId, companyId)));
}

export async function deleteSkillTier(id: number, companyId: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(skillTiers).where(and(eq(skillTiers.id, id), eq(skillTiers.companyId, companyId)));
}

// ─── Properties ────────────────────────────────────────────────────────────
export async function listProperties(companyId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(properties).where(eq(properties.companyId, companyId)).orderBy(desc(properties.createdAt));
}

export async function getPropertyById(id: number, companyId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(properties).where(and(eq(properties.id, id), eq(properties.companyId, companyId))).limit(1);
  return result[0];
}

export async function createProperty(data: InsertProperty) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(properties).values(data);
  return result[0].insertId;
}

export async function updateProperty(id: number, companyId: number, data: Partial<InsertProperty>) {
  const db = await getDb();
  if (!db) return;
  await db.update(properties).set(data).where(and(eq(properties.id, id), eq(properties.companyId, companyId)));
}

export async function deleteProperty(id: number, companyId: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(properties).where(and(eq(properties.id, id), eq(properties.companyId, companyId)));
}

// ─── Contractor Profiles ───────────────────────────────────────────────────
export async function createContractorProfile(data: InsertContractorProfile) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(contractorProfiles).values(data);
  return result[0].insertId;
}

export async function getContractorProfile(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(contractorProfiles).where(eq(contractorProfiles.userId, userId)).limit(1);
  return result[0];
}

export async function getContractorProfileById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(contractorProfiles).where(eq(contractorProfiles.id, id)).limit(1);
  return result[0];
}

export async function updateContractorProfile(id: number, data: Partial<InsertContractorProfile>) {
  const db = await getDb();
  if (!db) return;
  await db.update(contractorProfiles).set(data).where(eq(contractorProfiles.id, id));
}

// ─── Contractor-Company Relationships ──────────────────────────────────────
export async function listContractorsByCompany(companyId: number) {
  const db = await getDb();
  if (!db) return [];
  const result = await db
    .select({
      relationship: contractorCompanies,
      profile: contractorProfiles,
      user: { id: users.id, name: users.name, email: users.email },
    })
    .from(contractorCompanies)
    .innerJoin(contractorProfiles, eq(contractorCompanies.contractorProfileId, contractorProfiles.id))
    .innerJoin(users, eq(contractorProfiles.userId, users.id))
    .where(eq(contractorCompanies.companyId, companyId));
  return result;
}

export async function listCompaniesByContractor(contractorProfileId: number) {
  const db = await getDb();
  if (!db) return [];
  const result = await db
    .select({
      relationship: contractorCompanies,
      company: companies,
    })
    .from(contractorCompanies)
    .innerJoin(companies, eq(contractorCompanies.companyId, companies.id))
    .where(eq(contractorCompanies.contractorProfileId, contractorProfileId));
  return result;
}

export async function createContractorCompanyRelation(data: InsertContractorCompany) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(contractorCompanies).values(data);
  return result[0].insertId;
}

export async function updateContractorCompanyStatus(id: number, status: "pending" | "approved" | "rejected" | "suspended") {
  const db = await getDb();
  if (!db) return;
  await db.update(contractorCompanies).set({ status }).where(eq(contractorCompanies.id, id));
}

// ─── Maintenance Requests ──────────────────────────────────────────────────
export async function listMaintenanceRequests(companyId: number, status?: string) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(maintenanceRequests.companyId, companyId)];
  if (status) conditions.push(eq(maintenanceRequests.status, status as any));
  return db.select().from(maintenanceRequests).where(and(...conditions)).orderBy(desc(maintenanceRequests.createdAt));
}

export async function getMaintenanceRequestById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(maintenanceRequests).where(eq(maintenanceRequests.id, id)).limit(1);
  return result[0];
}

export async function createMaintenanceRequest(data: InsertMaintenanceRequest) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(maintenanceRequests).values(data);
  return result[0].insertId;
}

export async function updateMaintenanceRequest(id: number, data: Partial<InsertMaintenanceRequest>) {
  const db = await getDb();
  if (!db) return;
  await db.update(maintenanceRequests).set(data).where(eq(maintenanceRequests.id, id));
}

export async function getJobsForContractor(contractorProfileId: number) {
  const db = await getDb();
  if (!db) return [];
  // Get companies this contractor is approved for
  const rels = await db.select().from(contractorCompanies)
    .where(and(eq(contractorCompanies.contractorProfileId, contractorProfileId), eq(contractorCompanies.status, "approved")));
  if (rels.length === 0) return [];
  const companyIds = rels.map(r => r.companyId);
  return db.select({
    job: maintenanceRequests,
    property: properties,
    company: { id: companies.id, name: companies.name, logoUrl: companies.logoUrl },
  })
    .from(maintenanceRequests)
    .innerJoin(properties, eq(maintenanceRequests.propertyId, properties.id))
    .innerJoin(companies, eq(maintenanceRequests.companyId, companies.id))
    .where(and(
      inArray(maintenanceRequests.companyId, companyIds),
      eq(maintenanceRequests.status, "open"),
    ))
    .orderBy(desc(maintenanceRequests.createdAt));
}

export async function getContractorAssignedJobs(contractorProfileId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    job: maintenanceRequests,
    property: properties,
    company: { id: companies.id, name: companies.name, logoUrl: companies.logoUrl },
  })
    .from(maintenanceRequests)
    .innerJoin(properties, eq(maintenanceRequests.propertyId, properties.id))
    .innerJoin(companies, eq(maintenanceRequests.companyId, companies.id))
    .where(and(
      eq(maintenanceRequests.assignedContractorId, contractorProfileId),
      inArray(maintenanceRequests.status, ["assigned", "in_progress", "completed"]),
    ))
    .orderBy(desc(maintenanceRequests.createdAt));
}

// ─── Time Sessions ─────────────────────────────────────────────────────────
export async function createTimeSession(data: InsertTimeSession) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(timeSessions).values(data);
  return result[0].insertId;
}

export async function getActiveTimeSession(maintenanceRequestId: number, contractorProfileId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(timeSessions)
    .where(and(
      eq(timeSessions.maintenanceRequestId, maintenanceRequestId),
      eq(timeSessions.contractorProfileId, contractorProfileId),
      eq(timeSessions.status, "active"),
    ))
    .limit(1);
  return result[0];
}

export async function updateTimeSession(id: number, data: Partial<InsertTimeSession>) {
  const db = await getDb();
  if (!db) return;
  await db.update(timeSessions).set(data).where(eq(timeSessions.id, id));
}

export async function getTimeSessionsByJob(maintenanceRequestId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(timeSessions).where(eq(timeSessions.maintenanceRequestId, maintenanceRequestId)).orderBy(timeSessions.clockInTime);
}

// ─── Location Pings ────────────────────────────────────────────────────────
export async function addLocationPing(data: InsertLocationPing) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(locationPings).values(data);
}

export async function getLocationPings(timeSessionId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(locationPings).where(eq(locationPings.timeSessionId, timeSessionId)).orderBy(locationPings.timestamp);
}

// ─── Parts & Receipts ──────────────────────────────────────────────────────
export async function createPartsReceipt(data: InsertPartsReceipt) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(partsReceipts).values(data);
  return result[0].insertId;
}

export async function getPartsReceiptsByJob(maintenanceRequestId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(partsReceipts).where(eq(partsReceipts.maintenanceRequestId, maintenanceRequestId));
}

export async function approvePartsReceipt(id: number, approvedBy: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(partsReceipts).set({ approved: true, approvedBy }).where(eq(partsReceipts.id, id));
}

// ─── Transactions ──────────────────────────────────────────────────────────
export async function createTransaction(data: InsertTransaction) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(transactions).values(data);
  return result[0].insertId;
}

export async function getTransactionsByCompany(companyId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(transactions).where(eq(transactions.companyId, companyId)).orderBy(desc(transactions.createdAt));
}

export async function getTransactionsByContractor(contractorProfileId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(transactions).where(eq(transactions.contractorProfileId, contractorProfileId)).orderBy(desc(transactions.createdAt));
}

// ─── Integration Connectors ────────────────────────────────────────────────
export async function getIntegrationConnectors(companyId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(integrationConnectors).where(eq(integrationConnectors.companyId, companyId));
}

export async function upsertIntegrationConnector(data: InsertIntegrationConnector) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(integrationConnectors).values(data).onDuplicateKeyUpdate({
    set: { apiKey: data.apiKey, apiSecret: data.apiSecret, baseUrl: data.baseUrl, isActive: data.isActive, config: data.config },
  });
  return result[0].insertId;
}

// ─── Dashboard Stats ───────────────────────────────────────────────────────
export async function getCompanyDashboardStats(companyId: number) {
  const db = await getDb();
  if (!db) return { totalJobs: 0, openJobs: 0, inProgressJobs: 0, completedJobs: 0, totalSpent: "0.00", activeContractors: 0, totalProperties: 0 };

  const [jobStats] = await db.select({
    total: sql<number>`COUNT(*)`,
    open: sql<number>`SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END)`,
    inProgress: sql<number>`SUM(CASE WHEN status IN ('assigned', 'in_progress') THEN 1 ELSE 0 END)`,
    completed: sql<number>`SUM(CASE WHEN status IN ('completed', 'verified', 'paid') THEN 1 ELSE 0 END)`,
  }).from(maintenanceRequests).where(eq(maintenanceRequests.companyId, companyId));

  const [spentResult] = await db.select({
    total: sql<string>`COALESCE(SUM(totalCharged), 0)`,
  }).from(transactions).where(and(eq(transactions.companyId, companyId), eq(transactions.status, "paid_out")));

  const [contractorCount] = await db.select({
    count: sql<number>`COUNT(*)`,
  }).from(contractorCompanies).where(and(eq(contractorCompanies.companyId, companyId), eq(contractorCompanies.status, "approved")));

  const [propertyCount] = await db.select({
    count: sql<number>`COUNT(*)`,
  }).from(properties).where(eq(properties.companyId, companyId));

  return {
    totalJobs: jobStats?.total ?? 0,
    openJobs: jobStats?.open ?? 0,
    inProgressJobs: jobStats?.inProgress ?? 0,
    completedJobs: jobStats?.completed ?? 0,
    totalSpent: spentResult?.total ?? "0.00",
    activeContractors: contractorCount?.count ?? 0,
    totalProperties: propertyCount?.count ?? 0,
  };
}

export async function getPlatformStats() {
  const db = await getDb();
  if (!db) return { totalCompanies: 0, totalContractors: 0, totalJobs: 0, totalRevenue: "0.00" };

  const [companyCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(companies);
  const [contractorCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(contractorProfiles);
  const [jobCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(maintenanceRequests);
  const [revenue] = await db.select({ total: sql<string>`COALESCE(SUM(platformFee), 0)` }).from(transactions).where(eq(transactions.status, "paid_out"));

  return {
    totalCompanies: companyCount?.count ?? 0,
    totalContractors: contractorCount?.count ?? 0,
    totalJobs: jobCount?.count ?? 0,
    totalRevenue: revenue?.total ?? "0.00",
  };
}


// ─── Admin: List All Contractors ──────────────────────────────────────────
export async function listAllContractors() {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    profile: contractorProfiles,
    user: { id: users.id, name: users.name, email: users.email },
  })
    .from(contractorProfiles)
    .innerJoin(users, eq(contractorProfiles.userId, users.id))
    .orderBy(desc(contractorProfiles.createdAt));
}

// ─── Admin: Delete Company ─────────────────────────────────────────────────
export async function deleteCompany(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(companies).where(eq(companies.id, id));
}

// ─── Admin: Delete Contractor Profile ─────────────────────────────────────
export async function deleteContractorProfile(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(contractorProfiles).where(eq(contractorProfiles.id, id));
}

// ─── Admin: Update Contractor Profile ─────────────────────────────────────
export async function adminUpdateContractorProfile(id: number, data: Partial<InsertContractorProfile>) {
  const db = await getDb();
  if (!db) return;
  await db.update(contractorProfiles).set(data).where(eq(contractorProfiles.id, id));
}


// ─── Update User Display Name ──────────────────────────────────────────────
export async function updateUserName(userId: number, name: string) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ name }).where(eq(users.id, userId));
}
