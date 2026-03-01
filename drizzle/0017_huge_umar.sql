ALTER TABLE `companies` ADD `planStatus` enum('active','trialing','expired','canceled') DEFAULT 'trialing' NOT NULL;--> statement-breakpoint
ALTER TABLE `companies` ADD `planAssignedAt` bigint;--> statement-breakpoint
ALTER TABLE `companies` ADD `planExpiresAt` bigint;--> statement-breakpoint
ALTER TABLE `companies` ADD `stripeSubscriptionId` varchar(255);--> statement-breakpoint
ALTER TABLE `contractor_profiles` ADD `planStatus` enum('active','trialing','expired','canceled') DEFAULT 'trialing' NOT NULL;--> statement-breakpoint
ALTER TABLE `contractor_profiles` ADD `planAssignedAt` bigint;--> statement-breakpoint
ALTER TABLE `contractor_profiles` ADD `planExpiresAt` bigint;--> statement-breakpoint
ALTER TABLE `contractor_profiles` ADD `stripeSubscriptionId` varchar(255);