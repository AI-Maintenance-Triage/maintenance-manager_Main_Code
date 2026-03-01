CREATE TABLE `job_change_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`jobId` int NOT NULL,
	`companyId` int NOT NULL,
	`userId` int NOT NULL,
	`changeType` enum('priority_override','skill_tier_override','status_change','visibility_change') NOT NULL,
	`fromValue` varchar(255),
	`toValue` varchar(255) NOT NULL,
	`note` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `job_change_history_id` PRIMARY KEY(`id`)
);
