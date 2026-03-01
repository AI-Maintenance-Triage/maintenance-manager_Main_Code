ALTER TABLE `maintenance_requests` ADD `overridePriority` enum('low','medium','high','emergency');--> statement-breakpoint
ALTER TABLE `maintenance_requests` ADD `overrideHourlyRate` decimal(8,2);--> statement-breakpoint
ALTER TABLE `maintenance_requests` ADD `overrideReason` varchar(500);--> statement-breakpoint
ALTER TABLE `maintenance_requests` ADD `overriddenAt` timestamp;--> statement-breakpoint
ALTER TABLE `maintenance_requests` ADD `overriddenByUserId` int;