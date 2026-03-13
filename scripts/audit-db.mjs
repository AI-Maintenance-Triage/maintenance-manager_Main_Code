/**
 * Production Database Audit Script
 * Compares local Drizzle schema definitions against the live production database.
 * Run with: node scripts/audit-db.mjs
 */
import mysql from 'mysql2/promise';
import { readFileSync } from 'fs';

// Read DATABASE_URL from environment
const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

// Local schema: tables and their expected columns (extracted from drizzle/schema.ts)
const localSchema = {
  users: [
    'id', 'email', 'name', 'role', 'passwordHash', 'authProvider', 'openId',
    'avatarUrl', 'isActive', 'createdAt', 'updatedAt',
    'emailVerificationCode', 'emailVerificationExpiry', 'emailVerified'
  ],
  companies: [
    'id', 'name', 'email', 'phone', 'address', 'city', 'state', 'zip',
    'logoUrl', 'userId', 'subscriptionPlanId', 'stripeCustomerId',
    'stripeSubscriptionId', 'planStatus', 'billingInterval', 'trialEndsAt',
    'isActive', 'createdAt', 'updatedAt'
  ],
  company_settings: [
    'id', 'companyId', 'requireJobPhotos', 'requireCompletionNotes',
    'autoAssignEnabled', 'notifyOnNewJob', 'notifyOnJobComplete',
    'notifyOnDispute', 'defaultJobPriority', 'createdAt', 'updatedAt'
  ],
  skill_tiers: [
    'id', 'companyId', 'name', 'description', 'basePrice', 'urgentMultiplier',
    'emergencyMultiplier', 'isActive', 'sortOrder', 'createdAt', 'updatedAt'
  ],
  properties: [
    'id', 'companyId', 'name', 'address', 'city', 'state', 'zip',
    'propertyType', 'unitCount', 'isActive', 'externalId', 'createdAt', 'updatedAt'
  ],
  property_units: [
    'id', 'propertyId', 'companyId', 'unitNumber', 'floor', 'bedrooms',
    'bathrooms', 'sqft', 'isOccupied', 'tenantName', 'tenantPhone',
    'tenantEmail', 'externalId', 'createdAt', 'updatedAt'
  ],
  contractor_profiles: [
    'id', 'userId', 'companyName', 'phone', 'address', 'bio', 'skills',
    'licenseNumber', 'insuranceInfo', 'rating', 'totalJobs', 'isVerified',
    'isAvailable', 'stripeAccountId', 'stripeAccountStatus',
    'subscriptionPlanId', 'stripeCustomerId', 'stripeSubscriptionId',
    'planStatus', 'billingInterval', 'trialEndsAt', 'createdAt', 'updatedAt'
  ],
  contractor_companies: [
    'id', 'contractorId', 'companyId', 'status', 'invitedAt', 'acceptedAt', 'createdAt'
  ],
  maintenance_requests: [
    'id', 'companyId', 'propertyId', 'unitId', 'title', 'description',
    'status', 'priority', 'skillTierId', 'estimatedCost', 'finalCost',
    'contractorId', 'assignedAt', 'completedAt', 'verifiedAt', 'paidAt',
    'completionNotes', 'completionPhotos', 'source', 'externalId',
    'externalProvider', 'tenantName', 'tenantPhone', 'tenantEmail',
    'isPublic', 'bidDeadline', 'acceptedBidId', 'createdAt', 'updatedAt'
  ],
  time_sessions: [
    'id', 'jobId', 'contractorId', 'clockInAt', 'clockOutAt',
    'clockInLat', 'clockInLng', 'clockOutLat', 'clockOutLng',
    'durationMinutes', 'notes', 'createdAt'
  ],
  location_pings: [
    'id', 'jobId', 'contractorId', 'lat', 'lng', 'accuracy', 'createdAt'
  ],
  parts_receipts: [
    'id', 'jobId', 'contractorId', 'description', 'amount', 'receiptUrl',
    'status', 'approvedBy', 'approvedAt', 'createdAt', 'updatedAt'
  ],
  transactions: [
    'id', 'jobId', 'companyId', 'contractorId', 'amount', 'platformFee',
    'contractorPayout', 'stripePaymentIntentId', 'stripeTransferId',
    'status', 'paymentMethod', 'paidAt', 'createdAt', 'updatedAt'
  ],
  platform_settings: [
    'id', 'key', 'value', 'description', 'updatedAt', 'updatedBy'
  ],
  integration_connectors: [
    'id', 'userId', 'service', 'accessToken', 'refreshToken', 'expiresAt',
    'scope', 'metadata', 'createdAt', 'updatedAt'
  ],
  contractor_ratings: [
    'id', 'jobId', 'contractorId', 'companyId', 'rating', 'review',
    'createdAt', 'updatedAt'
  ],
  job_comments: [
    'id', 'jobId', 'userId', 'role', 'content', 'isInternal', 'createdAt'
  ],
  notifications: [
    'id', 'userId', 'title', 'message', 'type', 'isRead', 'relatedId',
    'relatedType', 'createdAt'
  ],
  subscription_plans: [
    'id', 'name', 'description', 'priceMonthly', 'priceAnnual', 'features',
    'isActive', 'sortOrder', 'platformFeePercent', 'perListingFeeEnabled',
    'perListingFeeAmount', 'planType', 'earlyNotificationMinutes',
    'stripePriceIdMonthly', 'stripePriceIdAnnual', 'stripeProductId',
    'createdAt', 'updatedAt'
  ],
  contractor_invites: [
    'id', 'companyId', 'email', 'token', 'status', 'expiresAt',
    'acceptedAt', 'createdAt'
  ],
  pms_webhook_events: [
    'id', 'companyId', 'provider', 'eventType', 'payload', 'processed',
    'processedAt', 'errorMessage', 'createdAt'
  ],
  company_payment_methods: [
    'id', 'companyId', 'stripePaymentMethodId', 'brand', 'last4',
    'expMonth', 'expYear', 'isDefault', 'createdAt', 'updatedAt'
  ],
  promo_codes: [
    'id', 'code', 'description', 'discountType', 'discountValue',
    'maxUses', 'usedCount', 'expiresAt', 'isActive', 'planType',
    'createdAt', 'updatedAt'
  ],
  company_promo_redemptions: [
    'id', 'companyId', 'promoCodeId', 'redeemedAt'
  ],
  platform_announcements: [
    'id', 'title', 'content', 'type', 'targetRole', 'isActive',
    'expiresAt', 'createdAt', 'updatedAt', 'createdBy'
  ],
  dismissed_announcements: [
    'id', 'userId', 'announcementId', 'dismissedAt'
  ],
  feature_flags: [
    'id', 'key', 'description', 'isEnabled', 'targetRoles',
    'createdAt', 'updatedAt', 'updatedBy'
  ],
  audit_log: [
    'id', 'userId', 'action', 'targetType', 'targetId', 'details',
    'ipAddress', 'userAgent', 'createdAt'
  ],
  account_suspensions: [
    'id', 'userId', 'reason', 'suspendedBy', 'suspendedAt',
    'liftedAt', 'liftedBy', 'isActive'
  ],
  account_credits: [
    'id', 'userId', 'companyId', 'amount', 'reason', 'grantedBy',
    'expiresAt', 'usedAt', 'createdAt'
  ],
  payout_holds: [
    'id', 'contractorId', 'reason', 'placedBy', 'placedAt',
    'releasedAt', 'releasedBy', 'isActive'
  ],
  activity_events: [
    'id', 'eventType', 'title', 'description', 'actorId', 'actorName',
    'relatedId', 'relatedType', 'createdAt'
  ],
  maintenance_mode: [
    'id', 'isEnabled', 'message', 'enabledBy', 'enabledAt', 'updatedAt'
  ],
  pms_integrations: [
    'id', 'companyId', 'provider', 'authType', 'credentialsJson',
    'webhookSecret', 'status', 'lastSyncAt', 'lastErrorMessage',
    'createdAt', 'updatedAt'
  ],
  password_reset_tokens: [
    'id', 'userId', 'token', 'expiresAt', 'usedAt', 'createdAt'
  ],
  job_change_history: [
    'id', 'jobId', 'companyId', 'userId', 'changeType',
    'fromValue', 'toValue', 'note', 'createdAt'
  ],
};

async function runAudit() {
  const conn = await mysql.createConnection(dbUrl);
  
  // Get all production tables
  const [prodTables] = await conn.execute(
    `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME`
  );
  const prodTableNames = new Set(prodTables.map(r => r.TABLE_NAME));
  
  // Get all production columns
  const [prodColumns] = await conn.execute(
    `SELECT TABLE_NAME, COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME, ORDINAL_POSITION`
  );
  
  // Build map: tableName -> Set of column names
  const prodColMap = {};
  for (const row of prodColumns) {
    if (!prodColMap[row.TABLE_NAME]) prodColMap[row.TABLE_NAME] = new Set();
    prodColMap[row.TABLE_NAME].add(row.COLUMN_NAME);
  }
  
  const localTableNames = new Set(Object.keys(localSchema));
  
  console.log('\n========== PRODUCTION DATABASE AUDIT ==========\n');
  
  // 1. Tables in local schema but missing from production
  const missingTables = [...localTableNames].filter(t => !prodTableNames.has(t));
  console.log(`MISSING TABLES (${missingTables.length}):`);
  if (missingTables.length === 0) console.log('  ✅ All local schema tables exist in production');
  else missingTables.forEach(t => console.log(`  ❌ MISSING: ${t}`));
  
  // 2. Tables in production but not in local schema (extra tables)
  const extraTables = [...prodTableNames].filter(t => !localTableNames.has(t));
  console.log(`\nEXTRA TABLES IN PRODUCTION (${extraTables.length}):`);
  if (extraTables.length === 0) console.log('  ✅ No unexpected extra tables');
  else extraTables.forEach(t => console.log(`  ℹ️  EXTRA: ${t}`));
  
  // 3. Column-by-column comparison for each table
  console.log('\nCOLUMN AUDIT (missing columns per table):');
  let totalMissingCols = 0;
  for (const [tableName, localCols] of Object.entries(localSchema)) {
    if (!prodTableNames.has(tableName)) continue; // already flagged as missing table
    const prodCols = prodColMap[tableName] || new Set();
    const missingCols = localCols.filter(c => !prodCols.has(c));
    if (missingCols.length > 0) {
      console.log(`  ❌ ${tableName}: MISSING COLUMNS: ${missingCols.join(', ')}`);
      totalMissingCols += missingCols.length;
    }
  }
  if (totalMissingCols === 0) console.log('  ✅ All expected columns present in all tables');
  
  // 4. Check key data
  console.log('\nKEY DATA CHECKS:');
  const [plans] = await conn.execute('SELECT id, name, planType FROM subscription_plans ORDER BY planType, sortOrder');
  console.log(`  subscription_plans: ${plans.length} rows`);
  plans.forEach(p => console.log(`    - [${p.planType}] ${p.name}`));
  
  const [settings] = await conn.execute('SELECT COUNT(*) as cnt FROM platform_settings');
  console.log(`  platform_settings: ${settings[0].cnt} rows`);
  
  const [flags] = await conn.execute('SELECT COUNT(*) as cnt FROM feature_flags');
  console.log(`  feature_flags: ${flags[0].cnt} rows`);
  
  const [mainMode] = await conn.execute('SELECT COUNT(*) as cnt FROM maintenance_mode');
  console.log(`  maintenance_mode: ${mainMode[0].cnt} rows`);
  
  // 5. Check maintenance_requests for important columns
  console.log('\nMAINTENANCE_REQUESTS COLUMN CHECK:');
  const mrCols = prodColMap['maintenance_requests'] || new Set();
  const importantMrCols = ['tenantName', 'tenantPhone', 'tenantEmail', 'completionNotes', 
    'completionPhotos', 'isPublic', 'bidDeadline', 'acceptedBidId', 'externalProvider'];
  importantMrCols.forEach(c => {
    console.log(`  ${mrCols.has(c) ? '✅' : '❌'} ${c}`);
  });
  
  await conn.end();
  console.log('\n========== AUDIT COMPLETE ==========\n');
}

runAudit().catch(err => {
  console.error('Audit failed:', err.message);
  process.exit(1);
});
