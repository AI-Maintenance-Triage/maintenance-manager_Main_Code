CREATE TABLE `companies` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`logoUrl` text,
	`address` text,
	`phone` varchar(32),
	`email` varchar(320),
	`stripeAccountId` varchar(128),
	`subscriptionTier` enum('free','starter','professional','enterprise') NOT NULL DEFAULT 'free',
	`subscriptionStatus` enum('active','past_due','canceled','trialing') NOT NULL DEFAULT 'trialing',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `companies_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `company_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`geofenceRadiusFeet` int NOT NULL DEFAULT 500,
	`autoClockOutMinutes` int NOT NULL DEFAULT 5,
	`maxSessionDurationHours` int NOT NULL DEFAULT 8,
	`timesheetReviewEnabled` boolean NOT NULL DEFAULT true,
	`billableTimePolicy` enum('on_site_only','full_trip','hybrid_with_cap') NOT NULL DEFAULT 'on_site_only',
	`hybridCapMinutes` int DEFAULT 30,
	`partsMarkupPercent` decimal(5,2) DEFAULT '0.00',
	`autoApproveContractors` boolean NOT NULL DEFAULT false,
	`escalationTimeoutMinutes` int DEFAULT 60,
	`platformFeePercent` decimal(5,2) DEFAULT '10.00',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `company_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `contractor_companies` (
	`id` int AUTO_INCREMENT NOT NULL,
	`contractorProfileId` int NOT NULL,
	`companyId` int NOT NULL,
	`status` enum('pending','approved','rejected','suspended') NOT NULL DEFAULT 'pending',
	`isPreferred` boolean NOT NULL DEFAULT false,
	`invitedBy` enum('company','contractor') NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `contractor_companies_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `contractor_profiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`businessName` varchar(255),
	`phone` varchar(32),
	`trades` json,
	`serviceAreaZips` json,
	`serviceRadiusMiles` int DEFAULT 25,
	`latitude` decimal(10,7),
	`longitude` decimal(10,7),
	`licenseNumber` varchar(128),
	`insuranceInfo` text,
	`stripeAccountId` varchar(128),
	`isAvailable` boolean NOT NULL DEFAULT true,
	`rating` decimal(3,2) DEFAULT '0.00',
	`completedJobs` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `contractor_profiles_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `integration_connectors` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`provider` enum('buildium','appfolio','rentmanager','yardi') NOT NULL,
	`apiKey` text,
	`apiSecret` text,
	`baseUrl` text,
	`isActive` boolean NOT NULL DEFAULT false,
	`lastSyncAt` timestamp,
	`syncStatus` enum('idle','syncing','success','error') DEFAULT 'idle',
	`syncError` text,
	`config` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `integration_connectors_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `location_pings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`timeSessionId` int NOT NULL,
	`latitude` decimal(10,7) NOT NULL,
	`longitude` decimal(10,7) NOT NULL,
	`timestamp` bigint NOT NULL,
	`locationType` enum('property','store','origin','transit','unknown') DEFAULT 'unknown',
	CONSTRAINT `location_pings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `maintenance_requests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`propertyId` int NOT NULL,
	`externalId` varchar(128),
	`source` enum('manual','buildium','appfolio','rentmanager','yardi') NOT NULL DEFAULT 'manual',
	`tenantName` varchar(255),
	`tenantPhone` varchar(32),
	`tenantEmail` varchar(320),
	`unitNumber` varchar(32),
	`title` varchar(500) NOT NULL,
	`description` text NOT NULL,
	`photoUrls` json,
	`aiPriority` enum('low','medium','high','emergency'),
	`aiSkillTier` varchar(100),
	`aiSkillTierId` int,
	`aiReasoning` text,
	`aiClassifiedAt` timestamp,
	`status` enum('open','assigned','in_progress','completed','verified','paid','canceled') NOT NULL DEFAULT 'open',
	`assignedContractorId` int,
	`assignedAt` timestamp,
	`completedAt` timestamp,
	`skillTierId` int,
	`hourlyRate` decimal(8,2),
	`isEmergency` boolean NOT NULL DEFAULT false,
	`totalLaborMinutes` int,
	`totalLaborCost` decimal(10,2),
	`totalPartsCost` decimal(10,2),
	`platformFee` decimal(10,2),
	`totalCost` decimal(10,2),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `maintenance_requests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `parts_receipts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`maintenanceRequestId` int NOT NULL,
	`contractorProfileId` int NOT NULL,
	`companyId` int NOT NULL,
	`storeName` varchar(255),
	`description` text,
	`amount` decimal(10,2) NOT NULL,
	`receiptImageUrl` text,
	`approved` boolean DEFAULT false,
	`approvedBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `parts_receipts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `properties` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`address` text NOT NULL,
	`city` varchar(128),
	`state` varchar(64),
	`zipCode` varchar(16),
	`latitude` decimal(10,7),
	`longitude` decimal(10,7),
	`units` int DEFAULT 1,
	`externalId` varchar(128),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `properties_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `skill_tiers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`name` varchar(100) NOT NULL,
	`description` text,
	`hourlyRate` decimal(8,2) NOT NULL,
	`emergencyMultiplier` decimal(4,2) DEFAULT '1.50',
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `skill_tiers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `time_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`maintenanceRequestId` int NOT NULL,
	`contractorProfileId` int NOT NULL,
	`companyId` int NOT NULL,
	`clockInTime` bigint NOT NULL,
	`clockInLat` decimal(10,7),
	`clockInLng` decimal(10,7),
	`clockInVerified` boolean DEFAULT false,
	`clockOutTime` bigint,
	`clockOutLat` decimal(10,7),
	`clockOutLng` decimal(10,7),
	`clockOutVerified` boolean DEFAULT false,
	`clockOutMethod` enum('manual','auto_geofence','auto_timeout','admin'),
	`status` enum('active','paused','completed','flagged') NOT NULL DEFAULT 'active',
	`totalMinutes` int,
	`billableMinutes` int,
	`contractorApproved` boolean,
	`contractorNotes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `time_sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`maintenanceRequestId` int NOT NULL,
	`companyId` int NOT NULL,
	`contractorProfileId` int NOT NULL,
	`laborCost` decimal(10,2) NOT NULL,
	`partsCost` decimal(10,2) DEFAULT '0.00',
	`platformFee` decimal(10,2) NOT NULL,
	`stripeFee` decimal(10,2) DEFAULT '0.00',
	`totalCharged` decimal(10,2) NOT NULL,
	`contractorPayout` decimal(10,2) NOT NULL,
	`stripePaymentIntentId` varchar(128),
	`stripeTransferId` varchar(128),
	`status` enum('pending','escrow','captured','paid_out','refunded','failed') NOT NULL DEFAULT 'pending',
	`paidAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `transactions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`openId` varchar(64) NOT NULL,
	`name` text,
	`email` varchar(320),
	`loginMethod` varchar(64),
	`role` enum('user','admin','company_admin','contractor') NOT NULL DEFAULT 'user',
	`companyId` int,
	`contractorProfileId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lastSignedIn` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_openId_unique` UNIQUE(`openId`)
);
