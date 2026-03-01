import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  boolean,
  decimal,
  json,
  bigint,
} from "drizzle-orm/mysql-core";

// ─── Users (base auth table) ───────────────────────────────────────────────
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  passwordHash: varchar("passwordHash", { length: 255 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin", "company_admin", "contractor"]).default("user").notNull(),
  companyId: int("companyId"),
  contractorProfileId: int("contractorProfileId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Companies (multi-tenant root) ─────────────────────────────────────────
export const companies = mysqlTable("companies", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  logoUrl: text("logoUrl"),
  address: text("address"),
  phone: varchar("phone", { length: 32 }),
  email: varchar("email", { length: 320 }),
  stripeAccountId: varchar("stripeAccountId", { length: 128 }),
  stripeCustomerId: varchar("stripeCustomerId", { length: 128 }),
  subscriptionTier: mysqlEnum("subscriptionTier", ["free", "starter", "professional", "enterprise"]).default("free").notNull(),
  subscriptionStatus: mysqlEnum("subscriptionStatus", ["active", "past_due", "canceled", "trialing"]).default("trialing").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Company = typeof companies.$inferSelect;
export type InsertCompany = typeof companies.$inferInsert;

// ─── Company Settings ──────────────────────────────────────────────────────
export const companySettings = mysqlTable("company_settings", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  // GPS & Time Tracking
  geofenceRadiusFeet: int("geofenceRadiusFeet").default(500).notNull(),
  autoClockOutMinutes: int("autoClockOutMinutes").default(5).notNull(),
  maxSessionDurationHours: int("maxSessionDurationHours").default(8).notNull(),
  timesheetReviewEnabled: boolean("timesheetReviewEnabled").default(true).notNull(),
  // Billable Time Policy: "on_site_only" | "full_trip" | "hybrid_with_cap"
  billableTimePolicy: mysqlEnum("billableTimePolicy", ["on_site_only", "full_trip", "hybrid_with_cap"]).default("on_site_only").notNull(),
  hybridCapMinutes: int("hybridCapMinutes").default(30),
  // Parts
  partsMarkupPercent: decimal("partsMarkupPercent", { precision: 5, scale: 2 }).default("0.00"),
  // Contractor Management
  autoApproveContractors: boolean("autoApproveContractors").default(false).notNull(),
  // Job Escalation
  escalationTimeoutMinutes: int("escalationTimeoutMinutes").default(60),
  // Platform fee override (percentage charged on top of job cost)
  platformFeePercent: decimal("platformFeePercent", { precision: 5, scale: 2 }).default("10.00"),
  // Notification Preferences
  notifyOnClockIn: boolean("notifyOnClockIn").default(true).notNull(),
  notifyOnClockOut: boolean("notifyOnClockOut").default(true).notNull(),
  notifyOnJobSubmitted: boolean("notifyOnJobSubmitted").default(true).notNull(),
  notifyOnNewContractor: boolean("notifyOnNewContractor").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CompanySettings = typeof companySettings.$inferSelect;
export type InsertCompanySettings = typeof companySettings.$inferInsert;

// ─── Skill Tiers (company-specific hourly rates) ───────────────────────────
export const skillTiers = mysqlTable("skill_tiers", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  hourlyRate: decimal("hourlyRate", { precision: 8, scale: 2 }).notNull(),
  emergencyMultiplier: decimal("emergencyMultiplier", { precision: 4, scale: 2 }).default("1.50"),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SkillTier = typeof skillTiers.$inferSelect;
export type InsertSkillTier = typeof skillTiers.$inferInsert;

// ─── Properties ────────────────────────────────────────────────────────────
export const properties = mysqlTable("properties", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  address: text("address").notNull(),
  city: varchar("city", { length: 128 }),
  state: varchar("state", { length: 64 }),
  zipCode: varchar("zipCode", { length: 16 }),
  latitude: decimal("latitude", { precision: 10, scale: 7 }),
  longitude: decimal("longitude", { precision: 10, scale: 7 }),
  units: int("units").default(1),
  externalId: varchar("externalId", { length: 128 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Property = typeof properties.$inferSelect;
export type InsertProperty = typeof properties.$inferInsert;

// ─── Contractor Profiles ───────────────────────────────────────────────────
export const contractorProfiles = mysqlTable("contractor_profiles", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  businessName: varchar("businessName", { length: 255 }),
  phone: varchar("phone", { length: 32 }),
  trades: json("trades").$type<string[]>(),
  serviceAreaZips: json("serviceAreaZips").$type<string[]>(),
  serviceRadiusMiles: int("serviceRadiusMiles").default(25),
  latitude: decimal("latitude", { precision: 10, scale: 7 }),
  longitude: decimal("longitude", { precision: 10, scale: 7 }),
  licenseNumber: varchar("licenseNumber", { length: 128 }),
  insuranceInfo: text("insuranceInfo"),
  stripeAccountId: varchar("stripeAccountId", { length: 128 }),
  stripeOnboardingComplete: boolean("stripeOnboardingComplete").default(false).notNull(),
  isAvailable: boolean("isAvailable").default(true).notNull(),
  rating: decimal("rating", { precision: 3, scale: 2 }).default("0.00"),
  completedJobs: int("completedJobs").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ContractorProfile = typeof contractorProfiles.$inferSelect;
export type InsertContractorProfile = typeof contractorProfiles.$inferInsert;

// ─── Contractor-Company Relationships ──────────────────────────────────────
export const contractorCompanies = mysqlTable("contractor_companies", {
  id: int("id").autoincrement().primaryKey(),
  contractorProfileId: int("contractorProfileId").notNull(),
  companyId: int("companyId").notNull(),
  status: mysqlEnum("status", ["pending", "approved", "rejected", "suspended"]).default("pending").notNull(),
  isPreferred: boolean("isPreferred").default(false).notNull(),
  invitedBy: mysqlEnum("invitedBy", ["company", "contractor"]).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ContractorCompany = typeof contractorCompanies.$inferSelect;
export type InsertContractorCompany = typeof contractorCompanies.$inferInsert;

// ─── Maintenance Requests (Jobs) ───────────────────────────────────────────
export const maintenanceRequests = mysqlTable("maintenance_requests", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  propertyId: int("propertyId").notNull(),
  // Source info
  externalId: varchar("externalId", { length: 128 }),
  source: mysqlEnum("source", ["manual", "buildium", "appfolio", "rentmanager", "yardi"]).default("manual").notNull(),
  // Tenant info
  tenantName: varchar("tenantName", { length: 255 }),
  tenantPhone: varchar("tenantPhone", { length: 32 }),
  tenantEmail: varchar("tenantEmail", { length: 320 }),
  unitNumber: varchar("unitNumber", { length: 32 }),
  // Request details
  title: varchar("title", { length: 500 }).notNull(),
  description: text("description").notNull(),
  photoUrls: json("photoUrls").$type<string[]>(),
  // AI classification
  aiPriority: mysqlEnum("aiPriority", ["low", "medium", "high", "emergency"]),
  aiSkillTier: varchar("aiSkillTier", { length: 100 }),
  aiSkillTierId: int("aiSkillTierId"),
  aiReasoning: text("aiReasoning"),
  aiClassifiedAt: timestamp("aiClassifiedAt"),
  // Job board
  postedToBoard: boolean("postedToBoard").default(false).notNull(),
  // Job status
  status: mysqlEnum("status", ["open", "assigned", "in_progress", "pending_verification", "completed", "verified", "disputed", "paid", "canceled"]).default("open").notNull(),
  assignedContractorId: int("assignedContractorId"),
  assignedAt: timestamp("assignedAt"),
  // Completion (contractor side)
  completedAt: timestamp("completedAt"),
  completionNotes: text("completionNotes"),
  completionPhotoUrls: json("completionPhotoUrls").$type<string[]>(),
  // Verification (company side)
  verifiedAt: timestamp("verifiedAt"),
  verifiedByUserId: int("verifiedByUserId"),
  verificationNotes: text("verificationNotes"),
  disputeNotes: text("disputeNotes"),
  disputedAt: timestamp("disputedAt"),
  stripePaymentIntentId: varchar("stripePaymentIntentId", { length: 128 }),
  paidAt: timestamp("paidAt"),
  // Financials
  skillTierId: int("skillTierId"),
  hourlyRate: decimal("hourlyRate", { precision: 8, scale: 2 }),
  isEmergency: boolean("isEmergency").default(false).notNull(),
  totalLaborMinutes: int("totalLaborMinutes"),
  totalLaborCost: decimal("totalLaborCost", { precision: 10, scale: 2 }),
  totalPartsCost: decimal("totalPartsCost", { precision: 10, scale: 2 }),
  platformFee: decimal("platformFee", { precision: 10, scale: 2 }),
  totalCost: decimal("totalCost", { precision: 10, scale: 2 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type MaintenanceRequest = typeof maintenanceRequests.$inferSelect;
export type InsertMaintenanceRequest = typeof maintenanceRequests.$inferInsert;

// ─── Time Tracking Sessions ────────────────────────────────────────────────
export const timeSessions = mysqlTable("time_sessions", {
  id: int("id").autoincrement().primaryKey(),
  maintenanceRequestId: int("maintenanceRequestId").notNull(),
  contractorProfileId: int("contractorProfileId").notNull(),
  companyId: int("companyId").notNull(),
  // Clock in
  clockInTime: bigint("clockInTime", { mode: "number" }).notNull(),
  clockInLat: decimal("clockInLat", { precision: 10, scale: 7 }),
  clockInLng: decimal("clockInLng", { precision: 10, scale: 7 }),
  clockInVerified: boolean("clockInVerified").default(false),
  // Clock out
  clockOutTime: bigint("clockOutTime", { mode: "number" }),
  clockOutLat: decimal("clockOutLat", { precision: 10, scale: 7 }),
  clockOutLng: decimal("clockOutLng", { precision: 10, scale: 7 }),
  clockOutVerified: boolean("clockOutVerified").default(false),
  clockOutMethod: mysqlEnum("clockOutMethod", ["manual", "auto_geofence", "auto_timeout", "admin"]),
  // Status
  status: mysqlEnum("status", ["active", "paused", "completed", "flagged"]).default("active").notNull(),
  totalMinutes: int("totalMinutes"),
  billableMinutes: int("billableMinutes"),
  // Contractor review
  contractorApproved: boolean("contractorApproved"),
  contractorNotes: text("contractorNotes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type TimeSession = typeof timeSessions.$inferSelect;
export type InsertTimeSession = typeof timeSessions.$inferInsert;

// ─── Location Pings (GPS trip logging) ─────────────────────────────────────
export const locationPings = mysqlTable("location_pings", {
  id: int("id").autoincrement().primaryKey(),
  timeSessionId: int("timeSessionId").notNull(),
  latitude: decimal("latitude", { precision: 10, scale: 7 }).notNull(),
  longitude: decimal("longitude", { precision: 10, scale: 7 }).notNull(),
  timestamp: bigint("timestamp", { mode: "number" }).notNull(),
  locationType: mysqlEnum("locationType", ["property", "store", "origin", "transit", "unknown"]).default("unknown"),
});

export type LocationPing = typeof locationPings.$inferSelect;
export type InsertLocationPing = typeof locationPings.$inferInsert;

// ─── Parts & Receipts ──────────────────────────────────────────────────────
export const partsReceipts = mysqlTable("parts_receipts", {
  id: int("id").autoincrement().primaryKey(),
  maintenanceRequestId: int("maintenanceRequestId").notNull(),
  contractorProfileId: int("contractorProfileId").notNull(),
  companyId: int("companyId").notNull(),
  storeName: varchar("storeName", { length: 255 }),
  description: text("description"),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  receiptImageUrl: text("receiptImageUrl"),
  approved: boolean("approved").default(false),
  approvedBy: int("approvedBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PartsReceipt = typeof partsReceipts.$inferSelect;
export type InsertPartsReceipt = typeof partsReceipts.$inferInsert;

// ─── Payments / Transactions ───────────────────────────────────────────────
export const transactions = mysqlTable("transactions", {
  id: int("id").autoincrement().primaryKey(),
  maintenanceRequestId: int("maintenanceRequestId").notNull(),
  companyId: int("companyId").notNull(),
  contractorProfileId: int("contractorProfileId").notNull(),
  // Amounts
  laborCost: decimal("laborCost", { precision: 10, scale: 2 }).notNull(),
  partsCost: decimal("partsCost", { precision: 10, scale: 2 }).default("0.00"),
  platformFee: decimal("platformFee", { precision: 10, scale: 2 }).notNull(),
  stripeFee: decimal("stripeFee", { precision: 10, scale: 2 }).default("0.00"),
  totalCharged: decimal("totalCharged", { precision: 10, scale: 2 }).notNull(),
  contractorPayout: decimal("contractorPayout", { precision: 10, scale: 2 }).notNull(),
  // Stripe
  stripePaymentIntentId: varchar("stripePaymentIntentId", { length: 128 }),
  stripeTransferId: varchar("stripeTransferId", { length: 128 }),
  status: mysqlEnum("status", ["pending", "escrow", "captured", "paid_out", "refunded", "failed"]).default("pending").notNull(),
  paidAt: timestamp("paidAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Transaction = typeof transactions.$inferSelect;
export type InsertTransaction = typeof transactions.$inferInsert;

// ─── Platform Settings (admin-controlled global settings) ────────────────────
export const platformSettings = mysqlTable("platform_settings", {
  id: int("id").autoincrement().primaryKey(),
  // Platform fee charged ON TOP of job cost (not taken from contractor)
  platformFeePercent: decimal("platformFeePercent", { precision: 5, scale: 2 }).default("5.00").notNull(),
  // Optional per-listing fee charged to company when a job is posted
  perListingFeeEnabled: boolean("perListingFeeEnabled").default(false).notNull(),
  perListingFeeAmount: decimal("perListingFeeAmount", { precision: 8, scale: 2 }).default("0.00").notNull(),
  // Auto clock-out: minutes after contractor returns to origin before auto clock-out fires
  autoClockOutMinutes: int("autoClockOutMinutes").default(15).notNull(),
  // Return-to-origin radius in meters to trigger auto clock-out check
  autoClockOutRadiusMeters: int("autoClockOutRadiusMeters").default(200).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PlatformSettings = typeof platformSettings.$inferSelect;
export type InsertPlatformSettings = typeof platformSettings.$inferInsert;

// ─── Integration Connectors ────────────────────────────────────────────────
export const integrationConnectors = mysqlTable("integration_connectors", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  provider: mysqlEnum("provider", ["buildium", "appfolio", "rentmanager", "yardi"]).notNull(),
  apiKey: text("apiKey"),
  apiSecret: text("apiSecret"),
  baseUrl: text("baseUrl"),
  isActive: boolean("isActive").default(false).notNull(),
  lastSyncAt: timestamp("lastSyncAt"),
  syncStatus: mysqlEnum("syncStatus", ["idle", "syncing", "success", "error"]).default("idle"),
  syncError: text("syncError"),
  config: json("config").$type<Record<string, unknown>>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type IntegrationConnector = typeof integrationConnectors.$inferSelect;
export type InsertIntegrationConnector = typeof integrationConnectors.$inferInsert;
