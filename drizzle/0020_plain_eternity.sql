CREATE TABLE `contractor_invites` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`email` varchar(320) NOT NULL,
	`name` varchar(255),
	`token` varchar(128) NOT NULL,
	`status` enum('pending','accepted','revoked','expired') NOT NULL DEFAULT 'pending',
	`expiresAt` bigint NOT NULL,
	`acceptedAt` bigint,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `contractor_invites_id` PRIMARY KEY(`id`),
	CONSTRAINT `contractor_invites_token_unique` UNIQUE(`token`)
);
