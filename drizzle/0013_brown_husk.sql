CREATE TABLE `subscription_plans` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`description` text,
	`priceMonthly` decimal(10,2) NOT NULL DEFAULT '0.00',
	`priceAnnual` decimal(10,2) NOT NULL DEFAULT '0.00',
	`features` json,
	`isActive` boolean NOT NULL DEFAULT true,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `subscription_plans_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `companies` ADD `planId` int;