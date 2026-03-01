ALTER TABLE `companies` ADD `feeOverridePercent` decimal(5,2);--> statement-breakpoint
ALTER TABLE `companies` ADD `feeOverridePerListingEnabled` boolean;--> statement-breakpoint
ALTER TABLE `companies` ADD `feeOverridePerListingAmount` decimal(8,2);