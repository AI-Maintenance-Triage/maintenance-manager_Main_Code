CREATE TABLE `pms_webhook_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`provider` varchar(64) NOT NULL,
	`companyId` int,
	`rawPayload` json,
	`status` enum('received','processed','failed','ignored') NOT NULL DEFAULT 'received',
	`errorMessage` text,
	`createdJobId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `pms_webhook_events_id` PRIMARY KEY(`id`)
);
