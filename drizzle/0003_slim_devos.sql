ALTER TABLE `maintenance_requests` MODIFY COLUMN `status` enum('open','assigned','in_progress','pending_verification','completed','verified','disputed','paid','canceled') NOT NULL DEFAULT 'open';--> statement-breakpoint
ALTER TABLE `maintenance_requests` ADD `completionNotes` text;--> statement-breakpoint
ALTER TABLE `maintenance_requests` ADD `completionPhotoUrls` json;--> statement-breakpoint
ALTER TABLE `maintenance_requests` ADD `verifiedAt` timestamp;--> statement-breakpoint
ALTER TABLE `maintenance_requests` ADD `verifiedByUserId` int;--> statement-breakpoint
ALTER TABLE `maintenance_requests` ADD `verificationNotes` text;--> statement-breakpoint
ALTER TABLE `maintenance_requests` ADD `disputeNotes` text;--> statement-breakpoint
ALTER TABLE `maintenance_requests` ADD `stripePaymentIntentId` varchar(128);--> statement-breakpoint
ALTER TABLE `maintenance_requests` ADD `paidAt` timestamp;