import { eq, and, desc, sql, inArray, or, isNull } from "drizzle-orm";
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
  platformSettings,
  contractorRatings, InsertContractorRating,
  jobComments, InsertJobComment,
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
export async function listMaintenanceRequests(companyId: number, status?: string | string[]) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(maintenanceRequests.companyId, companyId)];
  if (status) {
    if (Array.isArray(status)) {
      conditions.push(inArray(maintenanceRequests.status, status as any[]));
    } else {
      conditions.push(eq(maintenanceRequests.status, status as any));
    }
  }
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

export async function getTimeSessionById(sessionId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(timeSessions).where(eq(timeSessions.id, sessionId)).limit(1);
  return rows[0] ?? null;
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

// Get all active time sessions for a company (for live tracking view)
export async function getActiveSessionsByCompany(companyId: number) {
  const db = await getDb();
  if (!db) return [];
  const sessions = await db.select({
    sessionId: timeSessions.id,
    maintenanceRequestId: timeSessions.maintenanceRequestId,
    contractorProfileId: timeSessions.contractorProfileId,
    clockInTime: timeSessions.clockInTime,
    clockInLat: timeSessions.clockInLat,
    clockInLng: timeSessions.clockInLng,
    contractorName: contractorProfiles.businessName,
    contractorPhone: contractorProfiles.phone,
    jobTitle: maintenanceRequests.title,
    jobAddress: properties.address,
    jobLat: properties.latitude,
    jobLng: properties.longitude,
    hourlyRate: maintenanceRequests.hourlyRate,
    isEmergency: maintenanceRequests.isEmergency,
  })
  .from(timeSessions)
  .leftJoin(contractorProfiles, eq(timeSessions.contractorProfileId, contractorProfiles.id))
  .leftJoin(maintenanceRequests, eq(timeSessions.maintenanceRequestId, maintenanceRequests.id))
  .leftJoin(properties, eq(maintenanceRequests.propertyId, properties.id))
  .where(and(
    eq(timeSessions.companyId, companyId),
    eq(timeSessions.status, "active"),
    // Only show sessions where the job is still actively in-progress (not verified/paid/done)
    inArray(maintenanceRequests.status, ["assigned", "in_progress", "pending_verification"]),
  ));
  return sessions;
}

// Get completed/clocked-out time sessions for a company (for Past Jobs tab)
export async function getCompletedSessionsByCompany(companyId: number, limit = 50) {
  const db = await getDb();
  if (!db) return [];
  const sessions = await db.select({
    sessionId: timeSessions.id,
    maintenanceRequestId: timeSessions.maintenanceRequestId,
    contractorProfileId: timeSessions.contractorProfileId,
    clockInTime: timeSessions.clockInTime,
    clockOutTime: timeSessions.clockOutTime,
    totalMinutes: timeSessions.totalMinutes,
    clockOutMethod: timeSessions.clockOutMethod,
    contractorName: contractorProfiles.businessName,
    contractorPhone: contractorProfiles.phone,
    jobTitle: maintenanceRequests.title,
    jobAddress: properties.address,
    jobLat: properties.latitude,
    jobLng: properties.longitude,
    hourlyRate: maintenanceRequests.hourlyRate,
    isEmergency: maintenanceRequests.isEmergency,
    jobStatus: maintenanceRequests.status,
  })
  .from(timeSessions)
  .leftJoin(contractorProfiles, eq(timeSessions.contractorProfileId, contractorProfiles.id))
  .leftJoin(maintenanceRequests, eq(timeSessions.maintenanceRequestId, maintenanceRequests.id))
  .leftJoin(properties, eq(maintenanceRequests.propertyId, properties.id))
  .where(and(
    eq(timeSessions.companyId, companyId),
    eq(timeSessions.status, "completed"),
  ))
  .orderBy(desc(timeSessions.clockOutTime))
  .limit(limit);
  return sessions;
}

// Get the most recent location ping for a session
export async function getLatestPingForSession(timeSessionId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(locationPings)
    .where(eq(locationPings.timeSessionId, timeSessionId))
    .orderBy(desc(locationPings.timestamp))
    .limit(1);
  return result[0];
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

export async function getCompanyExpenseReport(companyId: number) {
  const db = await getDb();
  if (!db) return { transactions: [], monthlyTotals: [], propertyTotals: [] };

  // All transactions for this company
  const txns = await db
    .select({
      id: transactions.id,
      maintenanceRequestId: transactions.maintenanceRequestId,
      laborCost: transactions.laborCost,
      partsCost: transactions.partsCost,
      platformFee: transactions.platformFee,
      totalCharged: transactions.totalCharged,
      contractorPayout: transactions.contractorPayout,
      status: transactions.status,
      paidAt: transactions.paidAt,
      createdAt: transactions.createdAt,
      jobTitle: maintenanceRequests.title,
      propertyId: maintenanceRequests.propertyId,
      propertyName: properties.name,
      propertyAddress: properties.address,
    })
    .from(transactions)
    .leftJoin(maintenanceRequests, eq(transactions.maintenanceRequestId, maintenanceRequests.id))
    .leftJoin(properties, eq(maintenanceRequests.propertyId, properties.id))
    .where(eq(transactions.companyId, companyId))
    .orderBy(desc(transactions.createdAt));

  // Monthly totals (last 12 months)
  const monthlyTotals = await db
    .select({
      month: sql<string>`DATE_FORMAT(createdAt, '%Y-%m')`,
      total: sql<string>`SUM(totalCharged)`,
      laborTotal: sql<string>`SUM(laborCost)`,
      partsTotal: sql<string>`SUM(partsCost)`,
      feeTotal: sql<string>`SUM(platformFee)`,
      jobCount: sql<number>`COUNT(*)`,
    })
    .from(transactions)
    .where(and(
      eq(transactions.companyId, companyId),
      sql`createdAt >= DATE_SUB(NOW(), INTERVAL 12 MONTH)`
    ))
    .groupBy(sql`DATE_FORMAT(createdAt, '%Y-%m')`)
    .orderBy(sql`DATE_FORMAT(createdAt, '%Y-%m')`);

  // Per-property totals
  const propertyTotals = await db
    .select({
      propertyId: maintenanceRequests.propertyId,
      propertyName: properties.name,
      propertyAddress: properties.address,
      total: sql<string>`SUM(${transactions.totalCharged})`,
      jobCount: sql<number>`COUNT(*)`,
    })
    .from(transactions)
    .leftJoin(maintenanceRequests, eq(transactions.maintenanceRequestId, maintenanceRequests.id))
    .leftJoin(properties, eq(maintenanceRequests.propertyId, properties.id))
    .where(eq(transactions.companyId, companyId))
    .groupBy(maintenanceRequests.propertyId, properties.name, properties.address)
    .orderBy(desc(sql`SUM(${transactions.totalCharged})`));

  return { transactions: txns, monthlyTotals, propertyTotals };
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
  // Delete all users associated with this company (wipes their credentials)
  await db.delete(users).where(eq(users.companyId, id));
  // Delete the company record itself
  await db.delete(companies).where(eq(companies.id, id));
}

// ─── Admin: Delete Contractor Profile ─────────────────────────────────────
export async function deleteContractorProfile(id: number) {
  const db = await getDb();
  if (!db) return;
  // Delete the user account linked to this contractor profile (wipes their credentials)
  await db.delete(users).where(eq(users.contractorProfileId, id));
  // Delete the contractor profile itself
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

/// ─── Geocoding Helper (server-side via Google Maps API) ────────────────────
export async function geocodeAddress(address: string): Promise<{ lat: string; lng: string } | null> {
  const { ENV } = await import("./_core/env");
  const apiKey = ENV.googleMapsApiKey;
  if (!apiKey) {
    console.error("[Geocode] GOOGLE_MAPS_API_KEY is not set");
    return null;
  }
  try {
    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    url.searchParams.set("address", address);
    url.searchParams.set("key", apiKey);
    const response = await fetch(url.toString());
    const result = await response.json() as any;
    if (result?.results?.[0]?.geometry?.location) {
      const { lat, lng } = result.results[0].geometry.location;
      console.log(`[Geocode] OK: "${address}" → ${lat}, ${lng}`);
      return { lat: String(lat), lng: String(lng) };
    }
    console.error(`[Geocode] No results for "${address}": status=${result?.status} error=${result?.error_message ?? ""}`);
  } catch (err) {
    console.error("[Geocode] Failed:", err);
  }
  return null;
}

// ─── Update Property Coordinates ──────────────────────────────────────────
export async function updatePropertyCoords(id: number, lat: string, lng: string) {
  const db = await getDb();
  if (!db) return;
  await db.update(properties).set({ latitude: lat, longitude: lng }).where(eq(properties.id, id));
}

// ─── Update Contractor Coordinates ────────────────────────────────────────
export async function updateContractorCoords(profileId: number, lat: string, lng: string) {
  const db = await getDb();
  if (!db) return;
  await db.update(contractorProfiles).set({ latitude: lat, longitude: lng }).where(eq(contractorProfiles.id, profileId));
}

// ─── Bulk Re-Geocode Helpers ─────────────────────────────────────────────────
export async function getAllPropertiesMissingCoords() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(properties)
    .where(or(isNull(properties.latitude), isNull(properties.longitude)));
}

export async function getAllContractorsMissingCoords() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(contractorProfiles)
    .where(or(isNull(contractorProfiles.latitude), isNull(contractorProfiles.longitude)));
}

// ─── Haversine Distance (miles) ────────────────────────────────────────────
function haversineDistanceMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8; // Earth radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Job Board: List Jobs Filtered by Contractor Service Area ─────────────
export async function listJobBoardForContractor(contractorProfileId: number) {
  const db = await getDb();
  if (!db) return [];

  // Get contractor's location and radius
  const [contractor] = await db
    .select()
    .from(contractorProfiles)
    .where(eq(contractorProfiles.id, contractorProfileId))
    .limit(1);

  if (!contractor) return [];

  const contractorLat = contractor.latitude ? parseFloat(String(contractor.latitude)) : null;
  const contractorLng = contractor.longitude ? parseFloat(String(contractor.longitude)) : null;
  const radiusMiles = contractor.serviceRadiusMiles ?? 25;

  // Get all open jobs posted to the board with their property info
  const jobs = await db
    .select({
      job: maintenanceRequests,
      property: {
        id: properties.id,
        name: properties.name,
        city: properties.city,
        state: properties.state,
        zipCode: properties.zipCode,
        latitude: properties.latitude,
        longitude: properties.longitude,
      },
      company: {
        id: companies.id,
        name: companies.name,
      },
    })
    .from(maintenanceRequests)
    .innerJoin(properties, eq(maintenanceRequests.propertyId, properties.id))
    .innerJoin(companies, eq(maintenanceRequests.companyId, companies.id))
    .where(
      and(
        eq(maintenanceRequests.postedToBoard, true),
        eq(maintenanceRequests.status, "open")
      )
    )
    .orderBy(desc(maintenanceRequests.createdAt));

  // Filter by service area if contractor has coordinates
  if (contractorLat !== null && contractorLng !== null) {
    return jobs
      .map((row) => {
        const propLat = row.property.latitude ? parseFloat(String(row.property.latitude)) : null;
        const propLng = row.property.longitude ? parseFloat(String(row.property.longitude)) : null;
        if (propLat === null || propLng === null) return null;
        const distanceMiles = Math.round(haversineDistanceMiles(contractorLat, contractorLng, propLat, propLng) * 10) / 10;
        if (distanceMiles > radiusMiles) return null;
        return { ...row, distanceMiles };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);
  }

  // Contractor has no geocoded coordinates — return empty list so the UI
  // can prompt them to complete their service area setup.
  return [];
}

// ─── Job Board: Accept a Job ───────────────────────────────────────────────
export async function acceptJobFromBoard(jobId: number, contractorProfileId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  // Verify job is still open and on the board
  const [job] = await db
    .select()
    .from(maintenanceRequests)
    .where(
      and(
        eq(maintenanceRequests.id, jobId),
        eq(maintenanceRequests.postedToBoard, true),
        eq(maintenanceRequests.status, "open")
      )
    )
    .limit(1);

  if (!job) throw new Error("Job is no longer available");

  await db
    .update(maintenanceRequests)
    .set({
      status: "assigned",
      assignedContractorId: contractorProfileId,
      assignedAt: new Date(),
      postedToBoard: false,
    })
    .where(eq(maintenanceRequests.id, jobId));
}

// ─── Job Board: Post a Job to the Board ───────────────────────────────────
export async function postJobToBoard(jobId: number, companyId: number) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(maintenanceRequests)
    .set({ postedToBoard: true })
    .where(and(eq(maintenanceRequests.id, jobId), eq(maintenanceRequests.companyId, companyId)));
}

// ─── Job Board: Remove a Job from the Board ───────────────────────────────
export async function removeJobFromBoard(jobId: number, companyId: number) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(maintenanceRequests)
    .set({ postedToBoard: false })
    .where(and(eq(maintenanceRequests.id, jobId), eq(maintenanceRequests.companyId, companyId)));
}

// ─── Job Board: Debug — returns raw coords and distances ──────────────────
export async function debugJobBoardForContractor(contractorProfileId: number) {
  const db = await getDb();
  if (!db) return { contractor: null, jobs: [] };

  const [contractor] = await db
    .select({
      id: contractorProfiles.id,
      businessName: contractorProfiles.businessName,
      latitude: contractorProfiles.latitude,
      longitude: contractorProfiles.longitude,
      serviceRadiusMiles: contractorProfiles.serviceRadiusMiles,
      serviceAreaZips: contractorProfiles.serviceAreaZips,
    })
    .from(contractorProfiles)
    .where(eq(contractorProfiles.id, contractorProfileId))
    .limit(1);

  const jobs = await db
    .select({
      jobId: maintenanceRequests.id,
      jobTitle: maintenanceRequests.title,
      status: maintenanceRequests.status,
      postedToBoard: maintenanceRequests.postedToBoard,
      propertyId: properties.id,
      propertyAddress: properties.address,
      propertyCity: properties.city,
      propertyZip: properties.zipCode,
      propertyLat: properties.latitude,
      propertyLng: properties.longitude,
    })
    .from(maintenanceRequests)
    .innerJoin(properties, eq(maintenanceRequests.propertyId, properties.id))
    .orderBy(desc(maintenanceRequests.createdAt));

  const contractorLat = contractor?.latitude ? parseFloat(String(contractor.latitude)) : null;
  const contractorLng = contractor?.longitude ? parseFloat(String(contractor.longitude)) : null;
  const radiusMiles = contractor?.serviceRadiusMiles ?? 25;

  const jobsWithDistance = jobs.map((row) => {
    const propLat = row.propertyLat ? parseFloat(String(row.propertyLat)) : null;
    const propLng = row.propertyLng ? parseFloat(String(row.propertyLng)) : null;
    let distanceMiles: number | null = null;
    let withinRadius: boolean | null = null;
    if (contractorLat !== null && contractorLng !== null && propLat !== null && propLng !== null) {
      const R = 3958.8;
      const dLat = ((propLat - contractorLat) * Math.PI) / 180;
      const dLon = ((propLng - contractorLng) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((contractorLat * Math.PI) / 180) *
          Math.cos((propLat * Math.PI) / 180) *
          Math.sin(dLon / 2) ** 2;
      distanceMiles = Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10;
      withinRadius = distanceMiles <= radiusMiles;
    }
    return { ...row, distanceMiles, withinRadius };
  });

  return {
    contractor: contractor ? {
      ...contractor,
      hasCoords: contractorLat !== null && contractorLng !== null,
      radiusMiles,
    } : null,
    jobs: jobsWithDistance,
  };
}

// ─── Job Completion: Contractor marks job complete ─────────────────────────
export async function markJobComplete(
  jobId: number,
  contractorProfileId: number,
  completionNotes: string,
  completionPhotoUrls: string[],
  totalLaborMinutes?: number | null,
  totalLaborCost?: string | null,
  hourlyRate?: string | null
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const [job] = await db
    .select()
    .from(maintenanceRequests)
    .where(
      and(
        eq(maintenanceRequests.id, jobId),
        eq(maintenanceRequests.assignedContractorId, contractorProfileId),
        inArray(maintenanceRequests.status, ["assigned", "in_progress"])
      )
    )
    .limit(1);

  if (!job) throw new Error("Job not found or not assigned to you");

  await db
    .update(maintenanceRequests)
    .set({
      status: "pending_verification",
      completedAt: new Date(),
      completionNotes,
      completionPhotoUrls,
      ...(totalLaborMinutes != null && { totalLaborMinutes }),
      ...(totalLaborCost != null && { totalLaborCost }),
      ...(hourlyRate != null && { hourlyRate }),
    })
    .where(eq(maintenanceRequests.id, jobId));
}

// ─── Job Verification: Company approves or disputes ────────────────────────
export async function verifyJob(
  jobId: number,
  companyId: number,
  verifiedByUserId: number,
  action: "approve" | "dispute",
  notes: string
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const [job] = await db
    .select()
    .from(maintenanceRequests)
    .where(
      and(
        eq(maintenanceRequests.id, jobId),
        eq(maintenanceRequests.companyId, companyId),
        eq(maintenanceRequests.status, "pending_verification")
      )
    )
    .limit(1);

  if (!job) throw new Error("Job not found or not pending verification");

  if (action === "approve") {
    await db
      .update(maintenanceRequests)
      .set({
        status: "verified",
        verifiedAt: new Date(),
        verifiedByUserId,
        verificationNotes: notes,
      })
      .where(eq(maintenanceRequests.id, jobId));
  } else {
    await db
      .update(maintenanceRequests)
      .set({
        status: "disputed",
        verifiedByUserId,
        disputeNotes: notes,
        disputedAt: new Date(),
      })
      .where(eq(maintenanceRequests.id, jobId));
  }
}

// ─── Get jobs awaiting verification for a company ─────────────────────────
export async function getJobsPendingVerification(companyId: number) {
  const db = await getDb();
  if (!db) return [];

  return db
    .select({
      job: maintenanceRequests,
      property: {
        id: properties.id,
        name: properties.name,
        address: properties.address,
        city: properties.city,
        state: properties.state,
      },
    })
    .from(maintenanceRequests)
    .innerJoin(properties, eq(maintenanceRequests.propertyId, properties.id))
    .where(
      and(
        eq(maintenanceRequests.companyId, companyId),
        inArray(maintenanceRequests.status, ["pending_verification", "disputed"])
      )
    )
    .orderBy(desc(maintenanceRequests.completedAt));
}

// ─── Get contractor's active/completed jobs ────────────────────────────────
export async function getContractorJobs(contractorProfileId: number) {
  const db = await getDb();
  if (!db) return [];

  return db
    .select({
      job: maintenanceRequests,
      property: {
        id: properties.id,
        name: properties.name,
        address: properties.address,
        city: properties.city,
        state: properties.state,
        zipCode: properties.zipCode,
      },
    })
    .from(maintenanceRequests)
    .innerJoin(properties, eq(maintenanceRequests.propertyId, properties.id))
    .where(
      and(
        eq(maintenanceRequests.assignedContractorId, contractorProfileId),
        inArray(maintenanceRequests.status, [
          "assigned",
          "in_progress",
          "pending_verification",
          "verified",
          "disputed",
          "paid",
        ])
      )
    )
    .orderBy(desc(maintenanceRequests.assignedAt));
}

// ─── Contractor Ratings ────────────────────────────────────────────────────
export async function createRating(data: InsertContractorRating) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(contractorRatings).values(data);
  return result[0].insertId;
}

export async function getRatingForJob(maintenanceRequestId: number, companyId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(contractorRatings)
    .where(and(eq(contractorRatings.maintenanceRequestId, maintenanceRequestId), eq(contractorRatings.companyId, companyId)))
    .limit(1);
  return result[0];
}

export async function getRatingsByContractor(contractorProfileId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: contractorRatings.id,
      stars: contractorRatings.stars,
      review: contractorRatings.review,
      createdAt: contractorRatings.createdAt,
      maintenanceRequestId: contractorRatings.maintenanceRequestId,
      companyName: companies.name,
      jobTitle: maintenanceRequests.title,
    })
    .from(contractorRatings)
    .leftJoin(companies, eq(contractorRatings.companyId, companies.id))
    .leftJoin(maintenanceRequests, eq(contractorRatings.maintenanceRequestId, maintenanceRequests.id))
    .where(eq(contractorRatings.contractorProfileId, contractorProfileId))
    .orderBy(desc(contractorRatings.createdAt));
}

export async function recalcContractorRating(contractorProfileId: number) {
  const db = await getDb();
  if (!db) return;
  const [result] = await db
    .select({ avg: sql<string>`AVG(stars)`, count: sql<number>`COUNT(*)` })
    .from(contractorRatings)
    .where(eq(contractorRatings.contractorProfileId, contractorProfileId));
  if (result) {
    const avg = parseFloat(result.avg ?? "0");
    await db.update(contractorProfiles)
      .set({ rating: avg.toFixed(2) })
      .where(eq(contractorProfiles.id, contractorProfileId));
  }
}

// ─── Job Comments ──────────────────────────────────────────────────────────────
export async function getJobComments(maintenanceRequestId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(jobComments)
    .where(eq(jobComments.maintenanceRequestId, maintenanceRequestId))
    .orderBy(jobComments.createdAt);
}

export async function addJobComment(data: InsertJobComment) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(jobComments).values(data);
  return result[0].insertId;
}
