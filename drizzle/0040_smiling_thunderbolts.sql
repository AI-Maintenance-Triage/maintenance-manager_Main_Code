ALTER TABLE `companies` ADD `pendingPlanId` int;--> statement-breakpoint
ALTER TABLE `companies` ADD `pendingBillingInterval` enum('monthly','annual');--> statement-breakpoint
ALTER TABLE `companies` ADD `pendingPlanEffectiveAt` bigint;