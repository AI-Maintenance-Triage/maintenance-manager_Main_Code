ALTER TABLE `companies` MODIFY COLUMN `planStatus` enum('active','trialing','expired','grace_period','locked','canceled') NOT NULL DEFAULT 'trialing';--> statement-breakpoint
ALTER TABLE `contractor_profiles` MODIFY COLUMN `planStatus` enum('active','trialing','expired','grace_period','locked','canceled') NOT NULL DEFAULT 'trialing';--> statement-breakpoint
ALTER TABLE `companies` ADD `planGraceEndsAt` bigint;--> statement-breakpoint
ALTER TABLE `contractor_profiles` ADD `planGraceEndsAt` bigint;--> statement-breakpoint
ALTER TABLE `contractor_profiles` ADD `onboardingDismissedSteps` json DEFAULT ('[]');--> statement-breakpoint
ALTER TABLE `contractor_profiles` ADD `onboardingCompletedAt` bigint;