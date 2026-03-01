CREATE TABLE `platform_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`platformFeePercent` decimal(5,2) NOT NULL DEFAULT '5.00',
	`perListingFeeEnabled` boolean NOT NULL DEFAULT false,
	`perListingFeeAmount` decimal(8,2) NOT NULL DEFAULT '0.00',
	`autoClockOutMinutes` int NOT NULL DEFAULT 15,
	`autoClockOutRadiusMeters` int NOT NULL DEFAULT 200,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `platform_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `companies` ADD `stripeCustomerId` varchar(128);--> statement-breakpoint
ALTER TABLE `contractor_profiles` ADD `stripeOnboardingComplete` boolean DEFAULT false NOT NULL;