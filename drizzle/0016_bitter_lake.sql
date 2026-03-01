ALTER TABLE `contractor_profiles` ADD `planId` int;--> statement-breakpoint
ALTER TABLE `contractor_profiles` ADD `planPriceOverride` decimal(10,2);--> statement-breakpoint
ALTER TABLE `contractor_profiles` ADD `planNotes` text;--> statement-breakpoint
ALTER TABLE `subscription_plans` ADD `planType` enum('company','contractor') DEFAULT 'company' NOT NULL;