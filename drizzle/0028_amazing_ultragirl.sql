CREATE TABLE `account_credits` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`amountCents` int NOT NULL,
	`reason` text NOT NULL,
	`issuedBy` int NOT NULL,
	`appliedToJobId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `account_credits_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `account_suspensions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`targetType` varchar(32) NOT NULL,
	`targetId` int NOT NULL,
	`reason` text NOT NULL,
	`suspendedBy` int NOT NULL,
	`suspendedAt` timestamp NOT NULL DEFAULT (now()),
	`reinstatedAt` timestamp,
	`reinstatedBy` int,
	`isActive` boolean NOT NULL DEFAULT true,
	CONSTRAINT `account_suspensions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `activity_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`eventType` varchar(64) NOT NULL,
	`title` varchar(255) NOT NULL,
	`description` text,
	`actorId` int,
	`actorName` varchar(255),
	`relatedId` int,
	`relatedType` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `activity_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`actorId` int NOT NULL,
	`actorName` varchar(255) NOT NULL,
	`action` varchar(128) NOT NULL,
	`targetType` varchar(64),
	`targetId` int,
	`targetName` varchar(255),
	`details` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `dismissed_announcements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`announcementId` int NOT NULL,
	`dismissedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `dismissed_announcements_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `feature_flags` (
	`id` int AUTO_INCREMENT NOT NULL,
	`key` varchar(128) NOT NULL,
	`label` varchar(255) NOT NULL,
	`description` text,
	`enabledForCompanies` boolean NOT NULL DEFAULT true,
	`enabledForContractors` boolean NOT NULL DEFAULT true,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`updatedBy` int,
	CONSTRAINT `feature_flags_id` PRIMARY KEY(`id`),
	CONSTRAINT `feature_flags_key_unique` UNIQUE(`key`)
);
--> statement-breakpoint
CREATE TABLE `maintenance_mode` (
	`id` int AUTO_INCREMENT NOT NULL,
	`isEnabled` boolean NOT NULL DEFAULT false,
	`message` text,
	`enabledBy` int,
	`enabledAt` timestamp,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `maintenance_mode_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `payout_holds` (
	`id` int AUTO_INCREMENT NOT NULL,
	`contractorId` int NOT NULL,
	`reason` text NOT NULL,
	`placedBy` int NOT NULL,
	`placedAt` timestamp NOT NULL DEFAULT (now()),
	`releasedAt` timestamp,
	`releasedBy` int,
	`isActive` boolean NOT NULL DEFAULT true,
	CONSTRAINT `payout_holds_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `platform_announcements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(255) NOT NULL,
	`message` text NOT NULL,
	`type` varchar(32) NOT NULL DEFAULT 'info',
	`targetAudience` varchar(32) NOT NULL DEFAULT 'all',
	`isActive` boolean NOT NULL DEFAULT true,
	`expiresAt` bigint,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `platform_announcements_id` PRIMARY KEY(`id`)
);
