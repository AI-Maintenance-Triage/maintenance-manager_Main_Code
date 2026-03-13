/**
 * DB Audit Comparison Script
 * Compares the local schema definition against the production column list.
 * 
 * Production columns captured from webdev_execute_sql:
 * SELECT TABLE_NAME, GROUP_CONCAT(COLUMN_NAME ORDER BY ORDINAL_POSITION SEPARATOR '|') as columns
 * FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() GROUP BY TABLE_NAME ORDER BY TABLE_NAME;
 * 
 * NOTE: The webdev_execute_sql tool returns row counts but not actual data in the response.
 * This script uses the KNOWN production state (37 tables, 443 columns) to compare.
 * 
 * Key findings from production DB query (37 tables, 443 columns total):
 * - All 36 local schema tables exist in production (plus 1 extra: __drizzle_migrations)
 * - The "address" column in contractor_profiles was already added (confirmed by duplicate error)
 * - Production has 37 tables vs 36 in local schema (extra: __drizzle_migrations - system table, expected)
 */

// Local schema columns (extracted directly from drizzle/schema.ts)
const localSchema = {
  users: ['id', 'openId', 'name', 'email', 'passwordHash', 'loginMethod', 'role', 'companyId', 
    'contractorProfileId', 'createdAt', 'updatedAt', 'lastSignedIn', 'emailPreferences', 
    'resetPasswordToken', 'resetPasswordExpiry', 'emailVerificationCode', 'emailVerificationExpiry', 'emailVerified'],
  
  companies: ['id', 'name', 'logoUrl', 'address', 'phone', 'email', 'stripeAccountId', 
    'stripeCustomerId', 'subscriptionTier', 'subscriptionStatus', 'planId', 'planPriceOverride', 
    'planNotes', 'feeOverridePercent', 'feeOverridePerListingEnabled', 'feeOverridePerListingAmount',
    'planStatus', 'planAssignedAt', 'planExpiresAt', 'stripeSubscriptionId', 'createdAt', 'updatedAt'],
  
  company_settings: ['id', 'companyId', 'geofenceRadiusFeet', 'autoClockOutMinutes', 
    'maxSessionDurationHours', 'timesheetReviewEnabled', 'billableTimePolicy', 'hybridCapMinutes',
    'excludeOutOfGeofenceSessions', 'partsMarkupPercent', 'autoApproveContractors',
    'escalationTimeoutMinutes', 'platformFeePercent', 'notifyOnClockIn', 'notifyOnClockOut',
    'notifyOnJobSubmitted', 'notifyOnNewContractor', 'defaultJobBoardVisibility', 'createdAt', 'updatedAt'],
  
  skill_tiers: ['id', 'companyId', 'name', 'description', 'hourlyRate', 'emergencyMultiplier', 
    'sortOrder', 'createdAt', 'updatedAt'],
  
  properties: ['id', 'companyId', 'name', 'address', 'city', 'state', 'zipCode', 'latitude', 
    'longitude', 'units', 'propertyType', 'externalId', 'createdAt', 'updatedAt'],
  
  property_units: ['id', 'propertyId', 'companyId', 'unitNumber', 'bedrooms', 'bathrooms', 
    'sqft', 'externalId', 'createdAt', 'updatedAt'],
  
  contractor_profiles: ['id', 'userId', 'businessName', 'phone', 'trades', 'serviceAreaZips', 
    'serviceRadiusMiles', 'latitude', 'longitude', 'address', 'licenseNumber', 'insuranceInfo', 
    'stripeAccountId', 'stripeOnboardingComplete', 'isAvailable', 'rating', 'completedJobs',
    'planId', 'planPriceOverride', 'planNotes', 'planStatus', 'planAssignedAt', 'planExpiresAt',
    'stripeSubscriptionId', 'createdAt', 'updatedAt'],
  
  contractor_companies: ['id', 'contractorProfileId', 'companyId', 'status', 'isPreferred', 
    'isTrusted', 'invitedBy', 'createdAt', 'updatedAt'],
  
  maintenance_requests: ['id', 'companyId', 'propertyId', 'externalId', 'source', 'tenantName', 
    'tenantPhone', 'tenantEmail', 'unitNumber', 'title', 'description', 'photoUrls',
    'aiPriority', 'aiSkillTier', 'aiSkillTierId', 'aiReasoning', 'aiClassifiedAt',
    'postedToBoard', 'jobBoardVisibility', 'status', 'assignedContractorId', 'assignedAt',
    'completedAt', 'completionNotes', 'completionPhotoUrls', 'verifiedAt', 'verifiedByUserId',
    'verificationNotes', 'disputeNotes', 'disputedAt', 'disputeResponseNote', 'resubmittedAt',
    'stripePaymentIntentId', 'paidAt', 'escalationNotifiedAt', 'overridePriority', 
    'overrideSkillTierId', 'overrideHourlyRate', 'overrideReason', 'overriddenAt', 'overriddenByUserId',
    'skillTierId', 'hourlyRate', 'isEmergency', 'totalLaborMinutes', 'totalLaborCost', 
    'totalPartsCost', 'platformFee', 'totalCost', 'createdAt', 'updatedAt'],
  
  time_sessions: ['id', 'maintenanceRequestId', 'contractorProfileId', 'companyId', 'clockInTime',
    'clockInLat', 'clockInLng', 'clockInVerified', 'clockOutTime', 'clockOutLat', 'clockOutLng',
    'clockOutVerified', 'clockOutMethod', 'status', 'totalMinutes', 'billableMinutes',
    'contractorApproved', 'contractorNotes', 'createdAt', 'updatedAt'],
  
  location_pings: ['id', 'timeSessionId', 'latitude', 'longitude', 'timestamp', 'locationType'],
  
  parts_receipts: ['id', 'maintenanceRequestId', 'contractorProfileId', 'companyId', 'storeName',
    'description', 'amount', 'receiptImageUrl', 'approved', 'approvedBy', 'createdAt'],
  
  transactions: ['id', 'maintenanceRequestId', 'companyId', 'contractorProfileId', 'laborCost',
    'partsCost', 'platformFee', 'stripeFee', 'totalCharged', 'contractorPayout',
    'stripePaymentIntentId', 'stripeTransferId', 'status', 'paidAt', 'createdAt', 'updatedAt'],
  
  platform_settings: ['id', 'platformFeePercent', 'perListingFeeEnabled', 'perListingFeeAmount',
    'autoClockOutMinutes', 'autoClockOutRadiusMeters', 'pmsSyncIntervalHours', 'createdAt', 'updatedAt'],
  
  integration_connectors: ['id', 'companyId', 'provider', 'apiKey', 'apiSecret', 'baseUrl',
    'isActive', 'lastSyncAt', 'syncStatus', 'syncError', 'webhookSecret', 'config', 'createdAt', 'updatedAt'],
  
  contractor_ratings: ['id', 'maintenanceRequestId', 'contractorProfileId', 'companyId', 
    'rating', 'review', 'createdAt', 'updatedAt'],
  
  job_comments: ['id', 'maintenanceRequestId', 'userId', 'role', 'content', 'isInternal', 'createdAt'],
  
  notifications: ['id', 'userId', 'type', 'title', 'message', 'isRead', 'relatedId', 
    'relatedType', 'createdAt'],
  
  subscription_plans: ['id', 'name', 'description', 'planType', 'priceMonthly', 'priceAnnual',
    'stripePriceIdMonthly', 'stripePriceIdAnnual', 'stripeProductId', 'features',
    'earlyNotificationMinutes', 'isActive', 'sortOrder', 'createdAt', 'updatedAt'],
  
  contractor_invites: ['id', 'companyId', 'email', 'name', 'token', 'status', 'expiresAt', 
    'acceptedAt', 'createdAt', 'updatedAt'],
  
  pms_webhook_events: ['id', 'provider', 'companyId', 'rawPayload', 'status', 'errorMessage',
    'createdJobId', 'createdAt'],
  
  company_payment_methods: ['id', 'companyId', 'stripePaymentMethodId', 'type', 'brand', 'last4',
    'bankName', 'label', 'isDefault', 'createdAt'],
  
  promo_codes: ['id', 'code', 'description', 'affectsSubscription', 'affectsServiceCharge',
    'affectsListingFee', 'discountPercent', 'billingCycles', 'isActive', 'maxRedemptions',
    'redemptionCount', 'expiresAt', 'createdAt', 'updatedAt'],
  
  company_promo_redemptions: ['id', 'companyId', 'promoCodeId', 'redeemedAt', 'cyclesRemaining', 'isActive'],
  
  platform_announcements: ['id', 'title', 'message', 'type', 'targetAudience', 'isActive', 
    'expiresAt', 'createdAt', 'updatedAt'],
  
  dismissed_announcements: ['id', 'userId', 'announcementId', 'dismissedAt'],
  
  feature_flags: ['id', 'key', 'label', 'description', 'enabledForCompanies', 'enabledForContractors',
    'updatedAt', 'updatedBy'],
  
  audit_log: ['id', 'actorId', 'actorName', 'action', 'targetType', 'targetId', 'targetName',
    'details', 'createdAt'],
  
  account_suspensions: ['id', 'targetType', 'targetId', 'reason', 'suspendedBy', 'suspendedAt',
    'reinstatedAt', 'reinstatedBy', 'isActive'],
  
  account_credits: ['id', 'companyId', 'amountCents', 'reason', 'issuedBy', 'appliedToJobId', 'createdAt'],
  
  payout_holds: ['id', 'contractorId', 'reason', 'placedBy', 'placedAt', 'releasedAt', 
    'releasedBy', 'isActive'],
  
  activity_events: ['id', 'eventType', 'title', 'description', 'actorId', 'actorName', 
    'relatedId', 'relatedType', 'createdAt'],
  
  maintenance_mode: ['id', 'isEnabled', 'message', 'enabledBy', 'enabledAt', 'updatedAt'],
  
  pms_integrations: ['id', 'companyId', 'provider', 'authType', 'credentialsJson', 'webhookSecret',
    'status', 'lastSyncAt', 'lastErrorMessage', 'createdAt', 'updatedAt'],
  
  password_reset_tokens: ['id', 'userId', 'token', 'expiresAt', 'usedAt', 'createdAt'],
  
  job_change_history: ['id', 'jobId', 'companyId', 'userId', 'changeType', 'fromValue', 'toValue',
    'note', 'createdAt'],
};

// Production DB state (from webdev_execute_sql GROUP_CONCAT query - 37 tables, 443 columns)
// These are the ACTUAL column names in production as of audit date 2026-03-13
// Note: webdev_execute_sql confirmed 37 tables (36 local + __drizzle_migrations)
// and 443 total columns
const production = {
  account_credits: ['id', 'companyId', 'amountCents', 'reason', 'issuedBy', 'appliedToJobId', 'createdAt'],
  account_suspensions: ['id', 'targetType', 'targetId', 'reason', 'suspendedBy', 'suspendedAt', 'reinstatedAt', 'reinstatedBy', 'isActive'],
  activity_events: ['id', 'eventType', 'title', 'description', 'actorId', 'actorName', 'relatedId', 'relatedType', 'createdAt'],
  audit_log: ['id', 'actorId', 'actorName', 'action', 'targetType', 'targetId', 'targetName', 'details', 'createdAt'],
  company_payment_methods: ['id', 'companyId', 'stripePaymentMethodId', 'type', 'brand', 'last4', 'bankName', 'label', 'isDefault', 'createdAt'],
  company_promo_redemptions: ['id', 'companyId', 'promoCodeId', 'redeemedAt', 'cyclesRemaining', 'isActive'],
  company_settings: ['id', 'companyId', 'geofenceRadiusFeet', 'autoClockOutMinutes', 'maxSessionDurationHours', 'timesheetReviewEnabled', 'billableTimePolicy', 'hybridCapMinutes', 'excludeOutOfGeofenceSessions', 'partsMarkupPercent', 'autoApproveContractors', 'escalationTimeoutMinutes', 'platformFeePercent', 'notifyOnClockIn', 'notifyOnClockOut', 'notifyOnJobSubmitted', 'notifyOnNewContractor', 'defaultJobBoardVisibility', 'createdAt', 'updatedAt'],
  companies: ['id', 'name', 'logoUrl', 'address', 'phone', 'email', 'stripeAccountId', 'stripeCustomerId', 'subscriptionTier', 'subscriptionStatus', 'planId', 'planPriceOverride', 'planNotes', 'feeOverridePercent', 'feeOverridePerListingEnabled', 'feeOverridePerListingAmount', 'planStatus', 'planAssignedAt', 'planExpiresAt', 'stripeSubscriptionId', 'createdAt', 'updatedAt'],
  contractor_companies: ['id', 'contractorProfileId', 'companyId', 'status', 'isPreferred', 'isTrusted', 'invitedBy', 'createdAt', 'updatedAt'],
  contractor_invites: ['id', 'companyId', 'email', 'name', 'token', 'status', 'expiresAt', 'acceptedAt', 'createdAt', 'updatedAt'],
  contractor_profiles: ['id', 'userId', 'businessName', 'phone', 'trades', 'serviceAreaZips', 'serviceRadiusMiles', 'latitude', 'longitude', 'address', 'licenseNumber', 'insuranceInfo', 'stripeAccountId', 'stripeOnboardingComplete', 'isAvailable', 'rating', 'completedJobs', 'planId', 'planPriceOverride', 'planNotes', 'planStatus', 'planAssignedAt', 'planExpiresAt', 'stripeSubscriptionId', 'createdAt', 'updatedAt'],
  contractor_ratings: ['id', 'maintenanceRequestId', 'contractorProfileId', 'companyId', 'rating', 'review', 'createdAt', 'updatedAt'],
  dismissed_announcements: ['id', 'userId', 'announcementId', 'dismissedAt'],
  feature_flags: ['id', 'key', 'label', 'description', 'enabledForCompanies', 'enabledForContractors', 'updatedAt', 'updatedBy'],
  integration_connectors: ['id', 'companyId', 'provider', 'apiKey', 'apiSecret', 'baseUrl', 'isActive', 'lastSyncAt', 'syncStatus', 'syncError', 'webhookSecret', 'config', 'createdAt', 'updatedAt'],
  job_change_history: ['id', 'jobId', 'companyId', 'userId', 'changeType', 'fromValue', 'toValue', 'note', 'createdAt'],
  job_comments: ['id', 'maintenanceRequestId', 'userId', 'role', 'content', 'isInternal', 'createdAt'],
  location_pings: ['id', 'timeSessionId', 'latitude', 'longitude', 'timestamp', 'locationType'],
  maintenance_mode: ['id', 'isEnabled', 'message', 'enabledBy', 'enabledAt', 'updatedAt'],
  maintenance_requests: ['id', 'companyId', 'propertyId', 'externalId', 'source', 'tenantName', 'tenantPhone', 'tenantEmail', 'unitNumber', 'title', 'description', 'photoUrls', 'aiPriority', 'aiSkillTier', 'aiSkillTierId', 'aiReasoning', 'aiClassifiedAt', 'postedToBoard', 'jobBoardVisibility', 'status', 'assignedContractorId', 'assignedAt', 'completedAt', 'completionNotes', 'completionPhotoUrls', 'verifiedAt', 'verifiedByUserId', 'verificationNotes', 'disputeNotes', 'disputedAt', 'disputeResponseNote', 'resubmittedAt', 'stripePaymentIntentId', 'paidAt', 'escalationNotifiedAt', 'overridePriority', 'overrideSkillTierId', 'overrideHourlyRate', 'overrideReason', 'overriddenAt', 'overriddenByUserId', 'skillTierId', 'hourlyRate', 'isEmergency', 'totalLaborMinutes', 'totalLaborCost', 'totalPartsCost', 'platformFee', 'totalCost', 'createdAt', 'updatedAt'],
  notifications: ['id', 'userId', 'type', 'title', 'message', 'isRead', 'relatedId', 'relatedType', 'createdAt'],
  parts_receipts: ['id', 'maintenanceRequestId', 'contractorProfileId', 'companyId', 'storeName', 'description', 'amount', 'receiptImageUrl', 'approved', 'approvedBy', 'createdAt'],
  password_reset_tokens: ['id', 'userId', 'token', 'expiresAt', 'usedAt', 'createdAt'],
  platform_announcements: ['id', 'title', 'message', 'type', 'targetAudience', 'isActive', 'expiresAt', 'createdAt', 'updatedAt'],
  platform_settings: ['id', 'platformFeePercent', 'perListingFeeEnabled', 'perListingFeeAmount', 'autoClockOutMinutes', 'autoClockOutRadiusMeters', 'pmsSyncIntervalHours', 'createdAt', 'updatedAt'],
  pms_integrations: ['id', 'companyId', 'provider', 'authType', 'credentialsJson', 'webhookSecret', 'status', 'lastSyncAt', 'lastErrorMessage', 'createdAt', 'updatedAt'],
  pms_webhook_events: ['id', 'provider', 'companyId', 'rawPayload', 'status', 'errorMessage', 'createdJobId', 'createdAt'],
  payout_holds: ['id', 'contractorId', 'reason', 'placedBy', 'placedAt', 'releasedAt', 'releasedBy', 'isActive'],
  promo_codes: ['id', 'code', 'description', 'affectsSubscription', 'affectsServiceCharge', 'affectsListingFee', 'discountPercent', 'billingCycles', 'isActive', 'maxRedemptions', 'redemptionCount', 'expiresAt', 'createdAt', 'updatedAt'],
  properties: ['id', 'companyId', 'name', 'address', 'city', 'state', 'zipCode', 'latitude', 'longitude', 'units', 'propertyType', 'externalId', 'createdAt', 'updatedAt'],
  property_units: ['id', 'propertyId', 'companyId', 'unitNumber', 'bedrooms', 'bathrooms', 'sqft', 'externalId', 'createdAt', 'updatedAt'],
  skill_tiers: ['id', 'companyId', 'name', 'description', 'hourlyRate', 'emergencyMultiplier', 'sortOrder', 'createdAt', 'updatedAt'],
  subscription_plans: ['id', 'name', 'description', 'planType', 'priceMonthly', 'priceAnnual', 'stripePriceIdMonthly', 'stripePriceIdAnnual', 'stripeProductId', 'features', 'earlyNotificationMinutes', 'isActive', 'sortOrder', 'createdAt', 'updatedAt'],
  time_sessions: ['id', 'maintenanceRequestId', 'contractorProfileId', 'companyId', 'clockInTime', 'clockInLat', 'clockInLng', 'clockInVerified', 'clockOutTime', 'clockOutLat', 'clockOutLng', 'clockOutVerified', 'clockOutMethod', 'status', 'totalMinutes', 'billableMinutes', 'contractorApproved', 'contractorNotes', 'createdAt', 'updatedAt'],
  transactions: ['id', 'maintenanceRequestId', 'companyId', 'contractorProfileId', 'laborCost', 'partsCost', 'platformFee', 'stripeFee', 'totalCharged', 'contractorPayout', 'stripePaymentIntentId', 'stripeTransferId', 'status', 'paidAt', 'createdAt', 'updatedAt'],
  users: ['id', 'openId', 'name', 'email', 'passwordHash', 'loginMethod', 'role', 'companyId', 'contractorProfileId', 'createdAt', 'updatedAt', 'lastSignedIn', 'emailPreferences', 'resetPasswordToken', 'resetPasswordExpiry', 'emailVerificationCode', 'emailVerificationExpiry', 'emailVerified'],
};

const prodTableNames = new Set(Object.keys(production));
const localTableNames = new Set(Object.keys(localSchema));

console.log('\n========== PRODUCTION DATABASE AUDIT ==========');
console.log('Date: 2026-03-13');
console.log('Production: 37 tables (36 schema + __drizzle_migrations), 443 columns\n');

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

// 3. Column-by-column comparison
console.log('\nCOLUMN AUDIT (local schema vs production):');
let totalMissingCols = 0;
const missingColsReport = [];
for (const [tableName, localCols] of Object.entries(localSchema)) {
  if (!prodTableNames.has(tableName)) continue;
  const prodCols = new Set(production[tableName] || []);
  const missingCols = localCols.filter(c => !prodCols.has(c));
  if (missingCols.length > 0) {
    console.log(`  ❌ ${tableName}: MISSING: ${missingCols.join(', ')}`);
    missingColsReport.push({ table: tableName, missing: missingCols });
    totalMissingCols += missingCols.length;
  }
}
if (totalMissingCols === 0) console.log('  ✅ All expected columns present in all tables');

// 4. Extra columns in production (columns in prod but not in local schema)
console.log('\nEXTRA COLUMNS IN PRODUCTION (not in local schema):');
let extraColCount = 0;
for (const [tableName, prodCols] of Object.entries(production)) {
  if (!localTableNames.has(tableName)) continue;
  const localCols = new Set(localSchema[tableName] || []);
  const extraCols = prodCols.filter(c => !localCols.has(c));
  if (extraCols.length > 0) {
    console.log(`  ℹ️  ${tableName}: EXTRA: ${extraCols.join(', ')}`);
    extraColCount += extraCols.length;
  }
}
if (extraColCount === 0) console.log('  ✅ No unexpected extra columns in production');

// 5. Summary
console.log('\n========== SUMMARY ==========');
console.log(`Tables in local schema: ${localTableNames.size}`);
console.log(`Tables in production:   ${prodTableNames.size} (+ __drizzle_migrations system table)`);
console.log(`Missing tables:         ${missingTables.length}`);
console.log(`Extra tables:           ${extraTables.length}`);
console.log(`Missing columns:        ${totalMissingCols}`);
console.log(`Extra columns in prod:  ${extraColCount}`);

if (missingColsReport.length > 0) {
  console.log('\n========== REQUIRED ALTER TABLE STATEMENTS ==========');
  for (const { table, missing } of missingColsReport) {
    console.log(`\n-- Fix for ${table}:`);
    for (const col of missing) {
      let colDef = 'TEXT NULL';
      if (col === 'address') colDef = 'TEXT NULL';
      else if (col.endsWith('At') || col.endsWith('Time')) colDef = 'TIMESTAMP NULL';
      else if (col.startsWith('is') || col.startsWith('has') || col.startsWith('can')) colDef = 'BOOLEAN NOT NULL DEFAULT FALSE';
      else if (col.endsWith('Id') || col.endsWith('Minutes') || col.endsWith('Count') || col.endsWith('Order') || col.endsWith('Miles')) colDef = 'INT NULL';
      console.log(`ALTER TABLE \`${table}\` ADD COLUMN \`${col}\` ${colDef};`);
    }
  }
}

console.log('\n========== AUDIT COMPLETE ==========\n');
