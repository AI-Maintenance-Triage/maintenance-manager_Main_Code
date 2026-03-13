import { eq, and, desc, sql, inArray, or, isNull, isNotNull, count, gte, lte, avg, sum, ne, lt, gt } from "drizzle-orm";
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
  notifications, InsertNotification,
  subscriptionPlans, InsertSubscriptionPlan,
  pmsWebhookEvents,
  contractorInvites, InsertContractorInvite,
  promoCodes, InsertPromoCode,
  companyPromoRedemptions,
  platformAnnouncements, InsertPlatformAnnouncement,
  dismissedAnnouncements,
  featureFlags, InsertFeatureFlag,
  auditLog, InsertAuditLogEntry,
  accountSuspensions, InsertAccountSuspension,
  accountCredits, InsertAccountCredit,
  payoutHolds, InsertPayoutHold,
  activityEvents, InsertActivityEvent,
  maintenanceMode,
  companyPaymentMethods,
  pmsIntegrations, InsertPmsIntegration,
  passwordResetTokens, InsertPasswordResetToken,
  jobChangeHistory, InsertJobChangeHistory,
  propertyUnits, InsertPropertyUnit,
  companyUsers, InsertCompanyUser,
  companyInvitations, InsertCompanyInvitation,
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
      relationshipId: contractorCompanies.id,
      status: contractorCompanies.status,
      isTrusted: contractorCompanies.isTrusted,
      contractorProfileId: contractorProfiles.id,
      businessName: contractorProfiles.businessName,
      phone: contractorProfiles.phone,
      trades: contractorProfiles.trades,
      isAvailable: contractorProfiles.isAvailable,
      rating: contractorProfiles.rating,
      userName: users.name,
      userEmail: users.email,
      userId: users.id,
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

/** Ensures a contractor-company relationship exists (auto-roster on job completion).
 * If the relationship already exists, does nothing. If not, creates it as approved.
 */
export async function ensureContractorCompanyRelation(contractorProfileId: number, companyId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  // Check if relationship already exists
  const [existing] = await db
    .select({ id: contractorCompanies.id })
    .from(contractorCompanies)
    .where(and(
      eq(contractorCompanies.contractorProfileId, contractorProfileId),
      eq(contractorCompanies.companyId, companyId)
    ))
    .limit(1);
  if (existing) return; // Already in roster
  // Auto-create as approved (they already completed a job — no need for pending review)
  await db.insert(contractorCompanies).values({
    contractorProfileId,
    companyId,
    status: "approved",
    isTrusted: false, // Company must manually trust them
    invitedBy: "contractor", // They came via public board
  });
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

export async function setContractorTrusted(relationshipId: number, companyId: number, isTrusted: boolean) {
  const db = await getDb();
  if (!db) return;
  await db.update(contractorCompanies)
    .set({ isTrusted })
    .where(and(eq(contractorCompanies.id, relationshipId), eq(contractorCompanies.companyId, companyId)));
}

/** Returns the userId of the contractor for a given contractorCompanies relationship row */
export async function getContractorUserIdByRelationship(relationshipId: number): Promise<{ userId: number; companyId: number; contractorProfileId: number } | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const [row] = await db
    .select({
      userId: users.id,
      companyId: contractorCompanies.companyId,
      contractorProfileId: contractorCompanies.contractorProfileId,
    })
    .from(contractorCompanies)
    .innerJoin(contractorProfiles, eq(contractorCompanies.contractorProfileId, contractorProfiles.id))
    .innerJoin(users, eq(contractorProfiles.userId, users.id))
    .where(eq(contractorCompanies.id, relationshipId))
    .limit(1);
  return row;
}
/** Returns the set of companyIds that have marked this contractor as trusted */
export async function getTrustedCompanyIdsForContractor(contractorProfileId: number): Promise<number[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({ companyId: contractorCompanies.companyId })
    .from(contractorCompanies)
    .where(and(
      eq(contractorCompanies.contractorProfileId, contractorProfileId),
      eq(contractorCompanies.isTrusted, true)
    ));
  return rows.map((r) => r.companyId);
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
  // Join skillTiers so the frontend always gets the current effective tier name
  // (after a priority override, skillTierId is updated but aiSkillTier is not)
  const rows = await db
    .select({
      job: maintenanceRequests,
      effectiveSkillTierName: skillTiers.name,
    })
    .from(maintenanceRequests)
    .leftJoin(skillTiers, eq(maintenanceRequests.skillTierId, skillTiers.id))
    .where(and(...conditions))
    .orderBy(desc(maintenanceRequests.createdAt));
  // Flatten: merge effectiveSkillTierName into the job object for backwards compat
  return rows.map(r => ({
    ...r.job,
    effectiveSkillTierName: r.effectiveSkillTierName ?? r.job.aiSkillTier ?? null,
  }));
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

export async function deleteMaintenanceRequest(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(maintenanceRequests).where(eq(maintenanceRequests.id, id));
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

  // 1. Formal transaction records (Stripe-paid jobs)
  const paidTxns = await db
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
      stripePaymentIntentId: transactions.stripePaymentIntentId,
      jobTitle: maintenanceRequests.title,
      propertyName: properties.name,
    })
    .from(transactions)
    .leftJoin(maintenanceRequests, eq(transactions.maintenanceRequestId, maintenanceRequests.id))
    .leftJoin(properties, eq(maintenanceRequests.propertyId, properties.id))
    .where(eq(transactions.companyId, companyId))
    .orderBy(desc(transactions.createdAt));

  // 2. Verified/completed jobs that don't have a transaction record yet
  //    (payment was skipped — no Stripe setup, zero cost, etc.)
  const paidJobIds = new Set(paidTxns.map(t => t.maintenanceRequestId));
  const verifiedJobs = await db
    .select({
      id: maintenanceRequests.id,
      title: maintenanceRequests.title,
      status: maintenanceRequests.status,
      totalLaborCost: maintenanceRequests.totalLaborCost,
      totalPartsCost: maintenanceRequests.totalPartsCost,
      platformFee: maintenanceRequests.platformFee,
      totalCost: maintenanceRequests.totalCost,
      stripePaymentIntentId: maintenanceRequests.stripePaymentIntentId,
      paidAt: maintenanceRequests.paidAt,
      verifiedAt: maintenanceRequests.verifiedAt,
      createdAt: maintenanceRequests.createdAt,
      propertyName: properties.name,
    })
    .from(maintenanceRequests)
    .leftJoin(properties, eq(maintenanceRequests.propertyId, properties.id))
    .where(
      and(
        eq(maintenanceRequests.companyId, companyId),
        inArray(maintenanceRequests.status, ["verified", "paid", "payment_pending_ach", "pending_verification", "disputed"] as any[])
      )
    )
    .orderBy(desc(maintenanceRequests.createdAt));

  // Merge: add synthetic rows for verified jobs not already in paidTxns
  // Fetch parts receipts for all verified jobs in one batch
  const verifiedJobIds = verifiedJobs.filter(j => !paidJobIds.has(j.id)).map(j => j.id);
  let receiptsByJob: Map<number, number> = new Map();
  if (verifiedJobIds.length > 0) {
    const receipts = await db
      .select({
        maintenanceRequestId: partsReceipts.maintenanceRequestId,
        amount: partsReceipts.amount,
      })
      .from(partsReceipts)
      .where(inArray(partsReceipts.maintenanceRequestId, verifiedJobIds));
    for (const r of receipts) {
      const prev = receiptsByJob.get(r.maintenanceRequestId) ?? 0;
      receiptsByJob.set(r.maintenanceRequestId, prev + parseFloat(r.amount ?? "0"));
    }
  }

  const syntheticRows = verifiedJobs
    .filter(j => !paidJobIds.has(j.id))
    .map(j => {
      const laborCost = j.totalLaborCost ?? "0.00";
      // Use live parts receipts sum if available, fall back to stored field
      const livePartsCost = receiptsByJob.get(j.id) ?? 0;
      const partsCost = livePartsCost > 0
        ? livePartsCost.toFixed(2)
        : (j.totalPartsCost ?? "0.00");
      const platformFee = j.platformFee ?? "0.00";
      const totalCharged = j.totalCost ?? (parseFloat(laborCost) + parseFloat(partsCost) + parseFloat(platformFee)).toFixed(2);
      // Map job status to a transaction-like status
      let txStatus: "pending" | "escrow" | "captured" | "paid_out" | "refunded" | "failed" = "pending";
      if (j.status === "paid") txStatus = "captured";
      else if (j.status === "payment_pending_ach") txStatus = "escrow";
      return {
        id: -(j.id), // negative id to distinguish from real transactions
        maintenanceRequestId: j.id,
        laborCost,
        partsCost,
        platformFee,
        totalCharged,
        contractorPayout: laborCost,
        status: txStatus,
        paidAt: j.paidAt,
        createdAt: j.verifiedAt ?? j.createdAt,
        stripePaymentIntentId: j.stripePaymentIntentId,
        jobTitle: j.title,
        propertyName: j.propertyName,
        // Extra field to signal this is a synthetic (unpaid) record
        paymentPending: true,
      };
    });

  return [...paidTxns, ...syntheticRows].sort(
    (a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime()
  );
}

export async function getTransactionsByContractor(contractorProfileId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
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
      stripePaymentIntentId: transactions.stripePaymentIntentId,
      jobTitle: maintenanceRequests.title,
      propertyName: properties.name,
    })
    .from(transactions)
    .leftJoin(maintenanceRequests, eq(transactions.maintenanceRequestId, maintenanceRequests.id))
    .leftJoin(properties, eq(maintenanceRequests.propertyId, properties.id))
    .where(eq(transactions.contractorProfileId, contractorProfileId))
    .orderBy(desc(transactions.createdAt));
}

export async function getTransactionByJob(maintenanceRequestId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(transactions)
    .where(eq(transactions.maintenanceRequestId, maintenanceRequestId))
    .orderBy(desc(transactions.createdAt))
    .limit(1);
  return rows[0] ?? null;
}
export async function getCompanyExpenseReport(companyId: number) {
  const db = await getDb();
  if (!db) return { transactions: [], monthlyTotals: [], propertyTotals: [] };

  // All transactions for this company
  const paidTxns = await db
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

  // Also include verified/completed jobs without a transaction record
  const paidJobIds = new Set(paidTxns.map(t => t.maintenanceRequestId));
  const verifiedJobs = await db
    .select({
      id: maintenanceRequests.id,
      title: maintenanceRequests.title,
      status: maintenanceRequests.status,
      totalLaborCost: maintenanceRequests.totalLaborCost,
      totalPartsCost: maintenanceRequests.totalPartsCost,
      platformFee: maintenanceRequests.platformFee,
      totalCost: maintenanceRequests.totalCost,
      paidAt: maintenanceRequests.paidAt,
      verifiedAt: maintenanceRequests.verifiedAt,
      createdAt: maintenanceRequests.createdAt,
      propertyId: maintenanceRequests.propertyId,
      propertyName: properties.name,
      propertyAddress: properties.address,
    })
    .from(maintenanceRequests)
    .leftJoin(properties, eq(maintenanceRequests.propertyId, properties.id))
    .where(
      and(
        eq(maintenanceRequests.companyId, companyId),
        inArray(maintenanceRequests.status, ["verified", "paid", "payment_pending_ach", "pending_verification", "disputed"] as any[])
      )
    );

  const unpaidJobIds = verifiedJobs.filter(j => !paidJobIds.has(j.id)).map(j => j.id);
  let receiptsByJobExp: Map<number, number> = new Map();
  if (unpaidJobIds.length > 0) {
    const receipts = await db.select({ maintenanceRequestId: partsReceipts.maintenanceRequestId, amount: partsReceipts.amount })
      .from(partsReceipts).where(inArray(partsReceipts.maintenanceRequestId, unpaidJobIds));
    for (const r of receipts) {
      receiptsByJobExp.set(r.maintenanceRequestId, (receiptsByJobExp.get(r.maintenanceRequestId) ?? 0) + parseFloat(r.amount ?? "0"));
    }
  }

  const syntheticTxns = verifiedJobs
    .filter(j => !paidJobIds.has(j.id))
    .map(j => {
      const laborCost = j.totalLaborCost ?? "0.00";
      const livePartsCost = receiptsByJobExp.get(j.id) ?? 0;
      const partsCost = livePartsCost > 0 ? livePartsCost.toFixed(2) : (j.totalPartsCost ?? "0.00");
      const platformFee = j.platformFee ?? "0.00";
      const totalCharged = j.totalCost ?? (parseFloat(laborCost) + parseFloat(partsCost) + parseFloat(platformFee)).toFixed(2);
      return {
        id: -(j.id),
        maintenanceRequestId: j.id,
        laborCost,
        partsCost,
        platformFee,
        totalCharged,
        contractorPayout: laborCost,
        status: "pending" as const,
        paidAt: j.paidAt,
        createdAt: j.verifiedAt ?? j.createdAt,
        jobTitle: j.title,
        propertyId: j.propertyId,
        propertyName: j.propertyName,
        propertyAddress: j.propertyAddress,
      };
    });

  const txns = [...paidTxns, ...syntheticTxns].sort(
    (a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime()
  );

  // Monthly totals (last 12 months) — computed from merged txns array
  const twelveMonthsAgo = Date.now() - 12 * 30 * 24 * 60 * 60 * 1000;
  const monthlyMap = new Map<string, { total: number; laborTotal: number; partsTotal: number; feeTotal: number; jobCount: number }>();
  for (const t of txns) {
    const ts = t.createdAt ? new Date(t.createdAt).getTime() : 0;
    if (ts < twelveMonthsAgo) continue;
    const month = new Date(t.createdAt!).toISOString().slice(0, 7); // 'YYYY-MM'
    const entry = monthlyMap.get(month) ?? { total: 0, laborTotal: 0, partsTotal: 0, feeTotal: 0, jobCount: 0 };
    entry.total += parseFloat(String(t.totalCharged ?? "0"));
    entry.laborTotal += parseFloat(String(t.laborCost ?? "0"));
    entry.partsTotal += parseFloat(String(t.partsCost ?? "0"));
    entry.feeTotal += parseFloat(String(t.platformFee ?? "0"));
    entry.jobCount += 1;
    monthlyMap.set(month, entry);
  }
  const monthlyTotals = Array.from(monthlyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => ({
      month,
      total: v.total.toFixed(2),
      laborTotal: v.laborTotal.toFixed(2),
      partsTotal: v.partsTotal.toFixed(2),
      feeTotal: v.feeTotal.toFixed(2),
      jobCount: v.jobCount,
    }));

  // Per-property totals — computed from merged txns array
  type PropKey = string;
  const propMap = new Map<PropKey, { propertyId: number | null; propertyName: string | null; propertyAddress: string | null; total: number; jobCount: number }>();
  for (const t of txns) {
    const key = String((t as any).propertyId ?? "unknown");
    const entry = propMap.get(key) ?? {
      propertyId: (t as any).propertyId ?? null,
      propertyName: t.propertyName ?? null,
      propertyAddress: (t as any).propertyAddress ?? null,
      total: 0,
      jobCount: 0,
    };
    entry.total += parseFloat(String(t.totalCharged ?? "0"));
    entry.jobCount += 1;
    propMap.set(key, entry);
  }
  const propertyTotals = Array.from(propMap.values())
    .sort((a, b) => b.total - a.total)
    .map(v => ({ ...v, total: v.total.toFixed(2) }));

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
  if (!db) return { totalJobs: 0, openJobs: 0, inProgressJobs: 0, completedJobs: 0, totalSpent: "0.00", activeContractors: 0, trustedContractors: 0, totalProperties: 0 };

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

  const [trustedCount] = await db.select({
    count: sql<number>`COUNT(*)`,
  }).from(contractorCompanies).where(and(
    eq(contractorCompanies.companyId, companyId),
    eq(contractorCompanies.status, "approved"),
    eq(contractorCompanies.isTrusted, true)
  ));

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
    trustedContractors: trustedCount?.count ?? 0,
    totalProperties: propertyCount?.count ?? 0,
  };
}

export async function getPlatformStats() {
  const db = await getDb();
  if (!db) return { totalCompanies: 0, totalContractors: 0, totalJobs: 0, totalRevenue: "0.00" };

  const [companyCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(companies);
  const [contractorCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(contractorProfiles);
  const [jobCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(maintenanceRequests);

  // Platform revenue = sum of platform fees from captured/paid_out transactions
  const [revenue] = await db
    .select({ total: sql<string>`COALESCE(SUM(platformFee), 0)` })
    .from(transactions)
    .where(sql`status IN ('captured', 'paid_out')`);

  // Total charged to companies (gross)
  const [gross] = await db
    .select({ total: sql<string>`COALESCE(SUM(totalCharged), 0)` })
    .from(transactions)
    .where(sql`status IN ('captured', 'paid_out')`);

  // Paid jobs count
  const [paidJobCount] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(maintenanceRequests)
    .where(sql`status IN ('paid', 'verified')`);

  // Monthly revenue for last 12 months
  const monthlyRevenue = await db
    .select({
      month: sql<string>`DATE_FORMAT(createdAt, '%Y-%m')`,
      revenue: sql<string>`COALESCE(SUM(platformFee), 0)`,
      gross: sql<string>`COALESCE(SUM(totalCharged), 0)`,
      jobCount: sql<number>`COUNT(*)`,
    })
    .from(transactions)
    .where(sql`status IN ('captured', 'paid_out') AND createdAt >= DATE_SUB(NOW(), INTERVAL 12 MONTH)`)
    .groupBy(sql`DATE_FORMAT(createdAt, '%Y-%m')`);

  // Top 10 companies by total spend
  const topCompanies = await db
    .select({
      companyId: transactions.companyId,
      companyName: companies.name,
      totalSpend: sql<string>`COALESCE(SUM(${transactions.totalCharged}), 0)`,
      platformFees: sql<string>`COALESCE(SUM(${transactions.platformFee}), 0)`,
      jobCount: sql<number>`COUNT(*)`,
    })
    .from(transactions)
    .innerJoin(companies, eq(transactions.companyId, companies.id))
    .where(sql`${transactions.status} IN ('captured', 'paid_out')`)
    .groupBy(transactions.companyId, companies.name)
    .orderBy(sql`SUM(${transactions.totalCharged}) DESC`)
    .limit(10);

  // Average fee per paid job
  const paidJobsWithFee = paidJobCount?.count ?? 0;
  const avgFeePerJob = paidJobsWithFee > 0
    ? (parseFloat(revenue?.total ?? "0") / paidJobsWithFee).toFixed(2)
    : "0.00";

  // Month-over-month growth (last 2 months)
  const sorted = [...monthlyRevenue].sort((a, b) => a.month.localeCompare(b.month));
  const lastMonth = sorted[sorted.length - 1]?.revenue ?? "0";
  const prevMonth = sorted[sorted.length - 2]?.revenue ?? "0";
  const momGrowth = parseFloat(prevMonth) > 0
    ? (((parseFloat(lastMonth) - parseFloat(prevMonth)) / parseFloat(prevMonth)) * 100).toFixed(1)
    : null;

  return {
    totalCompanies: companyCount?.count ?? 0,
    totalContractors: contractorCount?.count ?? 0,
    totalJobs: jobCount?.count ?? 0,
    paidJobs: paidJobsWithFee,
    totalRevenue: revenue?.total ?? "0.00",
    totalGross: gross?.total ?? "0.00",
    avgFeePerJob,
    momGrowth,
    monthlyRevenue,
    topCompanies,
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

// ─── Email Preferences ───────────────────────────────────────────────────────
export type EmailPreferences = {
  jobAssigned?: boolean;
  jobSubmitted?: boolean;
  jobPaid?: boolean;
  newComment?: boolean;
  jobDisputed?: boolean;
  welcome?: boolean;
};

export async function getEmailPreferences(userId: number): Promise<EmailPreferences> {
  const db = await getDb();
  if (!db) return {};
  const [user] = await db.select({ emailPreferences: users.emailPreferences }).from(users).where(eq(users.id, userId));
  return (user?.emailPreferences as EmailPreferences) ?? {};
}

export async function updateEmailPreferences(userId: number, prefs: EmailPreferences) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ emailPreferences: prefs }).where(eq(users.id, userId));
}

// Helper: check if a user has opted out of a specific email type (default = opted IN)
export async function isEmailEnabled(userId: number, type: keyof EmailPreferences): Promise<boolean> {
  const prefs = await getEmailPreferences(userId);
  return prefs[type] !== false; // undefined = enabled, false = disabled
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

  // If contractor is unavailable, return empty board
  if (contractor.isAvailable === false) return [];

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
        eq(maintenanceRequests.status, "open"),
        eq(maintenanceRequests.jobBoardVisibility, "public")
      )
    )
    .orderBy(desc(maintenanceRequests.createdAt));

  // Enrich each job with company paid-job count as a trust signal
  const enriched = await Promise.all(jobs.map(async (row) => {
    const [countRow] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(maintenanceRequests)
      .where(and(
        eq(maintenanceRequests.companyId, row.company.id),
        eq(maintenanceRequests.status, "paid")
      ));
    return { ...row, company: { ...row.company, paidJobCount: countRow?.count ?? 0 } };
  }));

  // Filter by service area if contractor has coordinates
  if (contractorLat !== null && contractorLng !== null) {
    return enriched
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

/** Lists private board jobs from all companies that have marked this contractor as trusted */
export async function listPrivateJobBoardForContractor(contractorProfileId: number) {
  const db = await getDb();
  if (!db) return [];
  // Get contractor's location and radius
  const [contractor] = await db
    .select()
    .from(contractorProfiles)
    .where(eq(contractorProfiles.id, contractorProfileId))
    .limit(1);
  if (!contractor) return [];
  if (contractor.isAvailable === false) return [];
  // Find all companies that trust this contractor
  const trustedCompanyIds = await getTrustedCompanyIdsForContractor(contractorProfileId);
  if (trustedCompanyIds.length === 0) return [];
  const contractorLat = contractor.latitude ? parseFloat(String(contractor.latitude)) : null;
  const contractorLng = contractor.longitude ? parseFloat(String(contractor.longitude)) : null;
  const radiusMiles = contractor.serviceRadiusMiles ?? 25;
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
        eq(maintenanceRequests.status, "open"),
        eq(maintenanceRequests.jobBoardVisibility, "private"),
        inArray(maintenanceRequests.companyId, trustedCompanyIds)
      )
    )
    .orderBy(desc(maintenanceRequests.createdAt));
  const enriched = await Promise.all(jobs.map(async (row) => {
    const [countRow] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(maintenanceRequests)
      .where(and(
        eq(maintenanceRequests.companyId, row.company.id),
        eq(maintenanceRequests.status, "paid")
      ));
    return { ...row, company: { ...row.company, paidJobCount: countRow?.count ?? 0 } };
  }));
  // Filter by service area if contractor has coordinates
  if (contractorLat !== null && contractorLng !== null) {
    return enriched
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

  const rows = await db
    .select({
      job: maintenanceRequests,
      property: {
        id: properties.id,
        name: properties.name,
        address: properties.address,
        city: properties.city,
        state: properties.state,
        zipCode: properties.zipCode,
        latitude: properties.latitude,
        longitude: properties.longitude,
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

  // Enrich each row with the company's geofence settings
  const settingsCache = new Map<number, { geofenceRadiusFeet: number; billableTimePolicy: string }>();
  const enriched = await Promise.all(rows.map(async (row) => {
    const companyId = row.job.companyId;
    if (!settingsCache.has(companyId)) {
      const s = await getCompanySettings(companyId);
      settingsCache.set(companyId, {
        geofenceRadiusFeet: s?.geofenceRadiusFeet ?? 500,
        billableTimePolicy: s?.billableTimePolicy ?? "on_site_only",
      });
    }
    return { ...row, companySettings: settingsCache.get(companyId)! };
  }));
  return enriched;
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

// ─── Notifications ─────────────────────────────────────────────────────────
export async function createNotification(data: InsertNotification) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(notifications).values(data);
  return result[0].insertId;
}

export async function getNotificationsForUser(userId: number, limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

export async function getUnreadCount(userId: number) {
  const db = await getDb();
  if (!db) return 0;
  const [result] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));
  return result?.count ?? 0;
}

export async function markNotificationRead(id: number, userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(notifications)
    .set({ isRead: true })
    .where(and(eq(notifications.id, id), eq(notifications.userId, userId)));
}

export async function markAllNotificationsRead(userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(notifications)
    .set({ isRead: true })
    .where(eq(notifications.userId, userId));
}

// ─── Notification Targeting Helpers ───────────────────────────────────────
export async function getCompanyAdminUserIds(companyId: number): Promise<number[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.companyId, companyId), eq(users.role, "company_admin")));
  return rows.map(r => r.id);
}

export async function getUserIdByContractorProfileId(contractorProfileId: number): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.contractorProfileId, contractorProfileId))
    .limit(1);
  return row?.id ?? null;
}

// ─── Email helpers: get user contact info for transactional emails ─────────
export async function getCompanyAdminEmails(companyId: number): Promise<Array<{ id: number; name: string | null; email: string | null }>> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(and(eq(users.companyId, companyId), eq(users.role, "company_admin")));
}

export async function getUserEmailByContractorProfileId(contractorProfileId: number): Promise<{ id: number; name: string | null; email: string | null } | null> {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(eq(users.contractorProfileId, contractorProfileId))
    .limit(1);
  return row ?? null;
}

// ─── Get property by ID only (for email notifications, no company check) ──
export async function getPropertyByIdOnly(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const [row] = await db.select().from(properties).where(eq(properties.id, id)).limit(1);
  return row;
}

// ─── Dispute resubmission ──────────────────────────────────────────────────
export async function resubmitDisputedJob(
  jobId: number,
  contractorProfileId: number,
  responseNote: string
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(maintenanceRequests)
    .set({
      status: "pending_verification",
      disputeResponseNote: responseNote,
      resubmittedAt: new Date(),
    })
    .where(
      and(
        eq(maintenanceRequests.id, jobId),
        eq(maintenanceRequests.assignedContractorId, contractorProfileId),
        eq(maintenanceRequests.status, "disputed")
      )
    );
}

// ─── Password Reset Tokens ─────────────────────────────────────────────────
export async function setPasswordResetToken(userId: number, token: string, expiresAt: Date) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(users).set({
    resetPasswordToken: token,
    resetPasswordExpiry: expiresAt,
  }).where(eq(users.id, userId));
}

export async function getUserByResetToken(token: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users)
    .where(eq(users.resetPasswordToken, token))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function clearPasswordResetToken(userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({
    resetPasswordToken: null,
    resetPasswordExpiry: null,
  }).where(eq(users.id, userId));
}

// ─── Subscription Plans ────────────────────────────────────────────────────
export async function listSubscriptionPlans() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(subscriptionPlans).orderBy(subscriptionPlans.sortOrder, subscriptionPlans.createdAt);
}

export async function getSubscriptionPlanById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function createSubscriptionPlan(data: InsertSubscriptionPlan) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(subscriptionPlans).values(data);
  return result[0].insertId;
}

export async function updateSubscriptionPlan(id: number, data: Partial<InsertSubscriptionPlan>) {
  const db = await getDb();
  if (!db) return;
  await db.update(subscriptionPlans).set(data).where(eq(subscriptionPlans.id, id));
}

export async function deleteSubscriptionPlan(id: number) {
  const db = await getDb();
  if (!db) return;
  // Unassign from companies first
  await db.update(companies).set({ planId: null }).where(eq(companies.planId, id));
  // Unassign from contractor profiles
  await db.update(contractorProfiles).set({ planId: null }).where(eq(contractorProfiles.planId, id));
  await db.delete(subscriptionPlans).where(eq(subscriptionPlans.id, id));
}

/**
 * Returns the number of active subscribers (companies + contractors) for each plan.
 * Used to prevent deleting plans with active subscribers and to show subscriber counts.
 */
export async function countSubscribersPerPlan(): Promise<Record<number, { companies: number; contractors: number; total: number }>> {
  const db = await getDb();
  if (!db) return {};
  const companyCounts = await db
    .select({ planId: companies.planId, cnt: count() })
    .from(companies)
    .where(isNotNull(companies.planId))
    .groupBy(companies.planId);
  const contractorCounts = await db
    .select({ planId: contractorProfiles.planId, cnt: count() })
    .from(contractorProfiles)
    .where(isNotNull(contractorProfiles.planId))
    .groupBy(contractorProfiles.planId);
  const result: Record<number, { companies: number; contractors: number; total: number }> = {};
  for (const row of companyCounts) {
    if (row.planId == null) continue;
    if (!result[row.planId]) result[row.planId] = { companies: 0, contractors: 0, total: 0 };
    result[row.planId].companies = Number(row.cnt);
    result[row.planId].total += Number(row.cnt);
  }
  for (const row of contractorCounts) {
    if (row.planId == null) continue;
    if (!result[row.planId]) result[row.planId] = { companies: 0, contractors: 0, total: 0 };
    result[row.planId].contractors = Number(row.cnt);
    result[row.planId].total += Number(row.cnt);
  }
  return result;
}

export async function assignPlanToCompany(companyId: number, planId: number | null) {
  const db = await getDb();
  if (!db) return;
  await db.update(companies).set({ planId }).where(eq(companies.id, companyId));
}

export async function getCompanyWithPlan(companyId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select({
      company: companies,
      plan: subscriptionPlans,
    })
    .from(companies)
    .leftJoin(subscriptionPlans, eq(companies.planId, subscriptionPlans.id))
    .where(eq(companies.id, companyId))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function listCompaniesWithPlans() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      company: companies,
      plan: subscriptionPlans,
    })
    .from(companies)
    .leftJoin(subscriptionPlans, eq(companies.planId, subscriptionPlans.id))
    .orderBy(desc(companies.createdAt));
}

// ─── Plan Limit Helpers ──────────────────────────────────────────────────────

/**
 * Resolve the effective plan for a company, including any price override.
 * Returns null if no plan is assigned.
 */
export async function getEffectivePlanForCompany(companyId: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db
    .select({ company: companies, plan: subscriptionPlans })
    .from(companies)
    .leftJoin(subscriptionPlans, eq(companies.planId, subscriptionPlans.id))
    .where(eq(companies.id, companyId))
    .limit(1);
  if (!result.length || !result[0].plan) return null;
  const { company, plan } = result[0];
  return {
    ...plan,
    // Apply per-company price override if set
    effectiveMonthlyPrice: company.planPriceOverride
      ? parseFloat(company.planPriceOverride)
      : parseFloat(plan.priceMonthly ?? "0"),
    planNotes: company.planNotes ?? null,
    // Apply per-company fee overrides (highest priority — overrides plan defaults)
    platformFeePercent: company.feeOverridePercent != null
      ? company.feeOverridePercent
      : plan.platformFeePercent,
    perListingFeeEnabled: company.feeOverridePerListingEnabled != null
      ? company.feeOverridePerListingEnabled
      : plan.perListingFeeEnabled,
    perListingFeeAmount: company.feeOverridePerListingAmount != null
      ? company.feeOverridePerListingAmount
      : plan.perListingFeeAmount,
    // Expose override flags so UI can show "custom" badge
    hasFeeOverride: company.feeOverridePercent != null || company.feeOverridePerListingEnabled != null || company.feeOverridePerListingAmount != null,
  };
}

/** Count how many properties a company currently has */
export async function countPropertiesForCompany(companyId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const result = await db
    .select({ cnt: count() })
    .from(properties)
    .where(eq(properties.companyId, companyId));
  return result[0]?.cnt ?? 0;
}

/** Count how many approved contractors a company has linked */
export async function countApprovedContractorsForCompany(companyId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const result = await db
    .select({ cnt: count() })
    .from(contractorCompanies)
    .where(
      and(
        eq(contractorCompanies.companyId, companyId),
        eq(contractorCompanies.status, "approved")
      )
    );
  return result[0]?.cnt ?? 0;
}

/** Count how many maintenance requests a company has created this calendar month */
export async function countJobsThisMonthForCompany(companyId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const result = await db
    .select({ cnt: count() })
    .from(maintenanceRequests)
    .where(
      and(
        eq(maintenanceRequests.companyId, companyId),
        gte(maintenanceRequests.createdAt, startOfMonth)
      )
    );
  return result[0]?.cnt ?? 0;
}

// ─── Contractor Plan Helpers ─────────────────────────────────────────────────

/** Get the effective plan for a contractor (resolves planId → plan record) */
export async function getEffectivePlanForContractor(contractorProfileId: number) {
  const db = await getDb();
  if (!db) return null;
  const profiles = await db
    .select()
    .from(contractorProfiles)
    .where(eq(contractorProfiles.id, contractorProfileId))
    .limit(1);
  const profile = profiles[0];
  if (!profile || !profile.planId) return null;
  const plans = await db
    .select()
    .from(subscriptionPlans)
    .where(eq(subscriptionPlans.id, profile.planId))
    .limit(1);
  const plan = plans[0];
  if (!plan) return null;
  return {
    ...plan,
    effectivePrice: profile.planPriceOverride != null
      ? parseFloat(profile.planPriceOverride)
      : parseFloat(plan.priceMonthly ?? "0"),
    planNotes: profile.planNotes ?? null,
  };
}

/** Count how many active (non-completed) jobs a contractor currently has */
export async function countActiveJobsForContractor(contractorProfileId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const result = await db
    .select({ cnt: count() })
    .from(maintenanceRequests)
    .where(
      and(
        eq(maintenanceRequests.assignedContractorId, contractorProfileId),
        inArray(maintenanceRequests.status, ["assigned", "in_progress", "pending_verification"])
      )
    );
  return result[0]?.cnt ?? 0;
}

/** Count how many distinct companies a contractor is approved with */
export async function countApprovedCompaniesForContractor(contractorProfileId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const result = await db
    .select({ cnt: count() })
    .from(contractorCompanies)
    .where(
      and(
        eq(contractorCompanies.contractorProfileId, contractorProfileId),
        eq(contractorCompanies.status, "approved")
      )
    );
  return result[0]?.cnt ?? 0;
}

/** Assign a contractor-type plan to a contractor profile */
export async function assignContractorPlan(
  contractorProfileId: number,
  planId: number | null,
  planPriceOverride: string | null,
  planNotes: string | null,
  planStatus?: string,
  planAssignedAt?: number | null,
  planExpiresAt?: number | null
) {
  const db = await getDb();
  if (!db) return;
  const updateData: Record<string, unknown> = { planId, planPriceOverride, planNotes };
  if (planStatus !== undefined) updateData.planStatus = planStatus;
  if (planAssignedAt !== undefined) updateData.planAssignedAt = planAssignedAt;
  if (planExpiresAt !== undefined) updateData.planExpiresAt = planExpiresAt;
  await db
    .update(contractorProfiles)
    .set(updateData as any)
    .where(eq(contractorProfiles.id, contractorProfileId));
}

/** List all subscription plans filtered by planType */
export async function listSubscriptionPlansByType(planType: "company" | "contractor") {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(subscriptionPlans)
    .where(eq(subscriptionPlans.planType, planType))
    .orderBy(subscriptionPlans.sortOrder, subscriptionPlans.name);
}

/** Returns the free contractor plan (priceMonthly=0, planType="contractor"), or null if none exists. */
export async function getFreeContractorPlan() {
  const db = await getDb();
  if (!db) return null;
  const result = await db
    .select()
    .from(subscriptionPlans)
    .where(and(eq(subscriptionPlans.planType, "contractor"), eq(subscriptionPlans.priceMonthly, "0.00")))
    .limit(1);
  return result[0] ?? null;
}

// ─── Plan Feature Enforcement Helpers ────────────────────────────────────────

/**
 * Returns the effective plan for a company, but only if the plan is active (not expired/canceled).
 * Returns null if no plan, no planId, or plan is expired/canceled.
 */
export async function getActivePlanForCompany(companyId: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db
    .select({ company: companies, plan: subscriptionPlans })
    .from(companies)
    .leftJoin(subscriptionPlans, eq(companies.planId, subscriptionPlans.id))
    .where(eq(companies.id, companyId))
    .limit(1);
  if (!result.length || !result[0].plan) return null;
  const { company, plan } = result[0];
  // Check plan lifecycle status
  const now = Date.now();
  if (company.planStatus === "expired" || company.planStatus === "canceled") return null;
  if (company.planExpiresAt && company.planExpiresAt < now) return null;
  return {
    ...plan,
    effectiveMonthlyPrice: company.planPriceOverride
      ? parseFloat(company.planPriceOverride)
      : parseFloat(plan.priceMonthly ?? "0"),
    planStatus: company.planStatus,
    planNotes: company.planNotes ?? null,
  };
}

/**
 * Returns the effective plan for a contractor, but only if active (not expired/canceled).
 */
export async function getActivePlanForContractor(contractorProfileId: number) {
  const db = await getDb();
  if (!db) return null;
  const profiles = await db
    .select()
    .from(contractorProfiles)
    .where(eq(contractorProfiles.id, contractorProfileId))
    .limit(1);
  const profile = profiles[0];
  if (!profile || !profile.planId) return null;
  const now = Date.now();
  if (profile.planStatus === "expired" || profile.planStatus === "canceled") return null;
  if (profile.planExpiresAt && profile.planExpiresAt < now) return null;
  const plans = await db
    .select()
    .from(subscriptionPlans)
    .where(eq(subscriptionPlans.id, profile.planId))
    .limit(1);
  const plan = plans[0];
  if (!plan) return null;
  return {
    ...plan,
    effectivePrice: profile.planPriceOverride != null
      ? parseFloat(profile.planPriceOverride)
      : parseFloat(plan.priceMonthly ?? "0"),
    planStatus: profile.planStatus,
    planNotes: profile.planNotes ?? null,
  };
}

/**
 * Check if a company's active plan has a specific feature enabled.
 * Returns true if: no plan assigned (no restrictions), OR plan has the feature enabled.
 * Returns false only if a plan is assigned AND the feature is explicitly disabled.
 */
export async function companyHasPlanFeature(
  companyId: number,
  feature: keyof NonNullable<typeof subscriptionPlans.$inferSelect["features"]>
): Promise<boolean> {
  const plan = await getActivePlanForCompany(companyId);
  if (!plan) return true; // No plan = no restrictions
  const featureValue = (plan.features as Record<string, unknown> | null)?.[feature as string];
  if (featureValue === undefined || featureValue === null) return true; // Feature not configured = allowed
  return featureValue === true;
}

/**
 * Check if a contractor's active plan has a specific feature enabled.
 */
export async function contractorHasPlanFeature(
  contractorProfileId: number,
  feature: keyof NonNullable<typeof subscriptionPlans.$inferSelect["features"]>
): Promise<boolean> {
  const plan = await getActivePlanForContractor(contractorProfileId);
  if (!plan) return true; // No plan = no restrictions
  const featureValue = (plan.features as Record<string, unknown> | null)?.[feature as string];
  if (featureValue === undefined || featureValue === null) return true;
  return featureValue === true;
}

// ─── Trial expiry helpers ─────────────────────────────────────────────────

/**
 * Find companies whose trial expires within the next N days (for warning emails).
 * Returns company + user email for notification.
 */
export async function getCompaniesExpiringInDays(days: number) {
  const db = await getDb();
  if (!db) return [];
  const now = Date.now();
  const windowEnd = now + days * 24 * 60 * 60 * 1000;
  const windowStart = now + (days - 1) * 24 * 60 * 60 * 1000;
  const rows = await db
    .select({
      companyId: companies.id,
      companyName: companies.name,
      planId: companies.planId,
      planStatus: companies.planStatus,
      planExpiresAt: companies.planExpiresAt,
      userEmail: users.email,
      userName: users.name,
    })
    .from(companies)
    .innerJoin(users, and(eq(users.companyId, companies.id), eq(users.role, "company_admin")))
    .where(
      and(
        eq(companies.planStatus, "trialing"),
        gte(companies.planExpiresAt, windowStart),
        sql`${companies.planExpiresAt} <= ${windowEnd}`
      )
    );
  return rows;
}

/**
 * Find companies whose trial expires today (planExpiresAt < now and still trialing).
 */
export async function getExpiredTrialCompanies() {
  const db = await getDb();
  if (!db) return [];
  const now = Date.now();
  const rows = await db
    .select({
      companyId: companies.id,
      companyName: companies.name,
      planId: companies.planId,
      planStatus: companies.planStatus,
      planExpiresAt: companies.planExpiresAt,
      userEmail: users.email,
      userName: users.name,
    })
    .from(companies)
    .innerJoin(users, and(eq(users.companyId, companies.id), eq(users.role, "company_admin")))
    .where(
      and(
        eq(companies.planStatus, "trialing"),
        sql`${companies.planExpiresAt} < ${now}`
      )
    );
  return rows;
}

/**
 * Find contractors whose trial expires within the next N days.
 */
export async function getContractorsExpiringInDays(days: number) {
  const db = await getDb();
  if (!db) return [];
  const now = Date.now();
  const windowEnd = now + days * 24 * 60 * 60 * 1000;
  const windowStart = now + (days - 1) * 24 * 60 * 60 * 1000;
  const rows = await db
    .select({
      contractorProfileId: contractorProfiles.id,
      contractorName: contractorProfiles.businessName,
      planId: contractorProfiles.planId,
      planStatus: contractorProfiles.planStatus,
      planExpiresAt: contractorProfiles.planExpiresAt,
      userEmail: users.email,
      userName: users.name,
    })
    .from(contractorProfiles)
    .innerJoin(users, eq(users.id, contractorProfiles.userId))
    .where(
      and(
        eq(contractorProfiles.planStatus, "trialing"),
        gte(contractorProfiles.planExpiresAt, windowStart),
        sql`${contractorProfiles.planExpiresAt} <= ${windowEnd}`
      )
    );
  return rows;
}

/**
 * Find contractors whose trial has expired (planExpiresAt < now and still trialing).
 */
export async function getExpiredTrialContractors() {
  const db = await getDb();
  if (!db) return [];
  const now = Date.now();
  const rows = await db
    .select({
      contractorProfileId: contractorProfiles.id,
      contractorName: contractorProfiles.businessName,
      planId: contractorProfiles.planId,
      planStatus: contractorProfiles.planStatus,
      planExpiresAt: contractorProfiles.planExpiresAt,
      userEmail: users.email,
      userName: users.name,
    })
    .from(contractorProfiles)
    .innerJoin(users, eq(users.id, contractorProfiles.userId))
    .where(
      and(
        eq(contractorProfiles.planStatus, "trialing"),
        sql`${contractorProfiles.planExpiresAt} < ${now}`
      )
    );
  return rows;
}

/**
 * Mark a company's plan as expired.
 */
export async function markCompanyPlanExpired(companyId: number) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(companies)
    .set({ planStatus: "expired" })
    .where(eq(companies.id, companyId));
}

/**
 * Mark a contractor's plan as expired.
 */
export async function markContractorPlanExpired(contractorProfileId: number) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(contractorProfiles)
    .set({ planStatus: "expired" })
    .where(eq(contractorProfiles.id, contractorProfileId));
}

/**
 * Move a company's trial to grace_period status (3-day buffer before lock).
 */
export async function markCompanyTrialGracePeriod(companyId: number, graceEndsAt: number) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(companies)
    .set({ planStatus: "grace_period", planGraceEndsAt: graceEndsAt } as any)
    .where(eq(companies.id, companyId));
}

/**
 * Move a contractor's trial to grace_period status.
 */
export async function markContractorTrialGracePeriod(contractorProfileId: number, graceEndsAt: number) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(contractorProfiles)
    .set({ planStatus: "grace_period", planGraceEndsAt: graceEndsAt } as any)
    .where(eq(contractorProfiles.id, contractorProfileId));
}

/**
 * Lock a company account after grace period expires.
 */
export async function markCompanyPlanLocked(companyId: number) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(companies)
    .set({ planStatus: "locked" } as any)
    .where(eq(companies.id, companyId));
}

/**
 * Lock a contractor account after grace period expires.
 */
export async function markContractorPlanLocked(contractorProfileId: number) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(contractorProfiles)
    .set({ planStatus: "locked" } as any)
    .where(eq(contractorProfiles.id, contractorProfileId));
}

/**
 * Get companies whose grace period has ended (planStatus = grace_period AND planGraceEndsAt < now).
 */
export async function getCompaniesGracePeriodExpired() {
  const db = await getDb();
  if (!db) return [];
  const nowMs = Date.now();
  const rows = await db
    .select({
      companyId: companies.id,
      planGraceEndsAt: companies.planGraceEndsAt,
    })
    .from(companies)
    .where(
      and(
        eq(companies.planStatus, "grace_period" as any),
        sql`${companies.planGraceEndsAt} < ${nowMs}`
      )
    );
  return rows;
}

/**
 * Get contractors whose grace period has ended.
 */
export async function getContractorsGracePeriodExpired() {
  const db = await getDb();
  if (!db) return [];
  const nowMs = Date.now();
  const rows = await db
    .select({
      contractorProfileId: contractorProfiles.id,
      planGraceEndsAt: contractorProfiles.planGraceEndsAt,
    })
    .from(contractorProfiles)
    .where(
      and(
        eq(contractorProfiles.planStatus, "grace_period" as any),
        sql`${contractorProfiles.planGraceEndsAt} < ${nowMs}`
      )
    );
  return rows;
}

/**
 * Get plan distribution stats for admin analytics.
 */
export async function getPlanDistributionStats() {
  const db = await getDb();
  if (!db) return { companyStats: [], contractorStats: [], summary: { totalCompanies: 0, totalContractors: 0, companiesTrialing: 0, companiesActive: 0, companiesExpired: 0, contractorsTrialing: 0, contractorsActive: 0, contractorsExpired: 0 } };

  // Company plan distribution
  const companyPlanRows = await db
    .select({
      planId: companies.planId,
      planName: subscriptionPlans.name,
      planStatus: companies.planStatus,
      count: count(),
    })
    .from(companies)
    .leftJoin(subscriptionPlans, eq(subscriptionPlans.id, companies.planId))
    .groupBy(companies.planId, subscriptionPlans.name, companies.planStatus);

  // Contractor plan distribution
  const contractorPlanRows = await db
    .select({
      planId: contractorProfiles.planId,
      planName: subscriptionPlans.name,
      planStatus: contractorProfiles.planStatus,
      count: count(),
    })
    .from(contractorProfiles)
    .leftJoin(subscriptionPlans, eq(subscriptionPlans.id, contractorProfiles.planId))
    .groupBy(contractorProfiles.planId, subscriptionPlans.name, contractorProfiles.planStatus);

  const summary = {
    totalCompanies: companyPlanRows.reduce((s, r) => s + Number(r.count), 0),
    totalContractors: contractorPlanRows.reduce((s, r) => s + Number(r.count), 0),
    companiesTrialing: companyPlanRows.filter(r => r.planStatus === "trialing").reduce((s, r) => s + Number(r.count), 0),
    companiesActive: companyPlanRows.filter(r => r.planStatus === "active").reduce((s, r) => s + Number(r.count), 0),
    companiesExpired: companyPlanRows.filter(r => r.planStatus === "expired" || r.planStatus === "canceled").reduce((s, r) => s + Number(r.count), 0),
    contractorsTrialing: contractorPlanRows.filter(r => r.planStatus === "trialing").reduce((s, r) => s + Number(r.count), 0),
    contractorsActive: contractorPlanRows.filter(r => r.planStatus === "active").reduce((s, r) => s + Number(r.count), 0),
    contractorsExpired: contractorPlanRows.filter(r => r.planStatus === "expired" || r.planStatus === "canceled").reduce((s, r) => s + Number(r.count), 0),
  };

  return { companyStats: companyPlanRows, contractorStats: contractorPlanRows, summary };
}


export async function createContractorInvite(data: InsertContractorInvite) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(contractorInvites).values(data);
  return result[0].insertId;
}

export async function getContractorInviteByToken(token: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(contractorInvites)
    .where(eq(contractorInvites.token, token))
    .limit(1);
  return result[0];
}

export async function listContractorInvitesByCompany(companyId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(contractorInvites)
    .where(eq(contractorInvites.companyId, companyId))
    .orderBy(desc(contractorInvites.createdAt));
}

export async function updateContractorInviteStatus(
  id: number,
  status: "pending" | "accepted" | "revoked" | "expired",
  acceptedAt?: number
) {
  const db = await getDb();
  if (!db) return;
  const updateData: Partial<InsertContractorInvite> = { status };
  if (acceptedAt !== undefined) updateData.acceptedAt = acceptedAt;
  await db.update(contractorInvites).set(updateData).where(eq(contractorInvites.id, id));
}

export async function getContractorInviteByEmailAndCompany(email: string, companyId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(contractorInvites)
    .where(
      and(
        eq(contractorInvites.email, email.toLowerCase()),
        eq(contractorInvites.companyId, companyId),
        eq(contractorInvites.status, "pending")
      )
    )
    .limit(1);
  return result[0];
}

export async function refreshContractorInviteToken(id: number, newToken: string, newExpiresAt: number) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(contractorInvites)
    .set({ token: newToken, expiresAt: newExpiresAt, status: "pending" })
    .where(eq(contractorInvites.id, id));
}

// ─── Job Notifications: Find Contractors Whose Service Area Covers a Property ─
/**
 * Returns all available contractors (with email) whose service radius covers
 * the given property coordinates. Used to fan-out new-job notifications.
 * Optionally filters by required trade.
 */
export async function getContractorsInServiceArea(
  propertyLat: number,
  propertyLng: number,
  requiredTrade?: string | null,
): Promise<Array<{ id: number; userId: number; name: string | null; email: string | null; trades: string[] | null; earlyNotificationMinutes: number }>> {
  const db = await getDb();
  if (!db) return [];

  const rows = await db
    .select({
      id: contractorProfiles.id,
      userId: users.id,
      latitude: contractorProfiles.latitude,
      longitude: contractorProfiles.longitude,
      serviceRadiusMiles: contractorProfiles.serviceRadiusMiles,
      trades: contractorProfiles.trades,
      isAvailable: contractorProfiles.isAvailable,
      name: users.name,
      email: users.email,
      planEarlyMinutes: subscriptionPlans.earlyNotificationMinutes,
    })
    .from(contractorProfiles)
    .innerJoin(users, eq(contractorProfiles.userId, users.id))
    .leftJoin(subscriptionPlans, eq(contractorProfiles.planId, subscriptionPlans.id))
    .where(
      and(
        eq(contractorProfiles.isAvailable, true),
        isNotNull(contractorProfiles.latitude),
        isNotNull(contractorProfiles.longitude),
      )
    );

  const results: Array<{ id: number; userId: number; name: string | null; email: string | null; trades: string[] | null; earlyNotificationMinutes: number }> = [];

  for (const row of rows) {
    const cLat = row.latitude ? parseFloat(String(row.latitude)) : null;
    const cLng = row.longitude ? parseFloat(String(row.longitude)) : null;
    if (cLat === null || cLng === null) continue;

    const radiusMiles = row.serviceRadiusMiles ?? 25;
    const dist = haversineDistanceMiles(cLat, cLng, propertyLat, propertyLng);
    if (dist > radiusMiles) continue;

    // Optional trade filter
    if (requiredTrade) {
      const trades = (row.trades as string[] | null) ?? [];
      const normalised = requiredTrade.toLowerCase();
      const hasTrade = trades.some(
        (t) => t.toLowerCase().includes(normalised) || normalised.includes(t.toLowerCase()),
      );
      if (!hasTrade) continue;
    }

    results.push({
      id: row.id,
      userId: row.userId,
      name: row.name,
      email: row.email,
      trades: row.trades as string[] | null,
      earlyNotificationMinutes: row.planEarlyMinutes ?? 0,
    });
  }

  return results;
}

// ─── PMS Webhook Events ────────────────────────────────────────────────────
export async function getPmsWebhookEvents(options: { companyId?: number; limit?: number; offset?: number; dateFrom?: Date; dateTo?: Date } = {}) {
  const db = await getDb();
  if (!db) return [];
  const { companyId, limit = 50, offset = 0, dateFrom, dateTo } = options;
  const conditions: ReturnType<typeof eq>[] = [];
  if (companyId) conditions.push(eq(pmsWebhookEvents.companyId, companyId) as any);
  if (dateFrom) conditions.push(gte(pmsWebhookEvents.createdAt, dateFrom) as any);
  if (dateTo) conditions.push(lte(pmsWebhookEvents.createdAt, dateTo) as any);
  const base = db.select().from(pmsWebhookEvents);
  const filtered = conditions.length > 0 ? base.where(and(...conditions)) : base;
  return filtered.orderBy(desc(pmsWebhookEvents.createdAt)).limit(limit).offset(offset);
}

// ─── Subscriber Migration Helpers ─────────────────────────────────────────
/** Returns all companies currently assigned to a specific plan. */
export async function getCompaniesByPlanId(planId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(companies)
    .where(eq(companies.planId, planId));
}

/** Returns all contractor profiles currently assigned to a specific plan. */
export async function getContractorsByPlanId(planId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(contractorProfiles)
    .where(eq(contractorProfiles.planId, planId));
}

// ─── Promo Codes ────────────────────────────────────────────────────────────
export async function listPromoCodes() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(promoCodes).orderBy(desc(promoCodes.createdAt));
}

export async function getPromoCodeById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(promoCodes).where(eq(promoCodes.id, id)).limit(1);
  return rows[0];
}

export async function getPromoCodeByCode(code: string) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(promoCodes).where(eq(promoCodes.code, code.toUpperCase())).limit(1);
  return rows[0];
}

export async function createPromoCode(data: InsertPromoCode) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(promoCodes).values({ ...data, code: data.code.toUpperCase() });
  return result[0].insertId;
}

export async function updatePromoCode(id: number, data: Partial<InsertPromoCode>) {
  const db = await getDb();
  if (!db) return;
  await db.update(promoCodes).set(data).where(eq(promoCodes.id, id));
}

export async function deletePromoCode(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(promoCodes).where(eq(promoCodes.id, id));
}

/** Generate a random uppercase promo code like "MAINT-X7K2P" */
export function generatePromoCodeString(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const segment = () => Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  return `MAINT-${segment()}`;
}

// ─── Company Promo Redemptions ─────────────────────────────────────────────
export async function getCompanyPromoRedemptions(companyId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: companyPromoRedemptions.id,
      promoCodeId: companyPromoRedemptions.promoCodeId,
      redeemedAt: companyPromoRedemptions.redeemedAt,
      cyclesRemaining: companyPromoRedemptions.cyclesRemaining,
      isActive: companyPromoRedemptions.isActive,
      code: promoCodes.code,
      description: promoCodes.description,
      discountPercent: promoCodes.discountPercent,
      affectsSubscription: promoCodes.affectsSubscription,
      affectsServiceCharge: promoCodes.affectsServiceCharge,
      affectsListingFee: promoCodes.affectsListingFee,
      billingCycles: promoCodes.billingCycles,
    })
    .from(companyPromoRedemptions)
    .innerJoin(promoCodes, eq(companyPromoRedemptions.promoCodeId, promoCodes.id))
    .where(eq(companyPromoRedemptions.companyId, companyId))
    .orderBy(desc(companyPromoRedemptions.redeemedAt));
}

export async function redeemPromoCode(companyId: number, code: string): Promise<{
  success: boolean;
  error?: string;
  promo?: typeof promoCodes.$inferSelect;
}> {
  const db = await getDb();
  if (!db) return { success: false, error: "DB not available" };

  const promo = await getPromoCodeByCode(code);
  if (!promo) return { success: false, error: "Invalid promo code" };
  if (!promo.isActive) return { success: false, error: "This promo code is no longer active" };
  if (promo.expiresAt && promo.expiresAt < Date.now()) return { success: false, error: "This promo code has expired" };
  if (promo.maxRedemptions != null && promo.redemptionCount >= promo.maxRedemptions) {
    return { success: false, error: "This promo code has reached its maximum number of redemptions" };
  }

  // Check if company already redeemed this code
  const existing = await db
    .select()
    .from(companyPromoRedemptions)
    .where(and(eq(companyPromoRedemptions.companyId, companyId), eq(companyPromoRedemptions.promoCodeId, promo.id)))
    .limit(1);
  if (existing.length > 0) return { success: false, error: "You have already redeemed this promo code" };

  // Create redemption record
  await db.insert(companyPromoRedemptions).values({
    companyId,
    promoCodeId: promo.id,
    cyclesRemaining: promo.billingCycles ?? null,
    isActive: true,
  });

  // Increment redemption count
  await db.update(promoCodes)
    .set({ redemptionCount: sql`${promoCodes.redemptionCount} + 1` })
    .where(eq(promoCodes.id, promo.id));

  return { success: true, promo };
}

// ─── Promo Discount Aggregation ───────────────────────────────────────────────
/**
 * Returns the combined active promo discounts for a company.
 * Multiple active promos stack additively (capped at 100%).
 * A redemption is "active" if: isActive=true AND (cyclesRemaining is null OR cyclesRemaining > 0)
 */
export async function getActivePromoDiscountsForCompany(companyId: number): Promise<{
  subscriptionDiscountPercent: number;
  serviceChargeDiscountPercent: number;
  listingFeeDiscountPercent: number;
}> {
  const redemptions = await getCompanyPromoRedemptions(companyId);
  const active = redemptions.filter(
    (r) => r.isActive && (r.cyclesRemaining == null || r.cyclesRemaining > 0)
  );
  let sub = 0, svc = 0, lst = 0;
  for (const r of active) {
    const pct = parseFloat(String(r.discountPercent ?? "0"));
    if (r.affectsSubscription) sub += pct;
    if (r.affectsServiceCharge) svc += pct;
    if (r.affectsListingFee) lst += pct;
  }
  return {
    subscriptionDiscountPercent: Math.min(sub, 100),
    serviceChargeDiscountPercent: Math.min(svc, 100),
    listingFeeDiscountPercent: Math.min(lst, 100),
  };
}

/**
 * Decrement cyclesRemaining for all active service-charge or listing-fee promos
 * for a company after a job is billed. Call this after a successful job charge.
 */
export async function decrementPromoJobCycles(companyId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const redemptions = await getCompanyPromoRedemptions(companyId);
  const active = redemptions.filter(
    (r) =>
      r.isActive &&
      r.cyclesRemaining != null &&
      r.cyclesRemaining > 0 &&
      (r.affectsServiceCharge || r.affectsListingFee)
  );
  for (const r of active) {
    const newCycles = (r.cyclesRemaining ?? 1) - 1;
    await db
      .update(companyPromoRedemptions)
      .set({
        cyclesRemaining: newCycles,
        isActive: newCycles > 0,
      })
      .where(eq(companyPromoRedemptions.id, r.id));
  }
}

// ─── Admin: Revenue Breakdown by Company ──────────────────────────────────────
export async function getRevenueByCompany(startDate?: number, endDate?: number) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [sql`${transactions.status} IN ('captured', 'paid_out')`];
  if (startDate) conditions.push(sql`${transactions.createdAt} >= ${startDate}`);
  if (endDate) conditions.push(sql`${transactions.createdAt} <= ${endDate}`);
  const rows = await db
    .select({
      companyId: transactions.companyId,
      companyName: companies.name,
      totalSpend: sql<string>`COALESCE(SUM(${transactions.totalCharged}), 0)`,
      platformFees: sql<string>`COALESCE(SUM(${transactions.platformFee}), 0)`,
      laborCost: sql<string>`COALESCE(SUM(${transactions.laborCost}), 0)`,
      partsCost: sql<string>`COALESCE(SUM(${transactions.partsCost}), 0)`,
      jobCount: sql<number>`COUNT(*)`,
    })
    .from(transactions)
    .innerJoin(companies, eq(transactions.companyId, companies.id))
    .where(and(...conditions))
    .groupBy(transactions.companyId, companies.name)
    .orderBy(sql`SUM(${transactions.platformFee}) DESC`)
    .limit(20);
  return rows;
}

// ─── Job Escalation Helpers ────────────────────────────────────────────────────
export async function getOverdueUnacceptedJobs() {
  const db = await getDb();
  if (!db) return [];
  // Use a default 60-minute escalation timeout (per-company setting is in companySettings)
  // We use the minimum timeout across companies: 60 minutes default
  const timeoutMinutes = 60;
  const cutoff = Date.now() - timeoutMinutes * 60 * 1000;
  // Find jobs that are still "open" (not yet assigned), posted to the board,
  // created before the cutoff, and not yet notified
  const rows = await db
    .select({
      id: maintenanceRequests.id,
      title: maintenanceRequests.title,
      companyId: maintenanceRequests.companyId,
      companyName: companies.name,
      companyEmail: companies.email,
      propertyName: properties.name,
      createdAt: maintenanceRequests.createdAt,
    })
    .from(maintenanceRequests)
    .innerJoin(companies, eq(maintenanceRequests.companyId, companies.id))
    .leftJoin(properties, eq(maintenanceRequests.propertyId, properties.id))
    .where(
      and(
        eq(maintenanceRequests.status, "open"),
        eq(maintenanceRequests.postedToBoard, true),
        sql`${maintenanceRequests.escalationNotifiedAt} IS NULL`,
        sql`UNIX_TIMESTAMP(${maintenanceRequests.createdAt}) * 1000 < ${cutoff}`
      )
    );
  return rows.map((r) => ({
    ...r,
    minutesOpen: Math.floor((Date.now() - new Date(r.createdAt).getTime()) / 60000),
  }));
}

export async function markJobEscalationNotified(jobId: number, notifiedAt: number) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(maintenanceRequests)
    .set({ escalationNotifiedAt: notifiedAt })
    .where(eq(maintenanceRequests.id, jobId));
}

// ─── Platform Announcements ────────────────────────────────────────────────
export async function createAnnouncement(data: InsertPlatformAnnouncement) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(platformAnnouncements).values(data);
  return result[0].insertId;
}

export async function listAnnouncements() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(platformAnnouncements).orderBy(desc(platformAnnouncements.createdAt));
}

export async function getActiveAnnouncementsForUser(userId: number, userType: "company" | "contractor") {
  const db = await getDb();
  if (!db) return [];
  const now = Date.now();
  const dismissed = await db.select({ announcementId: dismissedAnnouncements.announcementId })
    .from(dismissedAnnouncements).where(eq(dismissedAnnouncements.userId, userId));
  const dismissedIds = dismissed.map(d => d.announcementId);
  const all = await db.select().from(platformAnnouncements)
    .where(and(
      eq(platformAnnouncements.isActive, true),
      or(
        isNull(platformAnnouncements.expiresAt),
        gte(platformAnnouncements.expiresAt, now)
      )
    ))
    .orderBy(desc(platformAnnouncements.createdAt));
  return all.filter(a => {
    if (dismissedIds.includes(a.id)) return false;
    if (a.targetAudience === "all") return true;
    if (a.targetAudience === "companies" && userType === "company") return true;
    if (a.targetAudience === "contractors" && userType === "contractor") return true;
    return false;
  });
}

export async function updateAnnouncement(id: number, data: Partial<InsertPlatformAnnouncement>) {
  const db = await getDb();
  if (!db) return;
  await db.update(platformAnnouncements).set(data).where(eq(platformAnnouncements.id, id));
}

export async function deleteAnnouncement(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(platformAnnouncements).where(eq(platformAnnouncements.id, id));
}

export async function dismissAnnouncement(userId: number, announcementId: number) {
  const db = await getDb();
  if (!db) return;
  await db.insert(dismissedAnnouncements).values({ userId, announcementId }).onDuplicateKeyUpdate({ set: { userId } });
}

// ─── Feature Flags ─────────────────────────────────────────────────────────
export async function listFeatureFlags() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(featureFlags).orderBy(featureFlags.key);
}

export async function upsertFeatureFlag(data: InsertFeatureFlag) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(featureFlags).values(data).onDuplicateKeyUpdate({
    set: {
      label: data.label,
      description: data.description,
      enabledForCompanies: data.enabledForCompanies,
      enabledForContractors: data.enabledForContractors,
      updatedBy: data.updatedBy,
    }
  });
}

export async function updateFeatureFlag(key: string, data: Partial<InsertFeatureFlag>) {
  const db = await getDb();
  if (!db) return;
  await db.update(featureFlags).set(data).where(eq(featureFlags.key, key));
}

// ─── Audit Log ─────────────────────────────────────────────────────────────
export async function writeAuditLog(entry: InsertAuditLogEntry) {
  const db = await getDb();
  if (!db) return;
  await db.insert(auditLog).values(entry);
}

export async function listAuditLog(limit = 100, offset = 0, search?: string) {
  const db = await getDb();
  if (!db) return [];
  const query = db.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(limit).offset(offset);
  return query;
}

export async function listAuditLogByAction(action: string, limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(auditLog)
    .where(eq(auditLog.action, action))
    .orderBy(desc(auditLog.createdAt))
    .limit(limit);
}

// ─── Account Suspensions ──────────────────────────────────────────────────
export async function suspendAccount(data: InsertAccountSuspension) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  // Deactivate any existing active suspension for this target
  await db.update(accountSuspensions)
    .set({ isActive: false })
    .where(and(
      eq(accountSuspensions.targetType, data.targetType),
      eq(accountSuspensions.targetId, data.targetId),
      eq(accountSuspensions.isActive, true)
    ));
  const result = await db.insert(accountSuspensions).values(data);
  return result[0].insertId;
}

export async function reinstateAccount(targetType: string, targetId: number, reinstatedBy: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(accountSuspensions)
    .set({ isActive: false, reinstatedAt: new Date(), reinstatedBy })
    .where(and(
      eq(accountSuspensions.targetType, targetType),
      eq(accountSuspensions.targetId, targetId),
      eq(accountSuspensions.isActive, true)
    ));
}

export async function getActiveSuspension(targetType: string, targetId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(accountSuspensions)
    .where(and(
      eq(accountSuspensions.targetType, targetType),
      eq(accountSuspensions.targetId, targetId),
      eq(accountSuspensions.isActive, true)
    )).limit(1);
  return result[0];
}

export async function listSuspensions() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(accountSuspensions).orderBy(desc(accountSuspensions.suspendedAt));
}

// ─── Manual Account Credits ───────────────────────────────────────────────
export async function issueAccountCredit(data: InsertAccountCredit) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(accountCredits).values(data);
  return result[0].insertId;
}

export async function listAccountCredits(companyId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(accountCredits)
    .where(eq(accountCredits.companyId, companyId))
    .orderBy(desc(accountCredits.createdAt));
}

export async function listAllAccountCredits() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(accountCredits).orderBy(desc(accountCredits.createdAt));
}

// ─── Payout Holds ─────────────────────────────────────────────────────────
export async function placePayoutHold(data: InsertPayoutHold) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(payoutHolds).values(data);
  return result[0].insertId;
}

export async function releasePayoutHold(contractorId: number, releasedBy: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(payoutHolds)
    .set({ isActive: false, releasedAt: new Date(), releasedBy })
    .where(and(eq(payoutHolds.contractorId, contractorId), eq(payoutHolds.isActive, true)));
}

export async function getActivePayoutHold(contractorId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(payoutHolds)
    .where(and(eq(payoutHolds.contractorId, contractorId), eq(payoutHolds.isActive, true))).limit(1);
  return result[0];
}

export async function listPayoutHolds() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(payoutHolds).orderBy(desc(payoutHolds.placedAt));
}

// ─── Activity Events ──────────────────────────────────────────────────────
export async function logActivityEvent(data: InsertActivityEvent) {
  const db = await getDb();
  if (!db) return;
  await db.insert(activityEvents).values(data);
  // Keep only the last 500 events to avoid unbounded growth
  const countResult = await db.select({ count: count() }).from(activityEvents);
  if (countResult[0]?.count > 500) {
    const oldest = await db.select({ id: activityEvents.id })
      .from(activityEvents).orderBy(activityEvents.createdAt).limit(50);
    if (oldest.length > 0) {
      await db.delete(activityEvents).where(inArray(activityEvents.id, oldest.map(e => e.id)));
    }
  }
}

export async function listActivityEvents(limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(activityEvents).orderBy(desc(activityEvents.createdAt)).limit(limit);
}

// ─── Maintenance Mode ─────────────────────────────────────────────────────
export async function getMaintenanceMode() {
  const db = await getDb();
  if (!db) return { isEnabled: false, message: null };
  const result = await db.select().from(maintenanceMode).limit(1);
  if (result.length === 0) return { isEnabled: false, message: null };
  return result[0];
}

export async function setMaintenanceMode(isEnabled: boolean, message: string | null, enabledBy: number) {
  const db = await getDb();
  if (!db) return;
  const existing = await db.select().from(maintenanceMode).limit(1);
  if (existing.length === 0) {
    await db.insert(maintenanceMode).values({
      isEnabled,
      message,
      enabledBy: isEnabled ? enabledBy : null,
      enabledAt: isEnabled ? new Date() : null,
    });
  } else {
    await db.update(maintenanceMode).set({
      isEnabled,
      message,
      enabledBy: isEnabled ? enabledBy : null,
      enabledAt: isEnabled ? new Date() : null,
    }).where(eq(maintenanceMode.id, existing[0].id));
  }
}

// ─── Contractor Performance (for leaderboard) ─────────────────────────────
export async function getContractorLeaderboard(limit = 20) {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    id: contractorProfiles.id,
    userId: contractorProfiles.userId,
    businessName: contractorProfiles.businessName,
    rating: contractorProfiles.rating,
    completedJobs: contractorProfiles.completedJobs,
    isAvailable: contractorProfiles.isAvailable,
  }).from(contractorProfiles)
    .orderBy(desc(contractorProfiles.completedJobs))
    .limit(limit);
}

// ─── Churn Risk (companies inactive 30+ days) ─────────────────────────────
export async function getChurnRiskCompanies() {
  const db = await getDb();
  if (!db) return [];
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  // Get companies with their last job posted date
  const allCompanies = await db.select({
    id: companies.id,
    name: companies.name,
    email: companies.email,
    planStatus: companies.planStatus,
    createdAt: companies.createdAt,
  }).from(companies);

  const result = [];
  for (const company of allCompanies) {
    const lastJob = await db.select({ createdAt: maintenanceRequests.createdAt })
      .from(maintenanceRequests)
      .where(eq(maintenanceRequests.companyId, company.id))
      .orderBy(desc(maintenanceRequests.createdAt))
      .limit(1);
    const lastJobDate = lastJob[0]?.createdAt?.getTime() ?? company.createdAt.getTime();
    if (lastJobDate < thirtyDaysAgo) {
      result.push({
        ...company,
        lastJobAt: lastJobDate,
        daysSinceLastJob: Math.floor((Date.now() - lastJobDate) / (24 * 60 * 60 * 1000)),
      });
    }
  }
  return result.sort((a, b) => b.daysSinceLastJob - a.daysSinceLastJob);
}

// ─── Per-Property Revenue Report ──────────────────────────────────────────
export async function getRevenueByProperty(companyId: number, fromMs?: number, toMs?: number) {
  const db = await getDb();
  if (!db) return [];
  const allJobs = await db.select({
    propertyId: maintenanceRequests.propertyId,
    id: maintenanceRequests.id,
    status: maintenanceRequests.status,
    createdAt: maintenanceRequests.createdAt,
  }).from(maintenanceRequests)
    .where(eq(maintenanceRequests.companyId, companyId));

  const paidJobIds = allJobs
    .filter(j => {
      if (!["paid", "verified"].includes(j.status)) return false;
      if (fromMs && j.createdAt.getTime() < fromMs) return false;
      if (toMs && j.createdAt.getTime() > toMs) return false;
      return true;
    })
    .map(j => j.id);

  if (paidJobIds.length === 0) return [];

  const txns = await db.select({
    maintenanceRequestId: transactions.maintenanceRequestId,
    totalCharged: transactions.totalCharged,
    platformFee: transactions.platformFee,
    laborCost: transactions.laborCost,
    partsCost: transactions.partsCost,
  }).from(transactions).where(inArray(transactions.maintenanceRequestId, paidJobIds));

  const props = await db.select().from(properties).where(eq(properties.companyId, companyId));

  // Group by propertyId
  const map = new Map<number, { propertyId: number; propertyName: string; totalCharged: number; platformFee: number; laborCost: number; partsCost: number; jobCount: number }>();
  for (const job of allJobs.filter(j => paidJobIds.includes(j.id))) {
    const txn = txns.find(t => t.maintenanceRequestId === job.id);
    if (!txn) continue;
    const prop = props.find(p => p.id === job.propertyId);
    const entry = map.get(job.propertyId) ?? {
      propertyId: job.propertyId,
      propertyName: prop?.name ?? `Property #${job.propertyId}`,
      totalCharged: 0, platformFee: 0, laborCost: 0, partsCost: 0, jobCount: 0,
    };
    entry.totalCharged += Number(txn.totalCharged ?? 0);
    entry.platformFee += Number(txn.platformFee ?? 0);
    entry.laborCost += Number(txn.laborCost ?? 0);
    entry.partsCost += Number(txn.partsCost ?? 0);
    entry.jobCount += 1;
    map.set(job.propertyId, entry);
  }
  return Array.from(map.values()).sort((a, b) => b.totalCharged - a.totalCharged);
}

// ─── Job Fee Override Helpers ─────────────────────────────────────────────────────
export async function getTransactionByJobId(jobId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(transactions).where(eq(transactions.maintenanceRequestId, jobId)).limit(1);
  return rows[0] ?? null;
}

export async function updateTransactionFee(transactionId: number, newPlatformFeeCents: number) {
  const db = await getDb();
  if (!db) return;
  // newPlatformFeeCents is in cents; platformFee column is decimal (dollars)
  const newPlatformFeeDollars = (newPlatformFeeCents / 100).toFixed(2);
  await db.update(transactions)
    .set({ platformFee: newPlatformFeeDollars, updatedAt: new Date() })
    .where(eq(transactions.id, transactionId));
}

// ─── PMS Integrations ─────────────────────────────────────────────────────────
export async function listPmsIntegrations(companyId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(pmsIntegrations).where(eq(pmsIntegrations.companyId, companyId)).orderBy(desc(pmsIntegrations.createdAt));
}

export async function getPmsIntegrationById(id: number, companyId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(pmsIntegrations).where(and(eq(pmsIntegrations.id, id), eq(pmsIntegrations.companyId, companyId))).limit(1);
  return rows[0] ?? null;
}

export async function getPmsIntegrationByProvider(companyId: number, provider: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(pmsIntegrations).where(and(eq(pmsIntegrations.companyId, companyId), eq(pmsIntegrations.provider, provider))).limit(1);
  return rows[0] ?? null;
}

export async function createPmsIntegration(data: InsertPmsIntegration) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(pmsIntegrations).values(data);
  return result[0].insertId;
}

export async function updatePmsIntegration(id: number, companyId: number, data: Partial<InsertPmsIntegration>) {
  const db = await getDb();
  if (!db) return;
  await db.update(pmsIntegrations).set(data).where(and(eq(pmsIntegrations.id, id), eq(pmsIntegrations.companyId, companyId)));
}

export async function deletePmsIntegration(id: number, companyId: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(pmsIntegrations).where(and(eq(pmsIntegrations.id, id), eq(pmsIntegrations.companyId, companyId)));
}

export async function listPmsWebhookEvents(companyId: number, limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(pmsWebhookEvents).where(eq(pmsWebhookEvents.companyId, companyId)).orderBy(desc(pmsWebhookEvents.createdAt)).limit(limit);
}

export async function createPmsWebhookEvent(data: {
  companyId?: number | null;
  provider: string;
  rawPayload?: string | null;
  status?: string;
  errorMessage?: string | null;
  createdJobId?: number | null;
}) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(pmsWebhookEvents).values({
    companyId: data.companyId ?? undefined,
    provider: data.provider,
    rawPayload: data.rawPayload ? JSON.parse(data.rawPayload) : undefined,
    status: (data.status ?? "received") as "received" | "processed" | "failed" | "ignored",
    errorMessage: data.errorMessage ?? undefined,
    createdJobId: data.createdJobId ?? undefined,
  });
  return result[0].insertId;
}

// ─── Password Reset Tokens ─────────────────────────────────────────────────────
export async function createPasswordResetToken(userId: number, token: string, expiresAt: Date) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  // Invalidate any existing tokens for this user
  await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, userId));
  await db.insert(passwordResetTokens).values({ userId, token, expiresAt });
}

export async function getPasswordResetToken(token: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(passwordResetTokens).where(eq(passwordResetTokens.token, token)).limit(1);
  return rows[0] ?? null;
}

export async function markPasswordResetTokenUsed(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(passwordResetTokens).set({ usedAt: new Date() }).where(eq(passwordResetTokens.id, id));
}

export async function updateUserPassword(userId: number, passwordHash: string) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ passwordHash }).where(eq(users.id, userId));
}

// ─── Job Change History ────────────────────────────────────────────────────
export async function addJobChangeHistory(data: InsertJobChangeHistory) {
  const db = await getDb();
  if (!db) return;
  await db.insert(jobChangeHistory).values(data);
}

export async function getJobChangeHistory(jobId: number, companyId: number) {
  const db = await getDb();
  if (!db) return [];
  // Join with users to get the name of who made the change
  const rows = await db
    .select({
      id: jobChangeHistory.id,
      changeType: jobChangeHistory.changeType,
      fromValue: jobChangeHistory.fromValue,
      toValue: jobChangeHistory.toValue,
      note: jobChangeHistory.note,
      createdAt: jobChangeHistory.createdAt,
      userName: users.name,
    })
    .from(jobChangeHistory)
    .leftJoin(users, eq(jobChangeHistory.userId, users.id))
    .where(
      and(
        eq(jobChangeHistory.jobId, jobId),
        eq(jobChangeHistory.companyId, companyId)
      )
    )
    .orderBy(desc(jobChangeHistory.createdAt));
  return rows;
}

// ─── Contractor Performance Scorecard ─────────────────────────────────────────
/**
 * Returns aggregated performance metrics for a single contractor within a company.
 * Metrics: jobs completed, average rating, on-time rate (completed within 48h of assignment),
 * average response time (hours from assignment to first clock-in).
 */
export async function getContractorScorecard(contractorProfileId: number, companyId: number) {
  const db = await getDb();
  if (!db) return null;

  // Jobs completed (status = completed, verified, paid, payment_pending_ach)
  const completedStatuses = ["completed", "verified", "paid", "payment_pending_ach"] as const;
  const [jobStats] = await db
    .select({
      totalCompleted: count(maintenanceRequests.id),
      avgLaborMinutes: avg(maintenanceRequests.totalLaborMinutes),
    })
    .from(maintenanceRequests)
    .where(
      and(
        eq(maintenanceRequests.assignedContractorId, contractorProfileId),
        eq(maintenanceRequests.companyId, companyId),
        inArray(maintenanceRequests.status, completedStatuses as unknown as readonly ["completed", "verified", "paid", "payment_pending_ach"])
      )
    );

  // Average rating from this company
  const [ratingStats] = await db
    .select({
      avgRating: avg(contractorRatings.stars),
      ratingCount: count(contractorRatings.id),
    })
    .from(contractorRatings)
    .where(
      and(
        eq(contractorRatings.contractorProfileId, contractorProfileId),
        eq(contractorRatings.companyId, companyId)
      )
    );

  // On-time rate: jobs completed where completedAt - assignedAt <= 48 hours
  // We compute this via SQL: count where TIMESTAMPDIFF(HOUR, assignedAt, completedAt) <= 48
  const [onTimeStats] = await db
    .select({
      onTimeCount: count(maintenanceRequests.id),
    })
    .from(maintenanceRequests)
    .where(
      and(
        eq(maintenanceRequests.assignedContractorId, contractorProfileId),
        eq(maintenanceRequests.companyId, companyId),
        inArray(maintenanceRequests.status, completedStatuses as unknown as readonly ["completed", "verified", "paid", "payment_pending_ach"]),
        isNotNull(maintenanceRequests.assignedAt),
        isNotNull(maintenanceRequests.completedAt),
        sql`TIMESTAMPDIFF(HOUR, ${maintenanceRequests.assignedAt}, ${maintenanceRequests.completedAt}) <= 48`
      )
    );

  // Average response time: hours from assignedAt to first clock-in (clockInTime is a bigint ms timestamp)
  const [responseStats] = await db
    .select({
      avgResponseHours: sql<number>`AVG((${timeSessions.clockInTime} / 1000 - UNIX_TIMESTAMP(${maintenanceRequests.assignedAt})) / 3600)`,
    })
    .from(timeSessions)
    .innerJoin(maintenanceRequests, eq(timeSessions.maintenanceRequestId, maintenanceRequests.id))
    .where(
      and(
        eq(timeSessions.contractorProfileId, contractorProfileId),
        eq(maintenanceRequests.companyId, companyId),
        isNotNull(maintenanceRequests.assignedAt),
        isNotNull(timeSessions.clockInTime)
      )
    );

  const totalCompleted = Number(jobStats?.totalCompleted ?? 0);
  const onTimeCount = Number(onTimeStats?.onTimeCount ?? 0);

  return {
    totalCompleted,
    avgRating: ratingStats?.avgRating ? parseFloat(String(ratingStats.avgRating)) : null,
    ratingCount: Number(ratingStats?.ratingCount ?? 0),
    onTimeRate: totalCompleted > 0 ? Math.round((onTimeCount / totalCompleted) * 100) : null,
    avgResponseHours: responseStats?.avgResponseHours ? Math.round(parseFloat(String(responseStats.avgResponseHours)) * 10) / 10 : null,
  };
}

/**
 * Returns scorecards for all contractors connected to a company in a single batch.
 * Returns a map of contractorProfileId → scorecard.
 */
export async function getContractorScorecardsByCompany(companyId: number): Promise<Record<number, {
  totalCompleted: number;
  avgRating: number | null;
  ratingCount: number;
  onTimeRate: number | null;
  avgResponseHours: number | null;
}>> {
  const db = await getDb();
  if (!db) return {};

  const completedStatuses = ["completed", "verified", "paid", "payment_pending_ach"] as const;

  // Job stats per contractor
  const jobRows = await db
    .select({
      contractorProfileId: maintenanceRequests.assignedContractorId,
      totalCompleted: count(maintenanceRequests.id),
    })
    .from(maintenanceRequests)
    .where(
      and(
        eq(maintenanceRequests.companyId, companyId),
        inArray(maintenanceRequests.status, completedStatuses),
        isNotNull(maintenanceRequests.assignedContractorId)
      )
    )
    .groupBy(maintenanceRequests.assignedContractorId);

  // On-time counts per contractor
  const onTimeRows = await db
    .select({
      contractorProfileId: maintenanceRequests.assignedContractorId,
      onTimeCount: count(maintenanceRequests.id),
    })
    .from(maintenanceRequests)
    .where(
      and(
        eq(maintenanceRequests.companyId, companyId),
        inArray(maintenanceRequests.status, completedStatuses),
        isNotNull(maintenanceRequests.assignedContractorId),
        isNotNull(maintenanceRequests.assignedAt),
        isNotNull(maintenanceRequests.completedAt),
        sql`TIMESTAMPDIFF(HOUR, ${maintenanceRequests.assignedAt}, ${maintenanceRequests.completedAt}) <= 48`
      )
    )
    .groupBy(maintenanceRequests.assignedContractorId);

  // Rating stats per contractor
  const ratingRows = await db
    .select({
      contractorProfileId: contractorRatings.contractorProfileId,
      avgRating: avg(contractorRatings.stars),
      ratingCount: count(contractorRatings.id),
    })
    .from(contractorRatings)
    .where(eq(contractorRatings.companyId, companyId))
    .groupBy(contractorRatings.contractorProfileId);

  // Response time per contractor
  const responseRows = await db
    .select({
      contractorProfileId: timeSessions.contractorProfileId,
      avgResponseHours: sql<number>`AVG((${timeSessions.clockInTime} / 1000 - UNIX_TIMESTAMP(${maintenanceRequests.assignedAt})) / 3600)`,
    })
    .from(timeSessions)
    .innerJoin(maintenanceRequests, eq(timeSessions.maintenanceRequestId, maintenanceRequests.id))
    .where(
      and(
        eq(maintenanceRequests.companyId, companyId),
        isNotNull(maintenanceRequests.assignedAt),
        isNotNull(timeSessions.clockInTime)
      )
    )
    .groupBy(timeSessions.contractorProfileId);

  // Build maps
  const jobMap = new Map(jobRows.map((r) => [r.contractorProfileId, Number(r.totalCompleted)]));
  const onTimeMap = new Map(onTimeRows.map((r) => [r.contractorProfileId, Number(r.onTimeCount)]));
  const ratingMap = new Map(ratingRows.map((r) => [r.contractorProfileId, { avg: r.avgRating ? parseFloat(String(r.avgRating)) : null, count: Number(r.ratingCount) }]));
  const responseMap = new Map(responseRows.map((r) => [r.contractorProfileId, r.avgResponseHours ? Math.round(parseFloat(String(r.avgResponseHours)) * 10) / 10 : null]));

  // Collect all contractor IDs
  const allIds = new Set([
    ...Array.from(jobMap.keys()),
    ...Array.from(ratingMap.keys()),
    ...Array.from(responseMap.keys()),
  ]);
  const result: Record<number, { totalCompleted: number; avgRating: number | null; ratingCount: number; onTimeRate: number | null; avgResponseHours: number | null }> = {};

  for (const id of Array.from(allIds)) {
    if (id === null || id === undefined) continue;
    const total = jobMap.get(id) ?? 0;
    const onTime = onTimeMap.get(id) ?? 0;
    const rating = ratingMap.get(id);
    result[id] = {
      totalCompleted: total,
      avgRating: rating?.avg ?? null,
      ratingCount: rating?.count ?? 0,
      onTimeRate: total > 0 ? Math.round((onTime / total) * 100) : null,
      avgResponseHours: responseMap.get(id) ?? null,
    };
  }

  return result;
}

// ─── Job Re-assignment (Reopen) ───────────────────────────────────────────────
/**
 * Re-opens an assigned/in_progress job: clears the contractor assignment,
 * sets status back to "open", and optionally posts back to the board.
 */
export async function reopenJob(jobId: number, companyId: number): Promise<{ contractorProfileId: number | null; contractorUserId: number | null }> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  // Get current assignment info before clearing
  const [job] = await db
    .select({
      assignedContractorId: maintenanceRequests.assignedContractorId,
      status: maintenanceRequests.status,
    })
    .from(maintenanceRequests)
    .where(and(eq(maintenanceRequests.id, jobId), eq(maintenanceRequests.companyId, companyId)))
    .limit(1);

  if (!job) throw new Error("Job not found");
  const reopenableStatuses = ["assigned", "in_progress", "completed", "verified", "paid", "payment_pending_ach"];
  if (!reopenableStatuses.includes(job.status)) {
    throw new Error("Job cannot be re-opened from its current status");
  }

  const contractorProfileId = job.assignedContractorId;

  // Look up contractor user id for notification
  let contractorUserId: number | null = null;
  if (contractorProfileId) {
    const [cp] = await db
      .select({ userId: contractorProfiles.userId })
      .from(contractorProfiles)
      .where(eq(contractorProfiles.id, contractorProfileId))
      .limit(1);
    contractorUserId = cp?.userId ?? null;
  }

  // Clear assignment, completion data, and set status back to open
  await db
    .update(maintenanceRequests)
    .set({
      status: "open",
      assignedContractorId: null,
      assignedAt: null,
      completionNotes: null,
      completedAt: null,
      totalLaborCost: null,
      totalPartsCost: null,
      platformFee: null,
      totalCost: null,
      stripePaymentIntentId: null,
    })
    .where(and(eq(maintenanceRequests.id, jobId), eq(maintenanceRequests.companyId, companyId)));

  return { contractorProfileId, contractorUserId };
}

// ─── Company Reporting Queries ────────────────────────────────────────────────

/** Summary KPIs for a company within a date range */
export async function getCompanyReportSummary(companyId: number, fromMs: number, toMs: number) {
  const db = await getDb();
  if (!db) return null;

  const fromDate = new Date(fromMs);
  const toDate = new Date(toMs);

  const [stats] = await db
    .select({
      totalJobs: count(maintenanceRequests.id),
      totalLaborCost: sum(maintenanceRequests.totalLaborCost),
      totalPartsCost: sum(maintenanceRequests.totalPartsCost),
      totalLaborMinutes: sum(maintenanceRequests.totalLaborMinutes),
    })
    .from(maintenanceRequests)
    .where(
      and(
        eq(maintenanceRequests.companyId, companyId),
        inArray(maintenanceRequests.status, ["completed", "verified", "paid", "payment_pending_ach"] as const),
        gte(maintenanceRequests.createdAt, fromDate),
        lte(maintenanceRequests.createdAt, toDate)
      )
    );

  const laborCost = parseFloat(String(stats?.totalLaborCost ?? "0")) || 0;
  const partsCost = parseFloat(String(stats?.totalPartsCost ?? "0")) || 0;
  const totalSpend = laborCost + partsCost;
  const totalJobs = Number(stats?.totalJobs ?? 0);
  const totalHours = Math.round((Number(stats?.totalLaborMinutes ?? 0) / 60) * 10) / 10;

  return {
    totalSpend,
    totalJobs,
    avgCostPerJob: totalJobs > 0 ? Math.round((totalSpend / totalJobs) * 100) / 100 : 0,
    totalLaborHours: totalHours,
  };
}

/** Per-property cost breakdown within a date range */
export async function getCompanyReportByProperty(companyId: number, fromMs: number, toMs: number) {
  const db = await getDb();
  if (!db) return [];

  const fromDate = new Date(fromMs);
  const toDate = new Date(toMs);

  const rows = await db
    .select({
      propertyId: maintenanceRequests.propertyId,
      propertyName: properties.name,
      propertyAddress: properties.address,
      jobCount: count(maintenanceRequests.id),
      totalLaborCost: sum(maintenanceRequests.totalLaborCost),
      totalPartsCost: sum(maintenanceRequests.totalPartsCost),
    })
    .from(maintenanceRequests)
    .innerJoin(properties, eq(maintenanceRequests.propertyId, properties.id))
    .where(
      and(
        eq(maintenanceRequests.companyId, companyId),
        inArray(maintenanceRequests.status, ["completed", "verified", "paid", "payment_pending_ach"] as const),
        gte(maintenanceRequests.createdAt, fromDate),
        lte(maintenanceRequests.createdAt, toDate)
      )
    )
    .groupBy(maintenanceRequests.propertyId, properties.name, properties.address)
    .orderBy(desc(sum(maintenanceRequests.totalLaborCost)));

  return rows.map((r) => {
    const labor = parseFloat(String(r.totalLaborCost ?? "0")) || 0;
    const parts = parseFloat(String(r.totalPartsCost ?? "0")) || 0;
    return {
      propertyId: r.propertyId,
      propertyName: r.propertyName,
      propertyAddress: r.propertyAddress,
      jobCount: Number(r.jobCount),
      totalSpend: Math.round((labor + parts) * 100) / 100,
      avgCostPerJob: Number(r.jobCount) > 0 ? Math.round(((labor + parts) / Number(r.jobCount)) * 100) / 100 : 0,
    };
  });
}

/** Monthly spend trend for the last N months */
export async function getCompanyReportByMonth(companyId: number, months = 6) {
  const db = await getDb();
  if (!db) return [];

  const fromDate = new Date();
  fromDate.setMonth(fromDate.getMonth() - months + 1);
  fromDate.setDate(1);
  fromDate.setHours(0, 0, 0, 0);

  const rows = await db
    .select({
      yearMonth: sql<string>`DATE_FORMAT(${maintenanceRequests.createdAt}, '%Y-%m')`,
      jobCount: count(maintenanceRequests.id),
      totalLaborCost: sum(maintenanceRequests.totalLaborCost),
      totalPartsCost: sum(maintenanceRequests.totalPartsCost),
    })
    .from(maintenanceRequests)
    .where(
      and(
        eq(maintenanceRequests.companyId, companyId),
        inArray(maintenanceRequests.status, ["completed", "verified", "paid", "payment_pending_ach"] as const),
        gte(maintenanceRequests.createdAt, fromDate)
      )
    )
    .groupBy(sql`DATE_FORMAT(${maintenanceRequests.createdAt}, '%Y-%m')`)
    .orderBy(sql`DATE_FORMAT(${maintenanceRequests.createdAt}, '%Y-%m')`);

  return rows.map((r) => {
    const labor = parseFloat(String(r.totalLaborCost ?? "0")) || 0;
    const parts = parseFloat(String(r.totalPartsCost ?? "0")) || 0;
    return {
      yearMonth: r.yearMonth,
      jobCount: Number(r.jobCount),
      totalSpend: Math.round((labor + parts) * 100) / 100,
    };
  });
}

/** Spend breakdown by skill tier within a date range */
export async function getCompanyReportBySkillTier(companyId: number, fromMs: number, toMs: number) {
  const db = await getDb();
  if (!db) return [];

  const fromDate = new Date(fromMs);
  const toDate = new Date(toMs);

  const rows = await db
    .select({
      tierName: sql<string>`COALESCE(${skillTiers.name}, ${maintenanceRequests.aiSkillTier}, 'Unclassified')`,
      jobCount: count(maintenanceRequests.id),
      totalLaborCost: sum(maintenanceRequests.totalLaborCost),
      totalPartsCost: sum(maintenanceRequests.totalPartsCost),
    })
    .from(maintenanceRequests)
    .leftJoin(skillTiers, eq(maintenanceRequests.skillTierId, skillTiers.id))
    .where(
      and(
        eq(maintenanceRequests.companyId, companyId),
        inArray(maintenanceRequests.status, ["completed", "verified", "paid", "payment_pending_ach"] as const),
        gte(maintenanceRequests.createdAt, fromDate),
        lte(maintenanceRequests.createdAt, toDate)
      )
    )
    .groupBy(sql`COALESCE(${skillTiers.name}, ${maintenanceRequests.aiSkillTier}, 'Unclassified')`)
    .orderBy(desc(sum(maintenanceRequests.totalLaborCost)));

  return rows.map((r) => {
    const labor = parseFloat(String(r.totalLaborCost ?? "0")) || 0;
    const parts = parseFloat(String(r.totalPartsCost ?? "0")) || 0;
    return {
      tierName: r.tierName,
      jobCount: Number(r.jobCount),
      totalSpend: Math.round((labor + parts) * 100) / 100,
    };
  });
}

// ─── Property Units ────────────────────────────────────────────────────────
export async function getUnitsByProperty(propertyId: number, companyId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(propertyUnits)
    .where(and(eq(propertyUnits.propertyId, propertyId), eq(propertyUnits.companyId, companyId)))
    .orderBy(propertyUnits.unitNumber);
}

export async function createPropertyUnit(data: InsertPropertyUnit) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(propertyUnits).values(data);
  return result[0].insertId;
}

export async function updatePropertyUnit(id: number, companyId: number, data: Partial<InsertPropertyUnit>) {
  const db = await getDb();
  if (!db) return;
  await db.update(propertyUnits).set(data).where(and(eq(propertyUnits.id, id), eq(propertyUnits.companyId, companyId)));
}

export async function deletePropertyUnit(id: number, companyId: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(propertyUnits).where(and(eq(propertyUnits.id, id), eq(propertyUnits.companyId, companyId)));
}

export async function deleteUnitsByProperty(propertyId: number, companyId: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(propertyUnits).where(and(eq(propertyUnits.propertyId, propertyId), eq(propertyUnits.companyId, companyId)));
}

/** Upsert a unit by externalId (for PMS sync) or by unitNumber if no externalId */
export async function upsertPropertyUnit(data: InsertPropertyUnit) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  if (data.externalId) {
    // Try to find existing by externalId
    const existing = await db
      .select({ id: propertyUnits.id })
      .from(propertyUnits)
      .where(and(eq(propertyUnits.propertyId, data.propertyId), eq(propertyUnits.externalId, data.externalId)))
      .limit(1);
    if (existing.length > 0) {
      await db.update(propertyUnits).set(data).where(eq(propertyUnits.id, existing[0].id));
      return existing[0].id;
    }
  }
  const result = await db.insert(propertyUnits).values(data);
  return result[0].insertId;
}

// --- Email Verification Helpers -------------------------------------------
export async function setEmailVerificationCode(userId: number, code: string, expiresAt: Date) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(users).set({
    emailVerificationCode: code,
    emailVerificationExpiry: expiresAt,
    emailVerified: false,
  }).where(eq(users.id, userId));
}

export async function verifyEmailCode(userId: number, code: string): Promise<"ok" | "expired" | "invalid"> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const user = result[0];
  if (!user) return "invalid";
  if (user.emailVerificationCode !== code) return "invalid";
  if (!user.emailVerificationExpiry || user.emailVerificationExpiry < new Date()) return "expired";
  await db.update(users).set({
    emailVerified: true,
    emailVerificationCode: null,
    emailVerificationExpiry: null,
  }).where(eq(users.id, userId));
  return "ok";
}

export async function markEmailVerified(userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ emailVerified: true, emailVerificationCode: null, emailVerificationExpiry: null }).where(eq(users.id, userId));
}

// ─── Company Team (Multi-User Access) ─────────────────────────────────────
export async function createCompanyInvitation(data: InsertCompanyInvitation) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(companyInvitations).values(data);
  return result[0].insertId;
}

export async function getCompanyInvitationByToken(token: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(companyInvitations).where(eq(companyInvitations.token, token)).limit(1);
  return result[0];
}

export async function getCompanyInvitationByEmailAndCompany(email: string, companyId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(companyInvitations)
    .where(and(eq(companyInvitations.email, email), eq(companyInvitations.companyId, companyId), isNull(companyInvitations.acceptedAt)))
    .limit(1);
  return result[0];
}

export async function listCompanyInvitations(companyId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(companyInvitations).where(eq(companyInvitations.companyId, companyId)).orderBy(desc(companyInvitations.createdAt));
}

export async function acceptCompanyInvitation(token: string) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(companyInvitations).set({ acceptedAt: new Date() }).where(eq(companyInvitations.token, token));
}

export async function addCompanyUser(data: InsertCompanyUser) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(companyUsers).values(data);
  return result[0].insertId;
}

export async function getCompanyUser(companyId: number, userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(companyUsers)
    .where(and(eq(companyUsers.companyId, companyId), eq(companyUsers.userId, userId)))
    .limit(1);
  return result[0];
}

export async function listCompanyTeamMembers(companyId: number) {
  const db = await getDb();
  if (!db) return [];
  const result = await db
    .select({
      id: companyUsers.id,
      companyId: companyUsers.companyId,
      userId: companyUsers.userId,
      teamRole: companyUsers.teamRole,
      invitedBy: companyUsers.invitedBy,
      acceptedAt: companyUsers.acceptedAt,
      createdAt: companyUsers.createdAt,
      userName: users.name,
      userEmail: users.email,
    })
    .from(companyUsers)
    .leftJoin(users, eq(companyUsers.userId, users.id))
    .where(eq(companyUsers.companyId, companyId))
    .orderBy(companyUsers.createdAt);
  return result;
}

export async function removeCompanyUser(companyId: number, userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(companyUsers).where(and(eq(companyUsers.companyId, companyId), eq(companyUsers.userId, userId)));
}

export async function updateCompanyUserTeamRole(companyId: number, userId: number, teamRole: "owner" | "admin" | "member") {
  const db = await getDb();
  if (!db) return;
  await db.update(companyUsers).set({ teamRole }).where(and(eq(companyUsers.companyId, companyId), eq(companyUsers.userId, userId)));
}

export async function getUserCompanyMembership(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(companyUsers).where(eq(companyUsers.userId, userId)).limit(1);
  return result[0];
}
