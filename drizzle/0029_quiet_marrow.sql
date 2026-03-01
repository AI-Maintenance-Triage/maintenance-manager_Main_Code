CREATE TABLE `password_reset_tokens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`token` varchar(255) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`usedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `password_reset_tokens_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pms_integrations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`provider` varchar(64) NOT NULL,
	`authType` varchar(32) NOT NULL,
	`credentialsJson` text,
	`webhookSecret` varchar(255),
	`status` varchar(32) NOT NULL DEFAULT 'connected',
	`lastSyncAt` timestamp,
	`lastErrorMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pms_integrations_id` PRIMARY KEY(`id`)
);
