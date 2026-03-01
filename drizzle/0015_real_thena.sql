ALTER TABLE `subscription_plans` ADD `platformFeePercent` decimal(5,2);--> statement-breakpoint
ALTER TABLE `subscription_plans` ADD `perListingFeeEnabled` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `subscription_plans` ADD `perListingFeeAmount` decimal(8,2) DEFAULT '0.00' NOT NULL;--> statement-breakpoint
ALTER TABLE `subscription_plans` ADD `stripePriceIdMonthly` varchar(255);--> statement-breakpoint
ALTER TABLE `subscription_plans` ADD `stripePriceIdAnnual` varchar(255);