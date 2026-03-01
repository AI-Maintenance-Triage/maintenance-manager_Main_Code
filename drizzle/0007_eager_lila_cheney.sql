CREATE TABLE `contractor_ratings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`maintenanceRequestId` int NOT NULL,
	`contractorProfileId` int NOT NULL,
	`companyId` int NOT NULL,
	`ratedByUserId` int NOT NULL,
	`stars` int NOT NULL,
	`review` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `contractor_ratings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `job_comments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`maintenanceRequestId` int NOT NULL,
	`authorUserId` int NOT NULL,
	`authorRole` enum('company_admin','contractor','admin') NOT NULL,
	`authorName` varchar(255),
	`message` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `job_comments_id` PRIMARY KEY(`id`)
);
