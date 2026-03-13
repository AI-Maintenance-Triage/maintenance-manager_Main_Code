CREATE TABLE `company_invitations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`email` varchar(320) NOT NULL,
	`token` varchar(128) NOT NULL,
	`teamRole` enum('admin','member') NOT NULL DEFAULT 'member',
	`invitedBy` int NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`acceptedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `company_invitations_id` PRIMARY KEY(`id`),
	CONSTRAINT `company_invitations_token_unique` UNIQUE(`token`)
);
--> statement-breakpoint
CREATE TABLE `company_users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`userId` int NOT NULL,
	`teamRole` enum('owner','admin','member') NOT NULL DEFAULT 'member',
	`invitedBy` int,
	`acceptedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `company_users_id` PRIMARY KEY(`id`)
);
